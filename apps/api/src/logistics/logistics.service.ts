import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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
   * Marks a ManualOrder delivered: decrements Product.quantity, logs a StockMovement,
   * decrements LocationStock (order's own location, falling back to its partner's), and
   * records a Sale. Idempotent — a no-op if the order is missing or already delivered, so
   * callers don't need to guard against double-firing.
   */
  async markDelivered(orderId: string): Promise<boolean> {
    const order = await this.prisma.manualOrder.findUnique({
      where: { id: orderId },
      include: { items: true, partner: { include: { location: true } }, storeOrder: true },
    });
    if (!order || order.status === 'delivered') return false;

    await this.prisma.manualOrder.update({ where: { id: orderId }, data: { status: 'delivered' } });

    // Two-way link: whichever side (Logistics or the storefront dashboard) triggered
    // this, the other side should show the same status instead of drifting apart.
    if (order.storeOrder) {
      await this.prisma.storeOrder.update({
        where: { id: order.storeOrder.id },
        data: { status: 'delivered' },
      }).catch(err => this.logger.warn(`markDelivered: failed to sync storeOrder status: ${err?.message}`));
    }

    const today = new Date().toISOString().split('T')[0];
    for (const item of order.items) {
      await Promise.all([
        this.prisma.stockMovement.create({
          data: {
            userId: order.userId,
            businessId: order.businessId ?? null,
            productId: item.productId,
            type: 'out',
            quantity: item.quantity,
            reason: `Commande #${order.orderNumber.toString().padStart(4, '0')} livrée`,
            date: new Date(today),
          },
        }),
        this.prisma.product.update({
          where: { id: item.productId },
          data: { quantity: { decrement: item.quantity } },
        }),
      ]).catch(err => this.logger.warn(`markDelivered: stock update failed for product ${item.productId}: ${err?.message}`));
    }

    const locationId = order.locationId ?? order.partner?.location?.id ?? null;
    if (locationId) {
      for (const item of order.items) {
        await this.prisma.locationStock.updateMany({
          where: { locationId, productId: item.productId },
          data: { quantity: { decrement: item.quantity } },
        });
      }
    }

    await this.prisma.sale.create({
      data: {
        channel: 'logistics',
        date: new Date(),
        note: `Logistique #${String(order.orderNumber).padStart(4, '0')} — ${order.customerName} | Livraison: ${Number(order.deliveryFee).toLocaleString('fr-FR')} FC (partenaire)`,
        status: 'paid',
        customerName: order.customerName,
        customerPhone: order.customerPhone ?? null,
        userId: order.userId,
        businessId: order.businessId ?? null,
        items: {
          create: order.items.map(i => ({
            productId: i.productId,
            quantity: i.quantity,
            unitPrice: Number(i.unitPrice),
          })),
        },
      },
    });

    return true;
  }
}
