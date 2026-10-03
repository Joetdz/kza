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
        dayOfMonth: dto.dayOfMonth ?? 1,
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
        ...(dto.dayOfMonth !== undefined && { dayOfMonth: dto.dayOfMonth }),
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
   * Runs daily. For every active recurring expense whose dayOfMonth has been reached
   * this month (and hasn't already posted one this month — lastGeneratedMonth guards
   * that), creates the real Expense and advances lastGeneratedMonth. A recurring expense
   * created mid-month with dayOfMonth already in the past catches up immediately instead
   * of waiting for next month.
   */
  @Cron(CronExpression.EVERY_DAY_AT_7AM)
  async generateDueExpenses(): Promise<void> {
    const today = new Date();
    const currentMonth = today.toISOString().slice(0, 7); // "YYYY-MM"
    const todayDay = today.getDate();

    const due = await this.prisma.recurringExpense.findMany({
      where: {
        active: true,
        startDate: { lte: today },
        OR: [{ endDate: null }, { endDate: { gte: today } }],
        dayOfMonth: { lte: todayDay },
        NOT: { lastGeneratedMonth: currentMonth },
      },
    });

    for (const r of due) {
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
          data: { lastGeneratedMonth: currentMonth },
        });
        this.logger.log(`Generated recurring expense "${r.category}" (${r.amount}) for ${r.userId}/${r.businessId ?? '-'}, month ${currentMonth}`);
      } catch (err: any) {
        this.logger.warn(`Failed to generate recurring expense ${r.id}: ${err?.message}`);
      }
    }
  }
}
