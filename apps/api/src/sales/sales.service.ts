import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSaleDto } from './dto/create-sale.dto';

@Injectable()
export class SalesService {
  constructor(private prisma: PrismaService) {}

  findAll(userId: string) {
    return this.prisma.sale.findMany({
      where: { userId },
      include: { items: true },
      orderBy: { date: 'desc' },
    });
  }

  async create(dto: CreateSaleDto, userId: string) {
    // Créer la vente + items
    const sale = await this.prisma.sale.create({
      data: {
        channel: dto.channel,
        date: new Date(dto.date),
        note: dto.note ?? null,
        status: dto.status ?? 'paid',
        deliveryZone: dto.deliveryZone ?? null,
        userId,
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

    // Si payée : déduire le stock en parallèle
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
              data: {
                productId: item.productId!,
                type: 'out',
                quantity: item.quantity,
                reason: 'Vente',
                date: sale.date,
                userId,
              },
            }),
          ])
      );
    }

    return sale;
  }

  async updateStatus(id: string, newStatus: string, userId: string) {
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!sale || sale.userId !== userId) throw new NotFoundException('Vente introuvable');

    const waspaid = sale.status === 'paid';
    const becomespaid = newStatus === 'paid';

    // Mettre à jour le statut
    const updated = await this.prisma.sale.update({
      where: { id },
      data: { status: newStatus },
      include: { items: true },
    });

    const eligibleItems = sale.items.filter(i => !!i.productId);

    if (waspaid && !becomespaid) {
      // paid → autre : remettre en stock
      await Promise.all(
        eligibleItems.flatMap(item => [
          this.prisma.product.update({
            where: { id: item.productId! },
            data: { quantity: { increment: item.quantity } },
          }),
          this.prisma.stockMovement.create({
            data: {
              productId: item.productId!,
              type: 'in',
              quantity: item.quantity,
              reason: `Retour — vente ${newStatus === 'cancelled' ? 'annulée' : 'suspendue'}`,
              date: new Date(),
              userId,
            },
          }),
        ])
      );
    } else if (!waspaid && becomespaid) {
      // autre → paid : déduire du stock
      await Promise.all(
        eligibleItems.flatMap(item => [
          this.prisma.product.update({
            where: { id: item.productId! },
            data: { quantity: { decrement: item.quantity } },
          }),
          this.prisma.stockMovement.create({
            data: {
              productId: item.productId!,
              type: 'out',
              quantity: item.quantity,
              reason: 'Vente confirmée',
              date: new Date(),
              userId,
            },
          }),
        ])
      );
    }

    return updated;
  }

  async remove(id: string, userId: string) {
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!sale || sale.userId !== userId) return { id };

    await this.prisma.sale.delete({ where: { id } });

    // Si la vente était payée, remettre le stock
    if (sale.status === 'paid') {
      await Promise.all(
        sale.items
          .filter(item => !!item.productId)
          .flatMap(item => [
            this.prisma.product.update({
              where: { id: item.productId! },
              data: { quantity: { increment: item.quantity } },
            }),
            this.prisma.stockMovement.create({
              data: {
                productId: item.productId!,
                type: 'in',
                quantity: item.quantity,
                reason: 'Retour — vente supprimée',
                date: new Date(),
                userId,
              },
            }),
          ])
      );
    }

    return { id };
  }
}
