import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { averageUnitCost } from '@kza/shared';
import type { Product, StockMovement } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInventoryDto, CreateMovementDto } from './dto/create-movement.dto';
import { assertStockAvailable, lockProducts } from './stock-rules';

@Injectable()
export class MovementsService {
  constructor(private prisma: PrismaService) {}

  findAll(userId: string, businessId?: string) {
    const where = businessId ? { businessId } : { userId };
    return this.prisma.stockMovement.findMany({ where, orderBy: { date: 'desc' } });
  }

  findByProduct(productId: string, userId: string, businessId?: string) {
    const where = businessId ? { productId, businessId } : { productId, userId };
    return this.prisma.stockMovement.findMany({ where, orderBy: { date: 'desc' } });
  }

  async create(dto: CreateMovementDto, userId: string, businessId?: string) {
    return this.prisma.$transaction(async tx => {
      const product = await tx.product.findUnique({ where: { id: dto.productId } });
      if (
        !product
        || (businessId && product.businessId && product.businessId !== businessId)
        || (!businessId && product.userId !== userId)
      ) {
        throw new NotFoundException('Produit introuvable');
      }

      const stockIn = dto.type === 'in';
      await lockProducts(tx, [product.id]);
      if (!stockIn) {
        await assertStockAvailable(tx, [dto], { countReservations: false });
      }

      // A stock-in averages the product's cost with what is on hand and moves its entry
      // date forward; a backdated one leaves the date alone.
      const date = new Date(dto.date);
      await tx.product.update({
        where: { id: dto.productId },
        data: {
          quantity: { [stockIn ? 'increment' : 'decrement']: dto.quantity },
          ...(stockIn && dto.unitCost
            ? { acquisitionCost: averageUnitCost(product.quantity, product.acquisitionCost, dto.quantity, dto.unitCost) }
            : {}),
          ...(stockIn && date > product.entryDate ? { entryDate: date } : {}),
        },
      });
      return tx.stockMovement.create({
        data: {
          productId: dto.productId,
          type: dto.type,
          kind: dto.kind ?? (stockIn ? 'purchase' : 'other'),
          unitCost: stockIn ? dto.unitCost || null : product.acquisitionCost,
          quantity: dto.quantity,
          reason: dto.reason ?? '',
          date,
          userId,
          ...(businessId ? { businessId } : {}),
        },
      });
    });
  }

  /**
   * Physical count: each line sets the stock to what was counted, through a movement
   * recording the difference. The average cost does not change. A line that matches still
   * records its movement (of 0): the count is what a later recount restarts from.
   */
  async inventory(dto: CreateInventoryDto, userId: string, businessId?: string) {
    return this.prisma.$transaction(async tx => {
      const ids = [...new Set(dto.lines.map(l => l.productId))];
      if (ids.length !== dto.lines.length) throw new BadRequestException('Un même produit est compté deux fois');
      const locked = await lockProducts(tx, ids);
      const owned = new Map(locked
        .filter(p => (businessId ? !p.businessId || p.businessId === businessId : p.userId === userId))
        .map(p => [p.id, p]));
      if (owned.size !== ids.length) throw new NotFoundException('Produit introuvable');

      const date = new Date(dto.date);
      const note = dto.note?.trim();
      const products: Product[] = [];
      const movements: StockMovement[] = [];
      for (const line of dto.lines) {
        const product = owned.get(line.productId)!;
        const difference = line.countedQuantity - product.quantity;

        products.push(await tx.product.update({
          where: { id: product.id },
          data: { quantity: line.countedQuantity },
        }));
        movements.push(await tx.stockMovement.create({
          data: {
            productId: product.id,
            type: difference > 0 ? 'in' : 'out',
            kind: 'inventory',
            unitCost: product.acquisitionCost,
            countedQuantity: line.countedQuantity,
            quantity: Math.abs(difference),
            reason: `Inventaire : ${line.countedQuantity} compté(s), ${product.quantity} attendu(s)${note ? ` — ${note}` : ''}`,
            date,
            userId,
            ...(businessId ? { businessId } : {}),
          },
        }));
      }
      return { products, movements };
    }, { timeout: 60_000 });
  }
}
