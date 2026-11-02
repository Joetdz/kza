import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { CustomerHistoryService } from '../common/customer-history.service';
import { phoneKey } from '../common/phone';
import { detachStoreOrders } from './logistics.service';

const RELANCE_STATUSES = ['pending', 'dispatched', 'postponed'];
const DELETABLE_STATUSES = ['pending', 'postponed'];
// After this many relances, a customer whose order is still waiting gets no other one.
const MAX_RELANCES = 3;

@Injectable()
export class FollowUpService {
  private readonly logger = new Logger(FollowUpService.name);

  constructor(
    private prisma: PrismaService,
    private whatsapp: WhatsAppService,
    private customerHistory: CustomerHistoryService,
  ) {}

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private randomDelay() {
    // 45–90 seconds between messages — stays well under WA's spam threshold
    return this.sleep(45_000 + Math.random() * 45_000);
  }

  private fillTemplate(template: string, vars: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
  }

  private firstProductName(items: any[]): string {
    if (!items?.length) return 'votre commande';
    const name = items[0]?.product?.name ?? items[0]?.productName ?? 'votre commande';
    return items.length > 1 ? `${name} (+${items.length - 1})` : name;
  }

  // ─── Relance (non-livrées) ─────────────────────────────────────────────────

  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async runRelance() {
    this.logger.log('[followup] Running relance job');
    const configs = await this.prisma.waFollowUpConfig.findMany({ where: { relanceEnabled: true } });

    for (const config of configs) {
      try {
        await this.sendRelanceForUser(config.userId, config.relanceDelayH, config.relanceTemplate, config.businessId);
      } catch (err: any) {
        this.logger.warn(`[followup] relance error userId=${config.userId}: ${err?.message}`);
      }
    }
  }

  async sendRelanceForUser(
    userId: string,
    delayH: number,
    template: string,
    businessId: string | null = null,
    orderIds?: string[],
  ): Promise<{ sent: number; deleted: number }> {
    const DAILY_CAP = 20; // max messages per session to stay under WA limits

    const orders = (await this.relanceList(userId, businessId, delayH))
      .filter(o => !orderIds || orderIds.includes(o.id));

    let sent = 0;
    let deleted = 0;
    const messaged = new Set<string>(); // one message per customer per run, however many orders

    for (const order of orders) {
      if (order.relanceAction === 'delete') {
        if (await this.deleteAfterRelances(order)) deleted++;
        continue;
      }
      if (order.relanceAction === 'hold') continue;

      const phone = order.customerPhone!;
      const client = phoneKey(phone) ?? phone;
      if (messaged.has(client)) continue;
      if (sent >= DAILY_CAP) {
        this.logger.warn(`[followup] relance userId=${userId}: cap ${DAILY_CAP} atteint, arrêt de l'envoi`);
        continue; // orders further down may still have to be deleted
      }
      if (messaged.size > 0) await this.randomDelay();
      messaged.add(client);

      const productName = this.firstProductName(order.items as any[]);
      const num = String(order.orderNumber).padStart(4, '0');
      const message = this.fillTemplate(template, {
        nom: order.customerName,
        numero_commande: num,
        produit: productName,
      });

      // Recorded first: a relance we could not count must never go out, or the customer
      // would get one every day without ever reaching the limit.
      const entry = await this.prisma.waFollowUp.create({
        data: { userId, orderId: order.id, type: 'relance', phone, message },
      });
      const ok = await this.whatsapp.notifyOrder(userId, order.businessId ?? null, phone, message).catch(() => false);
      if (ok) sent++;
      else await this.prisma.waFollowUp.delete({ where: { id: entry.id } });
    }

    this.logger.log(`[followup] relance userId=${userId}: ${sent} sent, ${deleted} deleted, ${orders.length} listed (cap=${DAILY_CAP})`);
    return { sent, deleted };
  }

  /**
   * The orders due a relance, each with how many relances its customer has already had.
   * Only relances about the customer's open orders count: an old delivered order must
   * not get their new one deleted. A relance is due after the delay, counted from the
   * order's creation and then from its last relance.
   */
  private async relanceList(userId: string, businessId: string | null, delayH: number) {
    const cutoff = new Date(Date.now() - delayH * 3600 * 1000);
    const open = await this.prisma.manualOrder.findMany({
      where: {
        userId,
        ...(businessId ? { businessId } : {}),
        status: { in: RELANCE_STATUSES },
        isDraft: false,
        excludeFromRelance: false,
        customerPhone: { not: null },
      },
      include: { items: { include: { product: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const relances = await this.prisma.waFollowUp.findMany({
      where: { type: 'relance', orderId: { in: open.map(o => o.id) } },
      select: { orderId: true, sentAt: true },
    });

    const clientOf = (phone: string | null) => phoneKey(phone) ?? phone ?? '';
    const orderClient = new Map(open.map(o => [o.id, clientOf(o.customerPhone)]));
    const countByClient = new Map<string, number>();
    const lastByOrder = new Map<string, Date>();
    for (const r of relances) {
      const client = orderClient.get(r.orderId)!;
      countByClient.set(client, (countByClient.get(client) ?? 0) + 1);
      const last = lastByOrder.get(r.orderId);
      if (!last || r.sentAt > last) lastByOrder.set(r.orderId, r.sentAt);
    }

    return open
      .filter(o => o.createdAt <= cutoff && (lastByOrder.get(o.id) ?? o.createdAt) <= cutoff)
      .map(o => {
        const relanceCount = countByClient.get(clientOf(o.customerPhone)) ?? 0;
        // The parcel of an assigned order is with the delivery partner: it stays, but the
        // customer gets no more messages.
        const relanceAction: 'send' | 'delete' | 'hold' = relanceCount < MAX_RELANCES
          ? 'send'
          : o.status === 'dispatched' ? 'hold' : 'delete';
        return { ...o, relanceCount, relanceAction };
      });
  }

  private async deleteAfterRelances(order: {
    id: string; userId: string; orderNumber: number; customerPhone: string | null; relanceCount: number;
  }): Promise<boolean> {
    const where = { id: order.id, status: { in: DELETABLE_STATUSES }, isDraft: false };
    return this.prisma.$transaction(async tx => {
      await detachStoreOrders(tx, where);
      const { count } = await tx.manualOrder.deleteMany({ where });
      if (count === 0) return false;
      await tx.waFollowUp.create({
        data: {
          userId: order.userId,
          orderId: order.id,
          type: 'relance_deleted',
          phone: order.customerPhone ?? '',
          message: `Commande #${String(order.orderNumber).padStart(4, '0')} supprimée : toujours en attente après ${order.relanceCount} relances.`,
        },
      });
      return true;
    });
  }

  // ─── Fidélisation (livrées) ────────────────────────────────────────────────

  @Cron(CronExpression.EVERY_DAY_AT_10AM)
  async runLoyalty() {
    this.logger.log('[followup] Running loyalty job');
    const configs = await this.prisma.waFollowUpConfig.findMany({ where: { loyaltyEnabled: true } });

    for (const config of configs) {
      try {
        await this.sendLoyaltyForUser(config.userId, config.loyaltyDelayH, config.loyaltyTemplate, config.businessId);
      } catch (err: any) {
        this.logger.warn(`[followup] loyalty error userId=${config.userId}: ${err?.message}`);
      }
    }
  }

  async sendLoyaltyForUser(
    userId: string,
    delayH: number,
    template: string,
    businessId: string | null = null,
  ): Promise<number> {
    const cutoff = new Date(Date.now() - delayH * 3600 * 1000);
    const DAILY_CAP = 20;

    const orders = await this.prisma.manualOrder.findMany({
      where: {
        userId,
        ...(businessId ? { businessId } : {}),
        status: 'delivered',
        isDraft: false,
        updatedAt: { lte: cutoff },
        customerPhone: { not: null },
        NOT: { id: { in: await this.sentOrderIds(userId, 'loyalty') } },
      },
      include: { items: { include: { product: true } } },
    });

    // How many confirmed orders each customer has — lets the template thank a
    // returning buyer differently from a first-timer via {{nb_commandes}}.
    const counts = await this.customerHistory.countsForBusiness(userId, businessId);

    let sent = 0;
    for (const order of orders) {
      if (sent >= DAILY_CAP) {
        this.logger.warn(`[followup] loyalty userId=${userId}: cap ${DAILY_CAP} atteint, arrêt`);
        break;
      }
      const phone = order.customerPhone!;
      const productName = this.firstProductName(order.items as any[]);
      const num = String(order.orderNumber).padStart(4, '0');
      const orderCount = counts.get(phoneKey(phone) ?? '') ?? 1;
      const message = this.fillTemplate(template, {
        nom: order.customerName,
        numero_commande: num,
        produit: productName,
        nb_commandes: String(orderCount),
        // Ready-made phrase so a template can stay a single line
        fidelite: orderCount > 1 ? `C'est déjà votre ${orderCount}e commande chez nous 🙏` : '',
      });

      const ok = await this.whatsapp.notifyOrder(userId, order.businessId ?? null, phone, message).catch(() => false);
      if (ok) {
        await this.prisma.waFollowUp.create({
          data: { userId, orderId: order.id, type: 'loyalty', phone, message },
        }).catch(() => {});
        sent++;
      }
      if (orders.indexOf(order) < orders.length - 1) await this.randomDelay();
    }

    this.logger.log(`[followup] loyalty userId=${userId}: ${sent}/${orders.length} sent (cap=${DAILY_CAP})`);
    return sent;
  }

  // ─── Utilitaires ──────────────────────────────────────────────────────────

  private async sentOrderIds(userId: string, type: string): Promise<string[]> {
    const rows = await this.prisma.waFollowUp.findMany({
      where: { userId, type },
      select: { orderId: true },
    });
    return rows.map(r => r.orderId);
  }

  // ─── Preview (liste des destinataires sans envoyer) ───────────────────────

  async previewRelance(userId: string, businessId: string | null = null) {
    const config = await this.getConfig(userId, businessId);
    return this.relanceList(userId, businessId, config.relanceDelayH);
  }

  async previewLoyalty(userId: string, businessId: string | null = null) {
    const config = await this.getConfig(userId, businessId);
    const cutoff = new Date(Date.now() - config.loyaltyDelayH * 3600 * 1000);
    const alreadySent = await this.sentOrderIds(userId, 'loyalty');

    return this.prisma.manualOrder.findMany({
      where: {
        userId,
        ...(businessId ? { businessId } : {}),
        status: 'delivered',
        isDraft: false,
        updatedAt: { lte: cutoff },
        customerPhone: { not: null },
        NOT: { id: { in: alreadySent } },
      },
      include: { items: { include: { product: true } } },
      orderBy: { updatedAt: 'asc' },
    });
  }

  // ─── Config CRUD ──────────────────────────────────────────────────────────

  // businessId is nullable, so the (userId, businessId) unique can't drive an upsert.
  private async upsertConfig(userId: string, businessId: string | null, data: Record<string, any> = {}) {
    const existing = await this.prisma.waFollowUpConfig.findFirst({ where: { userId, businessId } });
    if (existing) {
      return Object.keys(data).length === 0
        ? existing
        : this.prisma.waFollowUpConfig.update({ where: { id: existing.id }, data });
    }
    return this.prisma.waFollowUpConfig.create({ data: { userId, businessId, ...data } });
  }

  async getConfig(userId: string, businessId: string | null = null) {
    return this.upsertConfig(userId, businessId);
  }

  async updateConfig(userId: string, data: Partial<{
    relanceEnabled: boolean;
    relanceDelayH: number;
    relanceTemplate: string;
    loyaltyEnabled: boolean;
    loyaltyDelayH: number;
    loyaltyTemplate: string;
  }>, businessId: string | null = null) {
    return this.upsertConfig(userId, businessId, data);
  }

  async getHistory(userId: string, limit = 50) {
    return this.prisma.waFollowUp.findMany({
      where: { userId },
      orderBy: { sentAt: 'desc' },
      take: limit,
    });
  }

  // Manual triggers (for UI buttons)
  async triggerRelance(userId: string, businessId: string | null = null, orderIds?: string[]) {
    const config = await this.getConfig(userId, businessId);
    if (!config.relanceEnabled) return { sent: 0, deleted: 0 };
    return this.sendRelanceForUser(userId, config.relanceDelayH, config.relanceTemplate, businessId, orderIds);
  }

  async triggerLoyalty(userId: string, businessId: string | null = null): Promise<number> {
    const config = await this.getConfig(userId, businessId);
    if (!config.loyaltyEnabled) return 0;
    return this.sendLoyaltyForUser(userId, config.loyaltyDelayH, config.loyaltyTemplate, businessId);
  }
}
