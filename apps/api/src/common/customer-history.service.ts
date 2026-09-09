import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { phoneKey } from './phone';

export interface CustomerHistory {
  /** Confirmed orders this customer has placed, drafts excluded. */
  orderCount: number;
  /** Date of the order before the current one, if any. */
  previousOrderAt: Date | null;
  /** Product of the most recent past order, when it can be named. */
  lastProduct: string | null;
}

/**
 * Repeat-customer lookup, keyed on a normalized phone rather than the raw column —
 * the same person is stored with different spellings depending on where the order
 * came from (see phoneKey).
 *
 * Drafts are excluded throughout: an unconfirmed draft is not a purchase, and counting
 * it would announce a "2nd order" to someone who has only ever ordered once.
 */
@Injectable()
export class CustomerHistoryService {
  constructor(private prisma: PrismaService) {}

  /**
   * How many confirmed orders each customer of this business has placed, keyed by
   * phoneKey. One query for the whole business, so callers can enrich a list without
   * running a query per row.
   */
  async countsForBusiness(userId: string, businessId: string | null): Promise<Map<string, number>> {
    const orders = await this.prisma.manualOrder.findMany({
      where: { userId, ...(businessId ? { businessId } : {}), isDraft: false },
      select: { customerPhone: true },
    });

    const counts = new Map<string, number>();
    for (const o of orders) {
      const key = phoneKey(o.customerPhone);
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }

  /**
   * Known details for a phone number, to prefill a new order.
   *
   * Runs on every keystroke, so it narrows in SQL first: whatever the prefix, a stored
   * number ends with the same subscriber digits as the key ("+243890635526" and
   * "0890635526" both end in "890635526"). phoneKey then confirms the shortlist.
   */
  async lookupForNewOrder(userId: string, businessId: string | null, phone: string | null) {
    const key = phoneKey(phone);
    if (!key || key.length < 6) return null; // too short to identify anyone

    const candidates = await this.prisma.manualOrder.findMany({
      where: {
        userId,
        ...(businessId ? { businessId } : {}),
        isDraft: false,
        customerPhone: { endsWith: key },
      },
      select: {
        customerName: true,
        customerPhone: true,
        city: true,
        address: true,
        deliveryFee: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    const mine = candidates.filter(o => phoneKey(o.customerPhone) === key);
    if (mine.length === 0) return null;

    const last = mine[0];
    return {
      customerName: last.customerName,
      city: last.city,
      address: last.address,
      deliveryFee: Number(last.deliveryFee),
      // From the narrowed set — enough to tell a first-timer from a regular
      orderCount: mine.length,
      lastOrderAt: last.createdAt,
    };
  }

  /**
   * Full purchase history for one customer: every confirmed order with its items, plus
   * what they buy most. Drafts stay out, same reasoning as everywhere else here.
   */
  async purchaseHistory(userId: string, businessId: string | null, phone: string | null) {
    const key = phoneKey(phone);
    if (!key) return null;

    const all = await this.prisma.manualOrder.findMany({
      where: { userId, ...(businessId ? { businessId } : {}), isDraft: false },
      include: { items: { include: { product: { select: { id: true, name: true, imageUrl: true } } } } },
      orderBy: { createdAt: 'desc' },
    });

    const orders = all.filter(o => phoneKey(o.customerPhone) === key);
    if (orders.length === 0) return null;

    // What they actually buy, most-ordered first — the useful part when deciding what
    // to offer them next.
    const products = new Map<string, { name: string; imageUrl: string | null; quantity: number; orders: number }>();
    for (const o of orders) {
      const seenInThisOrder = new Set<string>();
      for (const item of o.items) {
        const name = item.product?.name ?? 'Produit supprimé';
        const id = item.product?.id ?? name;
        const entry = products.get(id) ?? {
          name,
          imageUrl: item.product?.imageUrl ?? null,
          quantity: 0,
          orders: 0,
        };
        entry.quantity += item.quantity;
        if (!seenInThisOrder.has(id)) {
          entry.orders += 1;
          seenInThisOrder.add(id);
        }
        products.set(id, entry);
      }
    }

    const delivered = orders.filter(o => o.status === 'delivered');
    const totalSpent = delivered.reduce((sum, o) => sum + Number(o.totalAmount), 0);

    return {
      customerName: orders[0].customerName,
      customerPhone: orders[0].customerPhone,
      city: orders[0].city,
      orderCount: orders.length,
      deliveredCount: delivered.length,
      // Only delivered orders count as money actually earned
      totalSpent,
      firstOrderAt: orders[orders.length - 1].createdAt,
      lastOrderAt: orders[0].createdAt,
      topProducts: [...products.values()].sort((a, b) => b.quantity - a.quantity),
      orders: orders.map(o => ({
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        city: o.city,
        address: o.address,
        totalAmount: Number(o.totalAmount),
        deliveryFee: Number(o.deliveryFee),
        createdAt: o.createdAt,
        items: o.items.map(i => ({
          name: i.product?.name ?? 'Produit supprimé',
          imageUrl: i.product?.imageUrl ?? null,
          quantity: i.quantity,
          unitPrice: Number(i.unitPrice),
        })),
      })),
    };
  }

  /** Past-order summary for one customer, used to brief the AI before it replies. */
  async forPhone(userId: string, businessId: string | null, phone: string | null): Promise<CustomerHistory> {
    const empty: CustomerHistory = { orderCount: 0, previousOrderAt: null, lastProduct: null };
    const key = phoneKey(phone);
    if (!key) return empty;

    // customerPhone has no normalized column to filter on, so the match happens in
    // memory. Scoped to one business, this stays small.
    const orders = await this.prisma.manualOrder.findMany({
      where: { userId, ...(businessId ? { businessId } : {}), isDraft: false },
      select: {
        customerPhone: true,
        createdAt: true,
        items: { select: { product: { select: { name: true } } }, take: 1 },
      },
      orderBy: { createdAt: 'desc' },
    });

    const mine = orders.filter(o => phoneKey(o.customerPhone) === key);
    if (mine.length === 0) return empty;

    const last = mine[0];
    return {
      orderCount: mine.length,
      previousOrderAt: last.createdAt,
      lastProduct: last.items[0]?.product?.name ?? null,
    };
  }
}
