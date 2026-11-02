import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { assertStockAvailable, lockProducts, restock } from '../movements/stock-rules';

// Orders in these states hold no stock: coming back from one must find it available again.
const INACTIVE_ORDER_STATUSES = ['returned', 'fake', 'cancelled'];

// What the storefront shows for an order at this stage of its logistics.
const storeStatusFor = (status: string) =>
  status === 'fake' ? 'cancelled'
    : ['cancelled', 'returned', 'delivered'].includes(status) ? status
      : 'confirmed';

/**
 * To call before deleting orders: their storefront orders stay as a record, unlinked, and
 * show as cancelled unless already delivered. Their link would otherwise block the delete.
 */
export async function detachStoreOrders(tx: Prisma.TransactionClient, where: Prisma.ManualOrderWhereInput) {
  await tx.storeOrder.updateMany({
    where: { manualOrder: { ...where, status: { not: 'delivered' } } },
    data: { status: 'cancelled' },
  });
  await tx.storeOrder.updateMany({ where: { manualOrder: where }, data: { manualOrderId: null } });
}

interface OrderForStatus {
  id: string;
  status: string;
  isDraft: boolean;
  items: { productId: string; quantity: number }[];
}

// The single place a confirmed sale is allowed to move stock — used by the owner-side
// Logistics dashboard, the delivery-partner portal (public, token-authed), and the public
// storefront's own order status update. Before this existed, each of those three entry
// points carried its own copy of this logic; the partner-portal copy had quietly drifted
// and stopped decrementing Product.quantity, and the storefront never had one at all.
@Injectable()
export class LogisticsService {
  private readonly logger = new Logger(LogisticsService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Every business has exactly one default location — its main warehouse. Created lazily
   * on first use rather than at business-creation time, so existing businesses pick one up
   * automatically too. Name is editable afterward like any other location.
   */
  async ensureDefaultLocation(userId: string, businessId: string): Promise<{ id: string }> {
    const existing = await this.prisma.stockLocation.findFirst({
      where: { userId, businessId, isDefault: true },
      select: { id: true },
    });
    if (existing) return existing;

    return this.prisma.stockLocation.create({
      data: { userId, businessId, name: 'Entrepôt Principal', city: '', type: 'OWN', isDefault: true },
      select: { id: true },
    });
  }

  /**
   * The default location's stock is never entered by hand — it's whatever is left of each
   * product's total quantity after subtracting what's explicitly affected to every OTHER
   * location (partners, secondary warehouses). Computed on read, so it can never drift out
   * of sync with Product.quantity or with affectations made elsewhere.
   */
  async computeDefaultLocationStock(userId: string, businessId: string, defaultLocationId: string) {
    const [products, otherAllocations] = await Promise.all([
      this.prisma.product.findMany({ where: { userId, businessId } }),
      this.prisma.locationStock.groupBy({
        by: ['productId'],
        where: { locationId: { not: defaultLocationId }, product: { userId, businessId } },
        _sum: { quantity: true },
      }),
    ]);
    const affectedElsewhere = new Map(otherAllocations.map(a => [a.productId, a._sum.quantity ?? 0]));

    return products.map(product => ({
      id: `virtual-${defaultLocationId}-${product.id}`,
      locationId: defaultLocationId,
      productId: product.id,
      quantity: product.quantity - (affectedElsewhere.get(product.id) ?? 0),
      updatedAt: product.updatedAt,
      product,
    }));
  }

  /**
   * Marks a ManualOrder delivered: decrements Product.quantity, logs a StockMovement,
   * decrements LocationStock (order's own location, falling back to its partner's), and
   * records a Sale, all or nothing. Idempotent — a no-op if the order is missing or already
   * delivered, so callers don't need to guard against double-firing.
   */
  async markDelivered(orderId: string): Promise<boolean> {
    const order = await this.prisma.$transaction(async tx => {
      const order = await tx.manualOrder.findUnique({
        where: { id: orderId },
        include: { items: true, partner: { include: { location: true } }, storeOrder: true },
      });
      if (!order) return null;

      // Only one caller can flip the status: a concurrent one finds nothing left to update.
      const { count } = await tx.manualOrder.updateMany({
        where: { id: orderId, status: { not: 'delivered' } },
        data: { status: 'delivered', isDraft: false },
      });
      if (count === 0) return null;

      // Its own reservation is what is being delivered, so only what is on hand counts.
      const products = await lockProducts(tx, order.items.map(i => i.productId));
      await assertStockAvailable(tx, order.items, { countReservations: false });
      const costOf = new Map(products.map(p => [p.id, p.acquisitionCost]));

      const today = new Date().toISOString().split('T')[0];
      for (const item of order.items) {
        await tx.stockMovement.create({
          data: {
            userId: order.userId,
            businessId: order.businessId ?? null,
            productId: item.productId,
            type: 'out',
            kind: 'sale',
            unitCost: costOf.get(item.productId) ?? null,
            quantity: item.quantity,
            reason: `Commande #${order.orderNumber.toString().padStart(4, '0')} livrée`,
            date: new Date(today),
          },
        });
        await tx.product.update({
          where: { id: item.productId },
          data: { quantity: { decrement: item.quantity } },
        });
      }

      const locationId = order.locationId ?? order.partner?.location?.id ?? null;
      if (locationId) {
        for (const item of order.items) {
          await tx.locationStock.updateMany({
            where: { locationId, productId: item.productId },
            data: { quantity: { decrement: item.quantity } },
          });
        }
        await tx.locationStock.updateMany({ where: { locationId, quantity: { lt: 0 } }, data: { quantity: 0 } });
      }

      await tx.sale.create({
        data: {
          channel: 'logistics',
          date: new Date(),
          note: `Logistique #${String(order.orderNumber).padStart(4, '0')} — ${order.customerName} | Livraison: ${Number(order.deliveryFee).toLocaleString('fr-FR')} FC (partenaire)`,
          status: 'paid',
          // The order already carries its own delivery city — every logistics-sourced sale
          // should be classifiable by zone, not fall into "Non spécifiée" in Analytics.
          deliveryZone: order.city || null,
          customerName: order.customerName,
          customerPhone: order.customerPhone ?? null,
          userId: order.userId,
          businessId: order.businessId ?? null,
          manualOrderId: order.id,
          items: {
            create: order.items.map(i => ({
              productId: i.productId,
              quantity: i.quantity,
              unitPrice: Number(i.unitPrice),
              unitCost: costOf.get(i.productId) ?? null,
            })),
          },
        },
      });

      return order;
    }, { timeout: 20_000 });
    if (!order) return false;

    // Two-way link: whichever side (Logistics or the storefront dashboard) triggered
    // this, the other side should show the same status instead of drifting apart.
    if (order.storeOrder) {
      await this.prisma.storeOrder.update({
        where: { id: order.storeOrder.id },
        data: { status: 'delivered' },
      }).catch(err => this.logger.warn(`markDelivered: failed to sync storeOrder status: ${err?.message}`));
    }

    return true;
  }

  /**
   * Takes back a delivered order: cancels its sale and puts its units back in stock at the
   * cost they left at, all or nothing. A no-op if the order is not delivered any more.
   * Damaged goods then leave through a "loss" stock movement.
   */
  async markReturned(orderId: string): Promise<boolean> {
    const order = await this.prisma.$transaction(async tx => {
      const order = await tx.manualOrder.findUnique({
        where: { id: orderId },
        include: { items: true, partner: { include: { location: true } }, storeOrder: true },
      });
      if (!order) return null;

      const { count } = await tx.manualOrder.updateMany({
        where: { id: orderId, status: 'delivered' },
        data: { status: 'returned' },
      });
      if (count === 0) return null;

      await lockProducts(tx, order.items.map(i => i.productId));

      const sales = await tx.sale.findMany({ where: { manualOrderId: orderId }, include: { items: true } });
      const active = sales.filter(s => s.status === 'paid' || s.status === 'credit');
      // A sale cancelled before sales followed their order already gave its units back.
      const alreadyBack = sales.length > 0 && active.length === 0;

      if (!alreadyBack) {
        const number = order.orderNumber.toString().padStart(4, '0');
        for (const item of order.items) {
          const unitCost = active.flatMap(s => s.items).find(i => i.productId === item.productId)?.unitCost ?? null;
          await restock(tx, item.productId, item.quantity, unitCost);
          await tx.stockMovement.create({
            data: {
              userId: order.userId,
              businessId: order.businessId ?? null,
              productId: item.productId,
              type: 'in',
              kind: 'return',
              unitCost,
              quantity: item.quantity,
              reason: `Retour — commande #${number}`,
              date: new Date(),
            },
          });
        }

        const locationId = order.locationId ?? order.partner?.location?.id ?? null;
        if (locationId) {
          for (const item of order.items) {
            await tx.locationStock.updateMany({
              where: { locationId, productId: item.productId },
              data: { quantity: { increment: item.quantity } },
            });
          }
        }
      }

      await tx.sale.updateMany({ where: { id: { in: active.map(s => s.id) } }, data: { status: 'cancelled' } });
      return order;
    }, { timeout: 20_000 });
    if (!order) return false;

    if (order.storeOrder) {
      await this.prisma.storeOrder.update({
        where: { id: order.storeOrder.id },
        data: { status: 'returned' },
      }).catch(err => this.logger.warn(`markReturned: failed to sync storeOrder status: ${err?.message}`));
    }

    return true;
  }

  /** A delivered order has left the shop for good: it can only come back as a return. */
  assertCanLeaveDelivered(order: { status: string }, status: string) {
    if (order.status === 'delivered' && status !== 'delivered' && status !== 'returned') {
      throw new BadRequestException('Cette commande est déjà livrée : seul un retour est possible.');
    }
  }

  /**
   * The one place an order changes status, whoever asks: delivering and taking back move
   * stock and the sale. Any other status leaves the stock alone.
   */
  async setStatus(order: OrderForStatus, status: string, data: Prisma.ManualOrderUncheckedUpdateInput = {}) {
    this.assertCanLeaveDelivered(order, status);

    const movesStock = order.status === 'delivered' ? status === 'returned' : status === 'delivered';
    if (movesStock) {
      // First: a refused delivery must leave the order untouched.
      await (status === 'delivered' ? this.markDelivered(order.id) : this.markReturned(order.id));
      return this.prisma.manualOrder.update({ where: { id: order.id }, data });
    }

    const updated = await this.prisma.manualOrder.update({ where: { id: order.id }, data: { ...data, status } });
    await this.syncStoreStatus(order.id, status);
    return updated;
  }

  /** Confirms a draft. Its stock is checked and taken only when it is delivered. */
  async confirmDraft(order: { id: string; items: { productId: string; quantity: number }[] }) {
    const confirmed = await this.prisma.manualOrder.update({
      where: { id: order.id },
      data: { isDraft: false, status: 'pending' },
      include: { items: { include: { product: true } }, partner: true, location: true },
    });
    await this.syncStoreStatus(order.id, 'pending');
    return confirmed;
  }

  /** A status chosen on the storefront dashboard, applied to the linked logistics order. */
  async applyStoreStatus(orderId: string, status: string) {
    const order = await this.prisma.manualOrder.findUnique({ where: { id: orderId }, include: { items: true } });
    if (!order) return;
    this.assertCanLeaveDelivered(order, status);

    if (['delivered', 'returned', 'cancelled'].includes(status)) {
      await this.setStatus(order, status, { isDraft: false });
    } else if (status === 'confirmed' && order.isDraft) {
      await this.confirmDraft(order);
    } else if (['confirmed', 'pending'].includes(status) && INACTIVE_ORDER_STATUSES.includes(order.status)) {
      await this.setStatus(order, 'pending');
    }
  }

  private async syncStoreStatus(orderId: string, status: string) {
    await this.prisma.storeOrder.updateMany({
      where: { manualOrderId: orderId },
      data: { status: storeStatusFor(status) },
    }).catch(err => this.logger.warn(`syncStoreStatus: failed for order ${orderId}: ${err?.message}`));
  }
}
