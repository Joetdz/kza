import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import * as webpush from 'web-push';

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  url?: string;
  tag?: string;
}

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {
    webpush.setVapidDetails(
      `mailto:${this.config.get('VAPID_EMAIL', 'contact@kza.app')}`,
      this.config.get<string>('VAPID_PUBLIC_KEY')!,
      this.config.get<string>('VAPID_PRIVATE_KEY')!,
    );
  }

  async subscribe(userId: string, subscription: { endpoint: string; keys: { p256dh: string; auth: string } }) {
    return (this.prisma as any).pushSubscription.upsert({
      where: { endpoint: subscription.endpoint },
      update: { userId, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
      create: { userId, endpoint: subscription.endpoint, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
    });
  }

  async unsubscribe(endpoint: string) {
    await (this.prisma as any).pushSubscription.deleteMany({ where: { endpoint } });
  }

  async sendToUser(userId: string, payload: PushPayload): Promise<void> {
    const subs: any[] = await (this.prisma as any).pushSubscription.findMany({ where: { userId } });
    if (!subs.length) return;

    await Promise.allSettled(
      subs.map((sub: any) =>
        webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({
            ...payload,
            icon: payload.icon ?? '/pwa-192x192.png',
            badge: payload.badge ?? '/pwa-64x64.png',
          }),
        ).catch((err: any) => {
          if (err?.statusCode === 410) {
            (this.prisma as any).pushSubscription.deleteMany({ where: { endpoint: sub.endpoint } }).catch(() => {});
          }
          this.logger.warn(`Push failed: ${err?.message}`);
        }),
      ),
    );
  }

  async sendToAll(payload: PushPayload): Promise<void> {
    const subs: any[] = await (this.prisma as any).pushSubscription.findMany();
    const userIds = [...new Set<string>(subs.map((s: any) => s.userId as string))];
    await Promise.allSettled(userIds.map(uid => this.sendToUser(uid, payload)));
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  private async getSubscribedUserIds(): Promise<string[]> {
    const subs: any[] = await (this.prisma as any).pushSubscription.findMany({ select: { userId: true } });
    return [...new Set<string>(subs.map((s: any) => s.userId as string))];
  }

  private async getUserDayStats(userId: string, todayStart: Date) {
    const [salesCount, pendingWa, lowStock, salesItems] = await Promise.all([
      this.prisma.sale.count({ where: { userId: userId as any, createdAt: { gte: todayStart } } }),
      this.prisma.whatsAppContact.count({ where: { userId, isRead: false } }),
      this.prisma.product.count({ where: { userId: userId as any, quantity: { lte: 5 } } }),
      this.prisma.sale.findMany({
        where: { userId: userId as any, createdAt: { gte: todayStart } },
        include: { items: true },
      }),
    ]);
    const revenue = salesItems.reduce(
      (sum, s) => sum + s.items.reduce((si, item) => si + item.unitPrice * item.quantity, 0),
      0,
    );
    return { salesCount, revenue, pendingWa, lowStock };
  }

  // ── Cron toutes les 2h (8h → 20h, Kinshasa) ─────────────────────────────────

  @Cron('0 8,10,12,14,16,18,20 * * *', { timeZone: 'Africa/Kinshasa' })
  async biHourlyEngagement() {
    const hour = new Date().toLocaleString('en-US', {
      timeZone: 'Africa/Kinshasa',
      hour: 'numeric',
      hour12: false,
    });
    const h = parseInt(hour, 10);
    this.logger.log(`Cron biHourly — ${h}h Kinshasa`);

    const userIds = await this.getSubscribedUserIds();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    for (const userId of userIds) {
      try {
        const ctx = await this.getUserDayStats(userId, todayStart);
        const payload = this.buildPayload(h, ctx);
        if (payload) await this.sendToUser(userId, payload);
      } catch (err) {
        this.logger.warn(`biHourly failed for ${userId}: ${err}`);
      }
    }
  }

  private buildPayload(
    hour: number,
    ctx: { salesCount: number; revenue: number; pendingWa: number; lowStock: number },
  ): PushPayload | null {
    const { salesCount, revenue, pendingWa, lowStock } = ctx;
    const rev = Math.round(revenue).toLocaleString();

    if (pendingWa > 0) {
      return {
        title: '💬 Client en attente',
        body: `${pendingWa} message${pendingWa > 1 ? 's' : ''} sans réponse. Un client qui attend, c'est une vente qui part chez la concurrence.`,
        url: '/#/whatsapp',
        tag: 'wa-pending',
      };
    }

    switch (hour) {
      case 8:
        return {
          title: '☀️ C\'est parti !',
          body: salesCount > 0
            ? `Tu as déjà ${salesCount} vente${salesCount > 1 ? 's' : ''} ce matin 🔥 Continue sur ta lancée !`
            : 'La journée commence. Ouvre KZA, vérifie ton stock et prépare tes offres du jour 💪',
          url: '/#/',
          tag: 'engagement',
        };

      case 10:
        return {
          title: '📦 Check du matin',
          body: salesCount > 0
            ? `${salesCount} vente${salesCount > 1 ? 's' : ''} enregistrée${salesCount > 1 ? 's' : ''} — ${rev} de CA. Tu es sur la bonne voie 👌`
            : 'Pas encore de vente ce matin. As-tu vérifié tes messages clients ? 👀',
          url: salesCount === 0 ? '/#/whatsapp' : '/#/ventes',
          tag: 'engagement',
        };

      case 12:
        return {
          title: '🕛 Mi-journée',
          body: salesCount > 0
            ? `${salesCount} vente${salesCount > 1 ? 's' : ''} avant midi — ${rev}. Bon rythme ! Pense à enregistrer toutes tes transactions 📝`
            : 'Midi ! Aucune vente pour l\'instant. Relance tes clients WhatsApp, un message peut tout changer 💬',
          url: '/#/ventes',
          tag: 'engagement',
        };

      case 14:
        return {
          title: lowStock > 0 ? '⚠️ Stock faible' : '💰 Après la pause',
          body: lowStock > 0
            ? `${lowStock} produit${lowStock > 1 ? 's en' : ' en'} stock faible. Réapprovisionne avant de rater des ventes.`
            : salesCount > 0
              ? `${salesCount} vente${salesCount > 1 ? 's' : ''} aujourd'hui. N'oublie pas d'enregistrer les nouvelles dès qu'elles arrivent 📲`
              : 'L\'après-midi commence. C\'est le bon moment pour relancer tes prospects de ce matin 🎯',
          url: lowStock > 0 ? '/#/stock' : '/#/ventes',
          tag: 'engagement',
        };

      case 16:
        return {
          title: '📊 Point de 16h',
          body: salesCount > 0
            ? `${salesCount} vente${salesCount > 1 ? 's' : ''} aujourd'hui pour ${rev}. Il reste encore 4h — pousse encore un peu ! 🚀`
            : 'Journée encore vierge. Un message à tes clients réguliers maintenant peut sauver la journée 💪',
          url: '/#/ventes',
          tag: 'engagement',
        };

      case 18:
        return {
          title: '🌆 Fin de journée approche',
          body: salesCount > 0
            ? `Beau travail ! ${salesCount} vente${salesCount > 1 ? 's' : ''} — ${rev}. Assure-toi que tout est bien enregistré avant de fermer 📋`
            : 'La journée se termine. Enregistre tes ventes du jour maintenant pour ne rien oublier 📝',
          url: '/#/ventes',
          tag: 'engagement',
        };

      case 20:
        return {
          title: '🌙 Récap du soir',
          body: salesCount > 0
            ? `Journée terminée : ${salesCount} vente${salesCount > 1 ? 's' : ''} — ${rev} de chiffre d'affaires 🎯 Repose-toi, demain on repart !`
            : 'Pas de vente aujourd\'hui 😔 Demain c\'est une nouvelle journée — tu es à un client de ta prochaine vente !',
          url: '/#/analytique',
          tag: 'daily-recap',
        };

      default:
        return null;
    }
  }
}
