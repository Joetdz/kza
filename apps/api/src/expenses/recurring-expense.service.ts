import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRecurringExpenseDto } from './dto/create-recurring-expense.dto';

@Injectable()
export class RecurringExpenseService {
  private readonly logger = new Logger(RecurringExpenseService.name);

  constructor(private prisma: PrismaService) {}

  findAll(userId: string, businessId?: string) {
    const where = businessId ? { businessId } : { userId };
    return this.prisma.recurringExpense.findMany({ where, orderBy: { createdAt: 'desc' } });
  }

  create(dto: CreateRecurringExpenseDto, userId: string, businessId?: string) {
    return this.prisma.recurringExpense.create({
      data: {
        category: dto.category,
        description: dto.description ?? '',
        amount: dto.amount,
        frequency: dto.frequency ?? 'monthly',
        dayOfWeek: dto.dayOfWeek ?? null,
        dayOfMonth: dto.dayOfMonth ?? null,
        month: dto.month ?? null,
        startDate: new Date(dto.startDate),
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        active: dto.active ?? true,
        userId,
        ...(businessId ? { businessId } : {}),
      },
    });
  }

  async update(id: string, dto: Partial<CreateRecurringExpenseDto>, userId: string, businessId?: string) {
    const r = await this.prisma.recurringExpense.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Dépense récurrente introuvable');
    if (businessId ? r.businessId !== businessId : r.userId !== userId) throw new NotFoundException('Dépense récurrente introuvable');

    return this.prisma.recurringExpense.update({
      where: { id },
      data: {
        ...(dto.category !== undefined && { category: dto.category }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.amount !== undefined && { amount: dto.amount }),
        ...(dto.frequency !== undefined && { frequency: dto.frequency }),
        ...(dto.dayOfWeek !== undefined && { dayOfWeek: dto.dayOfWeek }),
        ...(dto.dayOfMonth !== undefined && { dayOfMonth: dto.dayOfMonth }),
        ...(dto.month !== undefined && { month: dto.month }),
        ...(dto.startDate !== undefined && { startDate: new Date(dto.startDate) }),
        ...(dto.endDate !== undefined && { endDate: dto.endDate ? new Date(dto.endDate) : null }),
        ...(dto.active !== undefined && { active: dto.active }),
      },
    });
  }

  async remove(id: string, userId: string, businessId?: string) {
    const r = await this.prisma.recurringExpense.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Dépense récurrente introuvable');
    if (businessId ? r.businessId !== businessId : r.userId !== userId) throw new NotFoundException('Dépense récurrente introuvable');
    await this.prisma.recurringExpense.delete({ where: { id } });
    return { id };
  }

  /**
   * Runs daily. For every active recurring expense whose schedule is due today and
   * hasn't already posted for the current period, creates the real Expense and advances
   * lastGeneratedPeriod. The bucket key's shape (and the due check) depends on frequency:
   *  - daily:   always due; bucket = today's date, so it can't double-fire the same day.
   *  - weekly:  due when today's weekday matches dayOfWeek; bucket = today's date (the
   *             matching weekday only recurs every 7 days, so this alone prevents re-fire).
   *  - monthly: due once today's day-of-month reaches dayOfMonth; bucket = "YYYY-MM".
   *  - annual:  due once today reaches month+dayOfMonth; bucket = "YYYY".
   * A recurring expense created mid-period with its date already past catches up
   * immediately instead of waiting for the next period (monthly/annual only — weekly
   * naturally re-syncs on its own within a week, daily is always "due").
   */
  @Cron(CronExpression.EVERY_DAY_AT_7AM)
  async generateDueExpenses(): Promise<void> {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10); // "YYYY-MM-DD"
    const currentMonth = todayStr.slice(0, 7);          // "YYYY-MM"
    const currentYear = todayStr.slice(0, 4);           // "YYYY"
    const todayDay = today.getDate();
    const todayMonth = today.getMonth() + 1;
    const todayDow = today.getDay(); // 0=dimanche..6=samedi

    const candidates = await this.prisma.recurringExpense.findMany({
      where: {
        active: true,
        startDate: { lte: today },
        OR: [{ endDate: null }, { endDate: { gte: today } }],
      },
    });

    for (const r of candidates) {
      let periodKey: string;
      let isDue: boolean;

      switch (r.frequency) {
        case 'daily':
          periodKey = todayStr;
          isDue = true;
          break;
        case 'weekly':
          periodKey = todayStr;
          isDue = r.dayOfWeek === todayDow;
          break;
        case 'annual': {
          const m = r.month ?? 1;
          const d = r.dayOfMonth ?? 1;
          periodKey = currentYear;
          isDue = todayMonth > m || (todayMonth === m && todayDay >= d);
          break;
        }
        case 'monthly':
        default:
          periodKey = currentMonth;
          isDue = todayDay >= (r.dayOfMonth ?? 1);
          break;
      }

      if (!isDue || r.lastGeneratedPeriod === periodKey) continue;

      try {
        await this.prisma.expense.create({
          data: {
            category: r.category,
            amount: r.amount,
            description: r.description || 'Dépense récurrente',
            date: today,
            userId: r.userId,
            businessId: r.businessId ?? null,
          },
        });
        await this.prisma.recurringExpense.update({
          where: { id: r.id },
          data: { lastGeneratedPeriod: periodKey },
        });
        this.logger.log(`Generated recurring expense "${r.category}" (${r.amount}) [${r.frequency}] for ${r.userId}/${r.businessId ?? '-'}, period ${periodKey}`);
      } catch (err: any) {
        this.logger.warn(`Failed to generate recurring expense ${r.id}: ${err?.message}`);
      }
    }
  }
}
