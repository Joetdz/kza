import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGoalDto } from './dto/create-goal.dto';

@Injectable()
export class GoalsService {
  constructor(private prisma: PrismaService) {}

  findAll(userId: string, businessId?: string) {
    const where = businessId ? { businessId } : { userId };
    return this.prisma.salesGoal.findMany({ where, orderBy: { createdAt: 'desc' } });
  }

  create(dto: CreateGoalDto, userId: string, businessId?: string) {
    return this.prisma.salesGoal.create({
      data: { productId: dto.productId, targetQty: dto.targetQty, userId, ...(businessId ? { businessId } : {}) },
    });
  }

  async update(id: string, dto: Partial<CreateGoalDto>, userId: string, businessId?: string) {
    const goal = await this.prisma.salesGoal.findUnique({ where: { id } });
    if (!goal) throw new NotFoundException('Objectif introuvable');
    if (businessId ? goal.businessId !== businessId : goal.userId !== userId) throw new NotFoundException('Objectif introuvable');
    return this.prisma.salesGoal.update({
      where: { id },
      data: {
        ...(dto.productId !== undefined && { productId: dto.productId }),
        ...(dto.targetQty !== undefined && { targetQty: dto.targetQty }),
      },
    });
  }

  async remove(id: string, userId: string, businessId?: string) {
    const goal = await this.prisma.salesGoal.findUnique({ where: { id } });
    if (!goal) throw new NotFoundException('Objectif introuvable');
    if (businessId ? goal.businessId !== businessId : goal.userId !== userId) throw new NotFoundException('Objectif introuvable');
    await this.prisma.salesGoal.delete({ where: { id } });
    return { id };
  }
}
