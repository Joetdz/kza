import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSaleDto } from './dto/create-sale.dto';

@Injectable()
export class SalesService {
  constructor(private prisma: PrismaService) {}

  findAll(userId: string, businessId?: string) {
    const where = businessId ? { businessId } : { userId };
    return this.prisma.sale.findMany({ where, include: { items: true }, orderBy: { date: 'desc' } });
  }

  async create(dto: CreateSaleDto, userId: string, businessId?: string) {
    const bizData = businessId ? { businessId } : {};
    const sale = await this.prisma.sale.create({
      data: {
        channel: dto.channel,
        date: new Date(dto.date),
        note: dto.note ?? null,
        status: dto.status ?? 'paid',
        deliveryZone: dto.deliveryZone ?? null,
        customerName: dto.customerName ?? null,
        customerPhone: dto.customerPhone ?? null,
        userId,
        ...bizData,
        items: {
          create: dto.items.map(i => ({
            productId: i.productId,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
          })),
        },
      },
      include: { items: true },
    });

    if (sale.status === 'paid') {
      await Promise.all(
        sale.items
          .filter(item => !!item.productId)
          .flatMap(item => [
            this.prisma.product.update({
              where: { id: item.productId! },
              data: { quantity: { decrement: item.quantity } },
            }),
            this.prisma.stockMovement.create({
              data: { productId: item.productId!, type: 'out', quantity: item.quantity, reason: 'Vente', date: sale.date, userId, ...bizData },
            }),
          ])
      );
    }

    return sale;
  }

  async updateStatus(id: string, newStatus: string, userId: string, businessId?: string) {
    const sale = await this.prisma.sale.findUnique({ where: { id }, include: { items: true } });
    if (!sale) throw new NotFoundException('Vente introuvable');
    if (businessId ? sale.businessId !== businessId : sale.userId !== userId) throw new NotFoundException('Vente introuvable');
    const bizData = businessId ? { businessId } : {};

    const waspaid = sale.status === 'paid';
    const becomespaid = newStatus === 'paid';
    const updated = await this.prisma.sale.update({ where: { id }, data: { status: newStatus }, include: { items: true } });
    const eligibleItems = sale.items.filter(i => !!i.productId);

    if (waspaid && !becomespaid) {
      await Promise.all(eligibleItems.flatMap(item => [
        this.prisma.product.update({ where: { id: item.productId! }, data: { quantity: { increment: item.quantity } } }),
        this.prisma.stockMovement.create({ data: { productId: item.productId!, type: 'in', quantity: item.quantity, reason: `Retour — vente ${newStatus === 'cancelled' ? 'annulée' : 'suspendue'}`, date: new Date(), userId, ...bizData } }),
      ]));
    } else if (!waspaid && becomespaid) {
      await Promise.all(eligibleItems.flatMap(item => [
        this.prisma.product.update({ where: { id: item.productId! }, data: { quantity: { decrement: item.quantity } } }),
        this.prisma.stockMovement.create({ data: { productId: item.productId!, type: 'out', quantity: item.quantity, reason: 'Vente confirmée', date: new Date(), userId, ...bizData } }),
      ]));
    }

    return updated;
  }

  async remove(id: string, userId: string, businessId?: string) {
    const sale = await this.prisma.sale.findUnique({ where: { id }, include: { items: true } });
    if (!sale) return { id };
    if (businessId ? sale.businessId !== businessId : sale.userId !== userId) return { id };
    const bizData = businessId ? { businessId } : {};

    await this.prisma.sale.delete({ where: { id } });
    if (sale.status === 'paid') {
      await Promise.all(
        sale.items.filter(item => !!item.productId).flatMap(item => [
          this.prisma.product.update({ where: { id: item.productId! }, data: { quantity: { increment: item.quantity } } }),
          this.prisma.stockMovement.create({ data: { productId: item.productId!, type: 'in', quantity: item.quantity, reason: 'Retour — vente supprimée', date: new Date(), userId, ...bizData } }),
        ])
      );
    }
    return { id };
  }
}
