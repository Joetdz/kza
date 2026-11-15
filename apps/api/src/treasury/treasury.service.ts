import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/current-user.decorator';

export const ACCOUNT_KINDS = ['bank', 'mobile_money', 'cash'] as const;
export const ACCOUNT_CURRENCIES = ['USD', 'CDF'] as const;

/** « FC », « CDF », « usd »… → the account currency it is. */
export function normalizeCurrency(raw: string | null | undefined): string {
  const c = (raw ?? '').trim().toUpperCase();
  return c === 'FC' ? 'CDF' : c;
}

const dayOf = (raw: string | Date | undefined) => {
  const d = raw ? new Date(raw) : new Date();
  if (Number.isNaN(d.getTime())) throw new BadRequestException('Date invalide');
  return new Date(d.toISOString().slice(0, 10));
};

const positive = (raw: unknown, what = 'Montant') => {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) throw new BadRequestException(`${what} invalide`);
  return Math.round(n * 100) / 100;
};

export interface AccountInput {
  name?: string;
  kind?: string;
  accountNumber?: string | null;
  currency?: string;
  openingBalance?: number;
  openingDate?: string;
  archived?: boolean;
}

/**
 * The business's treasury: its accounts (till, mobile money, bank) and every movement of
 * money in or out. Partner payments confirmed into an account and expenses paid from one
 * make their movement here; the rest is entered by hand, transfers included.
 */
@Injectable()
export class TreasuryService {
  constructor(private prisma: PrismaService) {}

  private scope(user: AuthUser) {
    return user.businessId ? { businessId: user.businessId } : { userId: user.ownerId };
  }

  /**
   * A bank account has its number (or IBAN), a mobile money account the phone number it
   * runs on; a till needs none.
   */
  private checkKindAndNumber(kind: string | undefined, number: string | null | undefined) {
    if (!ACCOUNT_KINDS.includes(kind as any)) throw new BadRequestException('Type : banque, mobile money ou caisse physique.');
    const clean = (number ?? '').trim().slice(0, 60);
    if (kind === 'bank' && !clean) throw new BadRequestException('Indique le numéro du compte bancaire.');
    if (kind === 'mobile_money' && !clean) throw new BadRequestException('Indique le numéro mobile money du compte.');
    return clean || null;
  }

  private owner(user: AuthUser) {
    return { userId: user.ownerId, businessId: user.businessId || null };
  }

  async findAccount(user: AuthUser, id: string | undefined | null) {
    const account = id ? await this.prisma.treasuryAccount.findFirst({ where: { id, ...this.scope(user) } }) : null;
    if (!account) throw new NotFoundException('Compte introuvable');
    return account;
  }

  // ── Accounts ───────────────────────────────────────────────────────────────

  async accounts(user: AuthUser) {
    const accounts = await this.prisma.treasuryAccount.findMany({
      where: this.scope(user),
      orderBy: [{ archived: 'asc' }, { createdAt: 'asc' }],
    });
    const sums = await this.prisma.treasuryMovement.groupBy({
      by: ['accountId'],
      where: { accountId: { in: accounts.map(a => a.id) } },
      _sum: { amount: true },
    });
    const moved = new Map(sums.map(s => [s.accountId, Number(s._sum.amount ?? 0)]));
    return accounts.map(a => ({
      ...a,
      openingBalance: Number(a.openingBalance),
      balance: Math.round((Number(a.openingBalance) + (moved.get(a.id) ?? 0)) * 100) / 100,
    }));
  }

  createAccount(user: AuthUser, body: AccountInput) {
    const name = body.name?.trim();
    if (!name) throw new BadRequestException('Donne un nom au compte.');
    const currency = normalizeCurrency(body.currency || 'USD');
    if (!ACCOUNT_CURRENCIES.includes(currency as any)) throw new BadRequestException('Devise : USD ou FC.');
    const kind = body.kind ?? 'cash';
    const accountNumber = this.checkKindAndNumber(kind, body.accountNumber);
    const opening = Number(body.openingBalance ?? 0);
    if (!Number.isFinite(opening)) throw new BadRequestException('Solde de départ invalide');
    return this.prisma.treasuryAccount.create({
      data: {
        ...this.owner(user), name: name.slice(0, 80), kind, accountNumber, currency,
        openingBalance: opening, openingDate: dayOf(body.openingDate),
      },
    });
  }

  async updateAccount(user: AuthUser, id: string, body: AccountInput) {
    const account = await this.findAccount(user, id);
    const data: Prisma.TreasuryAccountUpdateInput = {};
    // Type and number go together: checked on what they will be.
    if (body.kind !== undefined || body.accountNumber !== undefined) {
      const kind = body.kind ?? account.kind;
      data.accountNumber = this.checkKindAndNumber(kind, body.accountNumber !== undefined ? body.accountNumber : account.accountNumber);
      data.kind = kind;
    }
    if (body.name !== undefined) {
      if (!body.name.trim()) throw new BadRequestException('Donne un nom au compte.');
      data.name = body.name.trim().slice(0, 80);
    }
    if (body.openingBalance !== undefined) {
      if (!Number.isFinite(Number(body.openingBalance))) throw new BadRequestException('Solde de départ invalide');
      data.openingBalance = Number(body.openingBalance);
    }
    if (body.openingDate !== undefined) data.openingDate = dayOf(body.openingDate);
    if (body.archived !== undefined) data.archived = !!body.archived;
    // The currency stays: the account's movements are in it.
    return this.prisma.treasuryAccount.update({ where: { id }, data });
  }

  /** Only an account with no movement goes; the others are archived instead. */
  async removeAccount(user: AuthUser, id: string) {
    await this.findAccount(user, id);
    const used = await this.prisma.treasuryMovement.count({ where: { accountId: id } });
    if (used > 0) throw new BadRequestException('Ce compte a des mouvements : archive-le plutôt.');
    await this.prisma.treasuryAccount.delete({ where: { id } });
    return { id };
  }

  // ── Movements ──────────────────────────────────────────────────────────────

  async movements(user: AuthUser, q: { accountId?: string; from?: string; to?: string }) {
    const rows = await this.prisma.treasuryMovement.findMany({
      where: {
        ...this.scope(user),
        ...(q.accountId ? { accountId: q.accountId } : {}),
        ...(q.from || q.to ? { date: { ...(q.from ? { gte: dayOf(q.from) } : {}), ...(q.to ? { lte: dayOf(q.to) } : {}) } } : {}),
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 1000,
      include: { account: { select: { name: true, currency: true } } },
    });
    return rows.map(r => ({ ...r, amount: Number(r.amount), date: r.date.toISOString().slice(0, 10) }));
  }

  /** Money in or out by hand: a sale paid in cash, an owner's contribution, a withdrawal… */
  async addMovement(user: AuthUser, body: { accountId?: string; direction?: 'in' | 'out'; amount?: number; date?: string; label?: string }) {
    const account = await this.findAccount(user, body.accountId);
    const amount = positive(body.amount);
    return this.prisma.treasuryMovement.create({
      data: {
        ...this.owner(user), accountId: account.id, kind: 'manual',
        amount: body.direction === 'out' ? -amount : amount,
        date: dayOf(body.date), label: (body.label ?? '').trim().slice(0, 200),
      },
    });
  }

  /**
   * From one account to another: two movements under one transferId. Across currencies
   * (a change of dollars into francs), the amount received is given as well.
   */
  async transfer(user: AuthUser, body: { fromId?: string; toId?: string; amount?: number; amountTo?: number; date?: string; label?: string }) {
    const from = await this.findAccount(user, body.fromId);
    const to = await this.findAccount(user, body.toId);
    if (from.id === to.id) throw new BadRequestException('Choisis deux comptes différents.');
    const amount = positive(body.amount);
    const received = from.currency === to.currency ? amount : positive(body.amountTo, 'Montant reçu');
    const transferId = randomUUID();
    const date = dayOf(body.date);
    const label = (body.label ?? '').trim().slice(0, 200);
    await this.prisma.$transaction([
      this.prisma.treasuryMovement.create({
        data: { ...this.owner(user), accountId: from.id, kind: 'transfer', transferId, date, amount: -amount, label: label || `Virement vers ${to.name}` },
      }),
      this.prisma.treasuryMovement.create({
        data: { ...this.owner(user), accountId: to.id, kind: 'transfer', transferId, date, amount: received, label: label || `Virement depuis ${from.name}` },
      }),
    ]);
    return { transferId };
  }

  /** A movement made by hand (or a whole transfer). The others go with their origin. */
  async removeMovement(user: AuthUser, id: string) {
    const m = await this.prisma.treasuryMovement.findFirst({ where: { id, ...this.scope(user) } });
    if (!m) throw new NotFoundException('Mouvement introuvable');
    if (m.kind === 'partner_payment') throw new BadRequestException('Ce mouvement vient d\'un versement partenaire.');
    if (m.kind === 'expense') throw new BadRequestException('Ce mouvement vient d\'une dépense : modifie ou supprime la dépense.');
    await this.prisma.treasuryMovement.deleteMany({ where: m.transferId ? { transferId: m.transferId } : { id } });
    return { id };
  }

  // ── Movements made by other parts of the app ───────────────────────────────

  /** A confirmed partner payment comes into this account. */
  async recordPartnerPayment(user: AuthUser, paymentId: string, accountId: string) {
    const account = await this.findAccount(user, accountId);
    const payment = await this.prisma.partnerPayment.findUnique({ where: { id: paymentId }, include: { partner: { select: { name: true } } } });
    if (!payment) throw new NotFoundException('Versement introuvable');
    if (normalizeCurrency(payment.currency) !== account.currency) {
      throw new BadRequestException(`Ce versement est en ${payment.currency} : choisis un compte en ${payment.currency}.`);
    }
    const data = {
      ...this.owner(user), accountId: account.id, kind: 'partner_payment',
      amount: Number(payment.amount), date: dayOf(payment.confirmedAt ?? payment.createdAt),
      label: `Versement — ${payment.partner.name}`,
    };
    return this.prisma.treasuryMovement.upsert({
      where: { partnerPaymentId: payment.id },
      create: { ...data, partnerPaymentId: payment.id },
      update: data,
    });
  }

  /** An expense paid from an account is one of its outflows; without an account, none. */
  async syncExpense(expenseId: string) {
    const e = await this.prisma.expense.findUnique({ where: { id: expenseId } });
    if (!e) return;
    if (!e.treasuryAccountId) {
      await this.prisma.treasuryMovement.deleteMany({ where: { expenseId } });
      return;
    }
    const data = {
      userId: e.userId ?? '', businessId: e.businessId, accountId: e.treasuryAccountId, kind: 'expense',
      amount: -Number(e.amount), date: e.date,
      label: [e.category, e.description].filter(Boolean).join(' — ').slice(0, 200),
    };
    await this.prisma.treasuryMovement.upsert({ where: { expenseId }, create: { ...data, expenseId }, update: data });
  }

  /** The account an expense may be paid from: one of this business's. */
  async assertExpenseAccount(accountId: string | null | undefined, userId: string, businessId?: string) {
    if (!accountId) return;
    const account = await this.prisma.treasuryAccount.findFirst({
      where: { id: accountId, ...(businessId ? { businessId } : { userId }) },
    });
    if (!account) throw new BadRequestException('Compte de trésorerie introuvable');
  }
}
