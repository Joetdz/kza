import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMovementDto } from './dto/create-movement.dto';

@Injectable()
export class MovementsService {
  constructor(private prisma: PrismaService) {}

  findAll(userId: string) {
    return this.prisma.stockMovement.findMany({
      where: { userId },
      orderBy: { date: 'desc' },
    });
  }

  findByProduct(productId: string, userId: string) {
    return this.prisma.stockMovement.findMany({
      where: { productId, userId },
      orderBy: { date: 'desc' },
    });
  }

  async create(dto: CreateMovementDto, userId: string) {
    const [movement] = await Promise.all([
      this.prisma.stockMovement.create({
        data: {
          productId: dto.productId,
          type: dto.type,
          quantity: dto.quantity,
          reason: dto.reason ?? '',
          date: new Date(dto.date),
          userId,
        },
      }),
      this.prisma.product.update({
        where: { id: dto.productId },
        data: {
          quantity: {
            [dto.type === 'in' ? 'increment' : 'decrement']: dto.quantity,
          },
        },
      }),
    ]);
    return movement;
  }
}
