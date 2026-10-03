import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateBudgetForecastDto, SetForecastProductsDto, CreateForecastExpenseDto } from './dto/budget-forecast.dto';

// One forecast per business — get-or-create keeps the frontend from having to handle
// "no forecast yet" as a separate state. Everything downstream (revenue, COGS, ad
// budget, known recurring OPEX) is derived client-side from these inputs plus live
// product/sales/expense/recurring-expense data; this service only persists the inputs
// the owner actually types: a starting quantity per product, the growth rate, the
// horizon, and any manually-added forecast OPEX lines.
@Injectable()
export class BudgetForecastService {
  constructor(private prisma: PrismaService) {}

  async getOrCreate(userId: string, businessId?: string) {
    const where = businessId ? { userId_businessId: { userId, businessId } } : undefined;
    let forecast = where
      ? await this.prisma.budgetForecast.findUnique({
          where,
          include: { products: true, expenses: true },
        })
      : await this.prisma.budgetForecast.findFirst({
          where: { userId, businessId: null },
          include: { products: true, expenses: true },
        });

    if (!forecast) {
      forecast = await this.prisma.budgetForecast.create({
        data: { userId, businessId: businessId ?? null },
        include: { products: true, expenses: true },
      });
    }
    return forecast;
  }

  async update(dto: UpdateBudgetForecastDto, userId: string, businessId?: string) {
    const forecast = await this.getOrCreate(userId, businessId);
    return this.prisma.budgetForecast.update({
      where: { id: forecast.id },
      data: {
        ...(dto.startMonth !== undefined && { startMonth: dto.startMonth }),
        ...(dto.monthlyGrowthPct !== undefined && { monthlyGrowthPct: dto.monthlyGrowthPct }),
        ...(dto.horizonMonths !== undefined && { horizonMonths: dto.horizonMonths }),
      },
      include: { products: true, expenses: true },
    });
  }

  async setProducts(dto: SetForecastProductsDto, userId: string, businessId?: string) {
    const forecast = await this.getOrCreate(userId, businessId);
    await this.prisma.$transaction(
      dto.items.map(item =>
        this.prisma.budgetForecastProduct.upsert({
          where: { forecastId_productId: { forecastId: forecast.id, productId: item.productId } },
          create: { forecastId: forecast.id, productId: item.productId, quantity: item.quantity },
          update: { quantity: item.quantity },
        }),
      ),
    );
    return this.prisma.budgetForecast.findUnique({
      where: { id: forecast.id },
      include: { products: true, expenses: true },
    });
  }

  async addExpense(dto: CreateForecastExpenseDto, userId: string, businessId?: string) {
    const forecast = await this.getOrCreate(userId, businessId);
    return this.prisma.budgetForecastExpense.create({
      data: { forecastId: forecast.id, category: dto.category, description: dto.description ?? '', amount: dto.amount },
    });
  }

  async updateExpense(id: string, dto: Partial<CreateForecastExpenseDto>, userId: string, businessId?: string) {
    const forecast = await this.getOrCreate(userId, businessId);
    const expense = await this.prisma.budgetForecastExpense.findFirst({ where: { id, forecastId: forecast.id } });
    if (!expense) throw new NotFoundException('Ligne de budget introuvable');
    return this.prisma.budgetForecastExpense.update({
      where: { id },
      data: {
        ...(dto.category !== undefined && { category: dto.category }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.amount !== undefined && { amount: dto.amount }),
      },
    });
  }

  async removeExpense(id: string, userId: string, businessId?: string) {
    const forecast = await this.getOrCreate(userId, businessId);
    const expense = await this.prisma.budgetForecastExpense.findFirst({ where: { id, forecastId: forecast.id } });
    if (!expense) throw new NotFoundException('Ligne de budget introuvable');
    await this.prisma.budgetForecastExpense.delete({ where: { id } });
    return { id };
  }
}
