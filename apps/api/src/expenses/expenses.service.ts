import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TreasuryService } from '../treasury/treasury.service';
import { CreateExpenseDto } from './dto/create-expense.dto';

@Injectable()
export class ExpensesService {
  constructor(private prisma: PrismaService, private treasury: TreasuryService) {}

  findAll(userId: string, businessId?: string) {
    const where = businessId ? { businessId } : { userId };
    return this.prisma.expense.findMany({ where, orderBy: { date: 'desc' } });
  }

  async create(dto: CreateExpenseDto, userId: string, businessId?: string) {
    await this.treasury.assertExpenseAccount(dto.treasuryAccountId, userId, businessId);
    const expense = await this.prisma.expense.create({
      data: {
        category: dto.category,
        productId: dto.productId ?? null,
        channel: dto.channel ?? null,
        amount: dto.amount,
        description: dto.description ?? '',
        date: new Date(dto.date),
        treasuryAccountId: dto.treasuryAccountId || null,
        userId,
        ...(businessId ? { businessId } : {}),
      },
    });
    // Paid from an account: one of its outflows.
    if (expense.treasuryAccountId) await this.treasury.syncExpense(expense.id);
    return expense;
  }

  async update(id: string, dto: Partial<CreateExpenseDto>, userId: string, businessId?: string) {
    const expense = await this.prisma.expense.findUnique({ where: { id } });
    if (!expense) throw new NotFoundException('Dépense introuvable');
    if (businessId ? expense.businessId !== businessId : expense.userId !== userId) throw new NotFoundException('Dépense introuvable');

    if (dto.treasuryAccountId) await this.treasury.assertExpenseAccount(dto.treasuryAccountId, userId, businessId);
    const updated = await this.prisma.expense.update({
      where: { id },
      data: {
        ...(dto.treasuryAccountId !== undefined && { treasuryAccountId: dto.treasuryAccountId || null }),
        ...(dto.category !== undefined && { category: dto.category }),
        ...(dto.productId !== undefined && { productId: dto.productId ?? null }),
        ...(dto.channel !== undefined && { channel: dto.channel ?? null }),
        ...(dto.amount !== undefined && { amount: dto.amount }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.date !== undefined && { date: new Date(dto.date) }),
      },
    });
    // The account's outflow follows the expense (amount, date, account), or goes.
    if (updated.treasuryAccountId || expense.treasuryAccountId) await this.treasury.syncExpense(id);
    return updated;
  }

  async remove(id: string, userId: string, businessId?: string) {
    const expense = await this.prisma.expense.findUnique({ where: { id } });
    if (!expense) throw new NotFoundException('Dépense introuvable');
    if (businessId ? expense.businessId !== businessId : expense.userId !== userId) throw new NotFoundException('Dépense introuvable');
    await this.prisma.expense.delete({ where: { id } });
    return { id };
  }
}
