import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { assertStockAvailable, lockProducts, restock } from '../movements/stock-rules';
import { CreateSaleDto } from './dto/create-sale.dto';

// A credit sale has left the shop just like a paid one: both take the stock out.
const takesStock = (status: string) => status === 'paid' || status === 'credit';

const productIdsOf = (items: { productId: string | null }[]) =>
  [...new Set(items.map(i => i.productId).filter((id): id is string => !!id))];

// Otherwise the order would still say delivered, and a later return would restock twice.
function assertNotFromOrder(sale: { manualOrderId: string | null }) {
  if (sale.manualOrderId) {
    throw new BadRequestException('Cette vente vient d\'une commande livrée : faites le retour depuis la Logistique.');
  }
}

@Injectable()
export class SalesService {
  constructor(private prisma: PrismaService) {}

  findAll(userId: string, businessId?: string) {
    const where = businessId ? { businessId } : { userId };
    return this.prisma.sale.findMany({ where, include: { items: true }, orderBy: { date: 'desc' } });
  }

  async create(dto: CreateSaleDto, userId: string, businessId?: string) {
    const bizData = businessId ? { businessId } : {};
    const status = dto.status ?? 'paid';
    return this.prisma.$transaction(async tx => {
      const products = await lockProducts(tx, productIdsOf(dto.items));
      if (status !== 'cancelled') await assertStockAvailable(tx, dto.items);

      // Freeze each line's purchase cost: later stock-ins must not change this sale's margin.
      // A pending sale only has an estimate: its cost is set again when the stock leaves.
      const costOf = new Map(products.map(p => [p.id, p.acquisitionCost]));
      const sale = await tx.sale.create({
        data: {
          channel: dto.channel,
          date: new Date(dto.date),
          note: dto.note ?? null,
          status,
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
              unitCost: costOf.get(i.productId) ?? null,
            })),
          },
        },
        include: { items: true },
      });

      if (takesStock(sale.status)) {
        for (const item of sale.items) {
          if (!item.productId) continue;
          await tx.product.update({
            where: { id: item.productId },
            data: { quantity: { decrement: item.quantity } },
          });
          await tx.stockMovement.create({
            data: { productId: item.productId, type: 'out', kind: 'sale', unitCost: item.unitCost, quantity: item.quantity, reason: 'Vente', date: sale.date, userId, ...bizData },
          });
        }
      }

      return sale;
    }, { timeout: 20_000 });
  }

  async updateStatus(id: string, newStatus: string, userId: string, businessId?: string) {
    const sale = await this.prisma.sale.findUnique({ where: { id }, include: { items: true } });
    if (!sale) throw new NotFoundException('Vente introuvable');
    if (businessId ? sale.businessId !== businessId : sale.userId !== userId) throw new NotFoundException('Vente introuvable');
    assertNotFromOrder(sale);
    const bizData = businessId ? { businessId } : {};

    const waspaid = takesStock(sale.status);
    const becomespaid = takesStock(newStatus);
    const eligibleItems = sale.items.filter(i => !!i.productId);

    return this.prisma.$transaction(async tx => {
      const products = await lockProducts(tx, productIdsOf(eligibleItems));

      if (waspaid && !becomespaid) {
        for (const item of eligibleItems) {
          await restock(tx, item.productId!, item.quantity, item.unitCost);
          await tx.stockMovement.create({ data: { productId: item.productId!, type: 'in', kind: 'return', unitCost: item.unitCost, quantity: item.quantity, reason: `Retour — vente ${newStatus === 'cancelled' ? 'annulée' : 'suspendue'}`, date: new Date(), userId, ...bizData } });
        }
      } else if (!waspaid && becomespaid) {
        await assertStockAvailable(tx, eligibleItems, { excludeSaleId: id });
        // The stock leaves now: this is the cost the sale keeps.
        const costOf = new Map(products.map(p => [p.id, p.acquisitionCost]));
        for (const item of eligibleItems) {
          const unitCost = costOf.get(item.productId!) ?? item.unitCost;
          await tx.saleItem.update({ where: { id: item.id }, data: { unitCost } });
          await tx.product.update({ where: { id: item.productId! }, data: { quantity: { decrement: item.quantity } } });
          await tx.stockMovement.create({ data: { productId: item.productId!, type: 'out', kind: 'sale', unitCost, quantity: item.quantity, reason: 'Vente confirmée', date: new Date(), userId, ...bizData } });
        }
      } else if (newStatus === 'pending' && sale.status !== 'pending') {
        // A cancelled sale coming back reserves stock again.
        await assertStockAvailable(tx, eligibleItems, { excludeSaleId: id });
      }

      return tx.sale.update({ where: { id }, data: { status: newStatus }, include: { items: true } });
    }, { timeout: 20_000 });
  }

  async remove(id: string, userId: string, businessId?: string) {
    const sale = await this.prisma.sale.findUnique({ where: { id }, include: { items: true } });
    if (!sale) return { id };
    if (businessId ? sale.businessId !== businessId : sale.userId !== userId) return { id };
    assertNotFromOrder(sale);
    const bizData = businessId ? { businessId } : {};

    await this.prisma.$transaction(async tx => {
      await lockProducts(tx, productIdsOf(sale.items));
      await tx.sale.delete({ where: { id } });
      if (takesStock(sale.status)) {
        for (const item of sale.items) {
          if (!item.productId) continue;
          await restock(tx, item.productId, item.quantity, item.unitCost);
          await tx.stockMovement.create({ data: { productId: item.productId, type: 'in', kind: 'return', unitCost: item.unitCost, quantity: item.quantity, reason: 'Retour — vente supprimée', date: new Date(), userId, ...bizData } });
        }
      }
    }, { timeout: 20_000 });
    return { id };
  }
}
