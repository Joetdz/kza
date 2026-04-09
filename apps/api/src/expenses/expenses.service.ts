import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateExpenseDto } from './dto/create-expense.dto';

@Injectable()
export class ExpensesService {
  constructor(private prisma: PrismaService) {}

  findAll(userId: string) {
    return this.prisma.expense.findMany({
      where: { userId },
      orderBy: { date: 'desc' },
    });
  }

  create(dto: CreateExpenseDto, userId: string) {
    return this.prisma.expense.create({
      data: {
        category: dto.category,
        productId: dto.productId ?? null,
        channel: dto.channel ?? null,
        amount: dto.amount,
        description: dto.description ?? '',
        date: new Date(dto.date),
        userId,
      },
    });
  }

  async update(id: string, dto: Partial<CreateExpenseDto>, userId: string) {
    const expense = await this.prisma.expense.findUnique({ where: { id } });
    if (!expense || expense.userId !== userId) throw new NotFoundException('Dépense introuvable');

    return this.prisma.expense.update({
      where: { id },
      data: {
        ...(dto.category !== undefined && { category: dto.category }),
        ...(dto.productId !== undefined && { productId: dto.productId ?? null }),
        ...(dto.channel !== undefined && { channel: dto.channel ?? null }),
        ...(dto.amount !== undefined && { amount: dto.amount }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.date !== undefined && { date: new Date(dto.date) }),
      },
    });
  }

  async remove(id: string, userId: string) {
    const expense = await this.prisma.expense.findUnique({ where: { id } });
    if (!expense || expense.userId !== userId) throw new NotFoundException('Dépense introuvable');
    await this.prisma.expense.delete({ where: { id } });
    return { id };
  }
}
