import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { hasModule, toInternationalPhone } from '@kza/shared';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';

const DAY = 24 * 3600_000;
// Don't nag: at most one automatic reminder every few days per sale.
const REMIND_EVERY_DAYS = 3;

type SaleWithCredit = {
  id: string; date: Date; dueDate: Date | null; status: string; customerName: string | null; customerPhone: string | null;
  lastReminderAt: Date | null; userId: string | null; businessId: string | null;
  items: { quantity: number; unitPrice: number }[];
  payments: { id: string; amount: number; date: Date; method: string; note: string | null }[];
  installments: { id: string; dueDate: Date; amount: number }[];
};

/** Totals of one credit sale; payments cover instalments oldest first. */
function summarize(sale: SaleWithCredit) {
  const total = round(sale.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0));
  const paid = round(sale.payments.reduce((s, p) => s + p.amount, 0));
  const remaining = Math.max(0, round(total - paid));
  let cover = paid;
  const installments = [...sale.installments]
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
    .map(i => {
      const covered = Math.min(i.amount, Math.max(0, cover));
      cover -= i.amount;
      return { ...i, covered: round(covered), settled: covered >= i.amount - 0.005 };
    });
  const nextOpen = installments.find(i => !i.settled);
  const nextDue = remaining > 0 ? (nextOpen?.dueDate ?? sale.dueDate ?? null) : null;
  const nextAmount = nextOpen ? round(nextOpen.amount - nextOpen.covered) : remaining;
  const today = startOfDay(new Date());
  const overdueDays = nextDue && nextDue < today ? Math.round((today.getTime() - nextDue.getTime()) / DAY) : 0;
  return { total, paid, remaining, installments, nextDue, nextAmount, overdueDays };
}

const round = (n: number) => Math.round(n * 100) / 100;
const startOfDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

@Injectable()
export class CreditService {
  private readonly logger = new Logger(CreditService.name);

  constructor(private prisma: PrismaService, private whatsapp: WhatsAppService) {}

  private include = { items: true, payments: { orderBy: { date: 'asc' as const } }, installments: true };

  private async findSale(id: string, userId: string, businessId: string | null) {
    const sale = await this.prisma.sale.findFirst({
      where: { id, ...(businessId ? { businessId } : { userId }) },
      include: this.include,
    });
    if (!sale) throw new NotFoundException('Vente introuvable');
    return sale;
  }

  private view(sale: SaleWithCredit) {
    const s = summarize(sale);
    return {
      id: sale.id, date: sale.date, dueDate: sale.dueDate, status: sale.status,
      customerName: sale.customerName, customerPhone: sale.customerPhone, lastReminderAt: sale.lastReminderAt,
      payments: sale.payments, ...s,
    };
  }

  /** Every credit sale still owing money, most overdue first. */
  async receivables(userId: string, businessId: string | null) {
    const sales = await this.prisma.sale.findMany({
      where: { status: 'credit', ...(businessId ? { businessId } : { userId }) },
      include: this.include,
    });
    return sales
      .map(s => this.view(s))
      .sort((a, b) => b.overdueDays - a.overdueDays || (a.nextDue?.getTime() ?? Infinity) - (b.nextDue?.getTime() ?? Infinity));
  }

  async addPayment(
    saleId: string, userId: string, businessId: string | null,
    dto: { amount: number; date: string; method?: string; note?: string },
  ) {
    const sale = await this.findSale(saleId, userId, businessId);
    if (sale.status !== 'credit') throw new BadRequestException("Cette vente n'est pas à crédit.");
    const { remaining } = summarize(sale);
    if (dto.amount <= 0) throw new BadRequestException('Le montant doit être positif.');
    if (dto.amount > remaining + 0.005) throw new BadRequestException(`Le montant dépasse le reste à payer (${remaining}).`);

    await this.prisma.salePayment.create({
      data: {
        saleId, amount: dto.amount, date: new Date(dto.date), method: dto.method ?? 'cash',
        note: dto.note?.trim() || null, userId, businessId,
      },
    });
    // Settled → an ordinary paid sale. Stock already left when it was sold on credit.
    if (dto.amount >= remaining - 0.005) {
      await this.prisma.sale.update({ where: { id: saleId }, data: { status: 'paid' } });
    }
    return this.view(await this.findSale(saleId, userId, businessId));
  }

  async removePayment(paymentId: string, userId: string, businessId: string | null) {
    const payment = await this.prisma.salePayment.findFirst({
      where: { id: paymentId, ...(businessId ? { businessId } : { userId }) },
    });
    if (!payment) throw new NotFoundException('Paiement introuvable');
    await this.prisma.salePayment.delete({ where: { id: paymentId } });
    // A sale settled by this payment owes money again.
    const sale = await this.findSale(payment.saleId, userId, businessId);
    if (sale.status === 'paid' && summarize(sale).remaining > 0) {
      await this.prisma.sale.update({ where: { id: sale.id }, data: { status: 'credit' } });
      sale.status = 'credit';
    }
    return this.view(sale);
  }

  /** Replaces the due date and/or the instalment plan of a credit sale. */
  async setSchedule(
    saleId: string, userId: string, businessId: string | null,
    dto: { dueDate?: string | null; installments: { dueDate: string; amount: number }[] },
  ) {
    const sale = await this.findSale(saleId, userId, businessId);
    const { total } = summarize(sale);
    const planned = round(dto.installments.reduce((s, i) => s + i.amount, 0));
    if (dto.installments.some(i => i.amount <= 0)) throw new BadRequestException('Chaque échéance doit avoir un montant positif.');
    if (planned > total + 0.005) throw new BadRequestException(`Les échéances (${planned}) dépassent le total de la vente (${total}).`);

    await this.prisma.$transaction([
      this.prisma.saleInstallment.deleteMany({ where: { saleId } }),
      ...dto.installments.map(i => this.prisma.saleInstallment.create({
        data: { saleId, dueDate: new Date(i.dueDate), amount: i.amount },
      })),
      this.prisma.sale.update({
        where: { id: saleId },
        data: { dueDate: dto.dueDate ? new Date(dto.dueDate) : null },
      }),
    ]);
    return this.view(await this.findSale(saleId, userId, businessId));
  }

  /** Sends the reminder now, from the "Relancer" button. */
  async remindNow(saleId: string, userId: string, businessId: string | null) {
    const sale = await this.findSale(saleId, userId, businessId);
    const sent = await this.sendReminder(sale);
    if (!sent) throw new BadRequestException("Relance impossible : pas de numéro valide, ou WhatsApp n'est pas connecté.");
    return this.view(await this.findSale(saleId, userId, businessId));
  }

  private async sendReminder(sale: SaleWithCredit): Promise<boolean> {
    if (!sale.customerPhone || !sale.userId) return false;
    const biz = sale.businessId ? await this.prisma.business.findUnique({ where: { id: sale.businessId } }) : null;
    const phone = toInternationalPhone(sale.customerPhone, biz?.country ?? 'CD');
    if (!phone) return false;
    const s = summarize(sale);
    if (s.remaining <= 0) return false;

    const money = (n: number) => formatMoney(n, biz?.currency ?? 'USD');
    const due = s.nextDue
      ? s.overdueDays > 0
        ? ` L'échéance du ${frDate(s.nextDue)} est dépassée.`
        : ` Prochaine échéance : ${money(s.nextAmount)} le ${frDate(s.nextDue)}.`
      : '';
    const text = `Bonjour${sale.customerName ? ` ${sale.customerName}` : ''} 👋\n`
      + `Petit rappel concernant votre achat du ${frDate(sale.date)} : il reste ${money(s.remaining)} à régler.${due}\n`
      + `Merci beaucoup !${biz?.name ? `\n— ${biz.name}` : ''}`;

    const ok = await this.whatsapp.notifyOrder(sale.userId, sale.businessId, phone, text).catch(() => false);
    if (ok) await this.prisma.sale.update({ where: { id: sale.id }, data: { lastReminderAt: new Date() } });
    return ok;
  }

  // Every morning: remind customers whose instalment is due tomorrow or overdue.
  @Cron('0 9 * * *', { timeZone: 'Africa/Kinshasa' })
  async dailyReminders(): Promise<void> {
    const sales = await this.prisma.sale.findMany({
      where: {
        status: 'credit',
        customerPhone: { not: null },
        OR: [{ lastReminderAt: null }, { lastReminderAt: { lt: new Date(Date.now() - REMIND_EVERY_DAYS * DAY) } }],
      },
      include: this.include,
      take: 500,
    });
    const moduleOn = new Map<string, boolean>();
    let sent = 0;
    for (const sale of sales) {
      if (sale.businessId) {
        if (!moduleOn.has(sale.businessId)) {
          const biz = await this.prisma.business.findUnique({ where: { id: sale.businessId }, select: { modules: true } });
          moduleOn.set(sale.businessId, hasModule(biz?.modules, 'credit'));
        }
        if (!moduleOn.get(sale.businessId)) continue;
      }
      const { nextDue, remaining } = summarize(sale);
      if (!nextDue || remaining <= 0) continue;
      if (nextDue.getTime() > startOfDay(new Date()).getTime() + DAY) continue; // not due by tomorrow
      if (await this.sendReminder(sale)) sent++;
    }
    if (sent) this.logger.log(`[credit] ${sent} payment reminder(s) sent`);
  }
}

function frDate(d: Date): string {
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'UTC' });
}

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${amount.toLocaleString('fr-FR')} ${currency}`;
  }
}
