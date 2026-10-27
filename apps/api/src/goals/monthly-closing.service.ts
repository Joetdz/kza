import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  CLOSING_START_MONTH, addMonths, advanceForecast, buildClosingData, countingContext,
  forecastStartMonth, localMonth, timeZoneForCountry, type ClosingRef, type MonthlyClosing,
} from '@kza/shared';
import { PrismaService } from '../prisma/prisma.service';

const ymd = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Closes each business's months once they have ended (in the business's time zone):
 * the plan and the realized figures are frozen in monthly_closings and the forecast
 * moves on to the current month. A closed month is never written again — there is no
 * endpoint for it and the database refuses updates (migration 021).
 */
@Injectable()
export class MonthlyClosingService {
  private readonly logger = new Logger(MonthlyClosingService.name);

  constructor(private prisma: PrismaService) {}

  /** The business's current calendar month ("YYYY-MM"). */
  async currentMonth(businessId: string): Promise<string> {
    const business = await this.prisma.business.findUnique({ where: { id: businessId }, select: { country: true } });
    return localMonth(new Date(), timeZoneForCountry(business?.country));
  }

  async list(businessId: string): Promise<MonthlyClosing[]> {
    const rows = await this.prisma.monthlyClosing.findMany({ where: { businessId }, orderBy: { month: 'desc' } });
    return rows.map(r => ({ month: r.month, closedAt: r.closedAt.toISOString(), data: r.data as unknown as MonthlyClosing['data'] }));
  }

  // Every hour: months end at midnight in each business's own time zone.
  @Cron('5 * * * *')
  async closeDueMonths() {
    const forecasts = await this.prisma.budgetForecast.findMany({
      where: { businessId: { not: null } },
      select: { businessId: true },
    });
    for (const { businessId } of forecasts) {
      try {
        await this.syncBusiness(businessId!);
      } catch (e: any) {
        this.logger.error(`Clôture mensuelle ${businessId} : ${e?.message ?? e}`);
      }
    }
  }

  /**
   * Closes the months that have ended and are not closed yet, then restarts the
   * forecast at the current month. Cheap when there is nothing to do.
   */
  async syncBusiness(businessId: string): Promise<void> {
    const business = await this.prisma.business.findUnique({ where: { id: businessId }, select: { country: true } });
    if (!business) return;
    const timeZone = timeZoneForCountry(business.country);
    const now = new Date();
    const current = localMonth(now, timeZone);

    const forecast = await this.prisma.budgetForecast.findFirst({
      where: { businessId },
      include: { products: true, expenses: true },
    });
    if (!forecast) return;

    const existing = await this.prisma.monthlyClosing.findMany({
      where: { businessId },
      select: { month: true, closedAt: true },
    });
    const closed = new Set(existing.map(c => c.month));
    const first = [CLOSING_START_MONTH, localMonth(forecast.createdAt, timeZone)].sort()[1];
    const due: string[] = [];
    for (let m = first; m < current; m = addMonths(m, 1)) if (!closed.has(m)) due.push(m);

    // A forecast without a start month follows the current month: pin it to the first
    // month being closed so that each closed month gets its own share of growth.
    const plan = { ...forecast, startMonth: forecastStartMonth(forecast, due[0] ?? current) };

    if (due.length > 0) {
      const [products, sales, expenses, recurringExpenses] = await Promise.all([
        this.prisma.product.findMany({ where: { businessId }, select: { id: true, name: true, sellingPrice: true, acquisitionCost: true } }),
        this.prisma.sale.findMany({
          where: { businessId },
          select: { date: true, createdAt: true, status: true, items: { select: { productId: true, quantity: true, unitPrice: true } } },
        }),
        this.prisma.expense.findMany({ where: { businessId }, select: { date: true, createdAt: true, category: true, amount: true, productId: true } }),
        this.prisma.recurringExpense.findMany({ where: { businessId }, select: { active: true, frequency: true, amount: true, category: true, month: true } }),
      ]);
      const planSales = sales.map(s => ({ ...s, date: ymd(s.date), createdAt: s.createdAt.toISOString() }));
      const planExpenses = expenses.map(e => ({ ...e, date: ymd(e.date), createdAt: e.createdAt.toISOString() }));
      const refs: ClosingRef[] = existing.map(c => ({ month: c.month, closedAt: c.closedAt.toISOString() }));

      for (const month of due) {
        const closedAt = new Date();
        // This month counts as closed now, so that everything recorded so far is in it.
        refs.push({ month, closedAt: closedAt.toISOString() });
        const data = buildClosingData(month, {
          products, sales: planSales, expenses: planExpenses, recurringExpenses,
          forecast: plan, ctx: countingContext(refs, timeZone),
        });
        try {
          await this.prisma.monthlyClosing.create({ data: { businessId, month, closedAt, data: data as any } });
          this.logger.log(`Mois ${month} clôturé pour ${businessId}`);
        } catch (e: any) {
          if (e?.code !== 'P2002') throw e; // already closed by a concurrent run
        }
      }
    }

    // Restart the forecast at the current month, keeping every projected figure.
    if (plan.startMonth < current) {
      const next = advanceForecast(plan, current, current);
      await this.prisma.$transaction([
        this.prisma.budgetForecast.update({ where: { id: forecast.id }, data: { startMonth: next.startMonth } }),
        ...next.products.map(p => this.prisma.budgetForecastProduct.update({
          where: { forecastId_productId: { forecastId: forecast.id, productId: p.productId } },
          data: { quantity: p.quantity, adBudgetOverride: p.adBudgetOverride },
        })),
      ]);
    }
  }
}
