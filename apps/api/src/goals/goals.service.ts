import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGoalDto } from './dto/create-goal.dto';

@Injectable()
export class GoalsService {
  constructor(private prisma: PrismaService) {}

  findAll(userId: string) {
    return this.prisma.salesGoal.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  create(dto: CreateGoalDto, userId: string) {
    return this.prisma.salesGoal.create({
      data: {
        productId: dto.productId,
        targetQty: dto.targetQty,
        userId,
      },
    });
  }

  async update(id: string, dto: Partial<CreateGoalDto>, userId: string) {
    const goal = await this.prisma.salesGoal.findUnique({ where: { id } });
    if (!goal || goal.userId !== userId) throw new NotFoundException('Objectif introuvable');

    return this.prisma.salesGoal.update({
      where: { id },
      data: {
        ...(dto.productId !== undefined && { productId: dto.productId }),
        ...(dto.targetQty !== undefined && { targetQty: dto.targetQty }),
      },
    });
  }

  async remove(id: string, userId: string) {
    const goal = await this.prisma.salesGoal.findUnique({ where: { id } });
    if (!goal || goal.userId !== userId) throw new NotFoundException('Objectif introuvable');
    await this.prisma.salesGoal.delete({ where: { id } });
    return { id };
  }
}
