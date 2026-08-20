import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { AiService } from '../whatsapp/ai.service';

@Injectable()
export class FollowUpService {
  private readonly logger = new Logger(FollowUpService.name);

  constructor(
    private prisma: PrismaService,
    private whatsapp: WhatsAppService,
    private ai: AiService,
  ) {}

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private randomDelay() {
    // 2–4 minutes between messages → stays well under 20/hour
    return this.sleep(120_000 + Math.random() * 120_000);
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
        await this.sendRelanceForUser(config.userId, config.relanceDelayH, config.relanceTemplate);
      } catch (err: any) {
        this.logger.warn(`[followup] relance error userId=${config.userId}: ${err?.message}`);
      }
    }
  }

  async sendRelanceForUser(userId: string, delayH: number, template: string): Promise<number> {
    const cutoff = new Date(Date.now() - delayH * 3600 * 1000);
    const now = new Date();

    const alreadySentIds = await this.sentOrderIds(userId, 'relance');

    const orders = await this.prisma.manualOrder.findMany({
      where: {
        userId,
        status: { in: ['pending', 'dispatched', 'postponed'] },
        isDraft: false,
        excludeFromRelance: false,
        createdAt: { lte: cutoff },
        customerPhone: { not: null },
        NOT: { id: { in: alreadySentIds } },
      },
      include: { items: { include: { product: true } } },
    });

    // Filtre relance différée en JS (évite les conflits OR+NOT dans Prisma)
    const eligible = orders.filter(o => {
      const scheduled = (o as any).relanceScheduledAt as Date | null;
      return !scheduled || scheduled <= now;
    });

    let sent = 0;
    for (let i = 0; i < eligible.length; i++) {
      const order = eligible[i];
      const phone = order.customerPhone!;
      const productName = this.firstProductName(order.items as any[]);
      const num = String(order.orderNumber).padStart(4, '0');

      // Générer un message AI basé sur la conversation, sinon fallback template
      let message: string | null = null;
      if (order.sourceContactId) {
        const history = await this.prisma.whatsAppMessage.findMany({
          where: { contactId: order.sourceContactId },
          orderBy: { sentAt: 'asc' },
          take: 20,
          select: { direction: true, content: true },
        });
        if (history.length > 0) {
          message = await this.ai.generateRelanceMessage(history, {
            customerName: order.customerName,
            productName,
            orderNumber: num,
          });
        }
      }

      if (!message) {
        message = this.fillTemplate(template, {
          nom: order.customerName,
          numero_commande: num,
          produit: productName,
        });
      }

      const ok = await this.whatsapp.notifyOrder(userId, phone, message).catch(() => false);
      if (ok) {
        await this.prisma.waFollowUp.create({
          data: { userId, orderId: order.id, type: 'relance', phone, message },
        }).catch(() => {});
        sent++;
      }
      if (i < eligible.length - 1) await this.randomDelay();
    }

    this.logger.log(`[followup] relance userId=${userId}: ${sent}/${eligible.length} sent`);
    return sent;
  }

  // ─── Fidélisation (livrées) ────────────────────────────────────────────────

  @Cron(CronExpression.EVERY_DAY_AT_10AM)
  async runLoyalty() {
    this.logger.log('[followup] Running loyalty job');
    const configs = await this.prisma.waFollowUpConfig.findMany({ where: { loyaltyEnabled: true } });

    for (const config of configs) {
      try {
        await this.sendLoyaltyForUser(config.userId, config.loyaltyDelayH, config.loyaltyTemplate);
      } catch (err: any) {
        this.logger.warn(`[followup] loyalty error userId=${config.userId}: ${err?.message}`);
      }
    }
  }

  async sendLoyaltyForUser(userId: string, delayH: number, template: string): Promise<number> {
    const cutoff = new Date(Date.now() - delayH * 3600 * 1000);

    const orders = await this.prisma.manualOrder.findMany({
      where: {
        userId,
        status: 'delivered',
        isDraft: false,
        updatedAt: { lte: cutoff },
        customerPhone: { not: null },
        NOT: { id: { in: await this.sentOrderIds(userId, 'loyalty') } },
      },
      include: { items: { include: { product: true } } },
    });

    let sent = 0;
    for (const order of orders) {
      const phone = order.customerPhone!;
      const productName = this.firstProductName(order.items as any[]);
      const num = String(order.orderNumber).padStart(4, '0');
      const message = this.fillTemplate(template, {
        nom: order.customerName,
        numero_commande: num,
        produit: productName,
      });

      const ok = await this.whatsapp.notifyOrder(userId, phone, message).catch(() => false);
      if (ok) {
        await this.prisma.waFollowUp.create({
          data: { userId, orderId: order.id, type: 'loyalty', phone, message },
        }).catch(() => {});
        sent++;
      }
      if (orders.indexOf(order) < orders.length - 1) await this.randomDelay();
    }

    this.logger.log(`[followup] loyalty userId=${userId}: ${sent}/${orders.length} sent`);
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

  async previewRelance(userId: string) {
    const config = await this.getConfig(userId);
    const cutoff = new Date(Date.now() - config.relanceDelayH * 3600 * 1000);
    const alreadySent = await this.sentOrderIds(userId, 'relance');

    return this.prisma.manualOrder.findMany({
      where: {
        userId,
        status: { in: ['pending', 'dispatched', 'postponed'] },
        isDraft: false,
        createdAt: { lte: cutoff },
        customerPhone: { not: null },
        NOT: { id: { in: alreadySent } },
      },
      include: { items: { include: { product: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async previewLoyalty(userId: string) {
    const config = await this.getConfig(userId);
    const cutoff = new Date(Date.now() - config.loyaltyDelayH * 3600 * 1000);
    const alreadySent = await this.sentOrderIds(userId, 'loyalty');

    return this.prisma.manualOrder.findMany({
      where: {
        userId,
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

  async getConfig(userId: string) {
    return this.prisma.waFollowUpConfig.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
  }

  async updateConfig(userId: string, data: Partial<{
    relanceEnabled: boolean;
    relanceDelayH: number;
    relanceTemplate: string;
    loyaltyEnabled: boolean;
    loyaltyDelayH: number;
    loyaltyTemplate: string;
  }>) {
    return this.prisma.waFollowUpConfig.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
  }

  async getHistory(userId: string, limit = 50) {
    return this.prisma.waFollowUp.findMany({
      where: { userId },
      orderBy: { sentAt: 'desc' },
      take: limit,
    });
  }

  // Manual triggers (for UI buttons)
  async triggerRelance(userId: string): Promise<number> {
    const config = await this.getConfig(userId);
    if (!config.relanceEnabled) return 0;
    return this.sendRelanceForUser(userId, config.relanceDelayH, config.relanceTemplate);
  }

  async triggerLoyalty(userId: string): Promise<number> {
    const config = await this.getConfig(userId);
    if (!config.loyaltyEnabled) return 0;
    return this.sendLoyaltyForUser(userId, config.loyaltyDelayH, config.loyaltyTemplate);
  }
}
