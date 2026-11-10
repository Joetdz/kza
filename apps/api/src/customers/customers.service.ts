import { BadRequestException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Prisma, type Customer } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes, randomInt } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { phoneKey } from '../common/phone';

export type OtpPurpose = 'signup' | 'reset';

const OTP_TTL_MS = 10 * 60_000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_MIN_INTERVAL_MS = 60_000;
const OTP_MAX_PER_HOUR = 5;
// Codes leave from the store's own WhatsApp number: a burst of them could get it banned.
const STORE_OTP_MAX_PER_HOUR = 30;
const SESSION_TTL_MS = 60 * 24 * 3600_000;
const LOGIN_MAX_FAILURES = 5;
const LOGIN_LOCK_MS = 15 * 60_000;
const MAX_ADDRESSES = 10;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export interface AddressInput {
  label?: string;
  city?: string;
  commune?: string;
  avenue?: string;
  reference?: string;
  isDefault?: boolean;
}

/**
 * Customer accounts of the online stores: sign-up (no code for now), an account opened by
 * a first order, password reset by a code sent on WhatsApp, password login, sessions. One
 * account per number, valid on every store.
 */
@Injectable()
export class CustomersService {
  private readonly logger = new Logger(CustomersService.name);
  /** Codes sent per store over the last hour (in memory: a restart only resets the limit). */
  private readonly storeOtpLog = new Map<string, number[]>();

  constructor(private prisma: PrismaService, private whatsapp: WhatsAppService) {}

  // ── Numbers ────────────────────────────────────────────────────────────────

  /** The comparable key and the full international number WhatsApp needs. */
  normalizePhone(raw: string | undefined) {
    const key = phoneKey(raw);
    if (!key || key.length < 8) throw new BadRequestException('Numéro WhatsApp invalide.');
    // A 9-digit key is a DRC number written without its country code.
    return { key, international: key.length === 9 ? `243${key}` : key };
  }

  // ── Codes ──────────────────────────────────────────────────────────────────

  async requestOtp(rawPhone: string | undefined, purpose: OtpPurpose, storeSlug: string | undefined) {
    // Sign-up takes no code for now: only a forgotten password sends one.
    if (purpose !== 'reset') throw new BadRequestException('Demande inconnue.');
    const { key, international } = this.normalizePhone(rawPhone);

    const store = storeSlug
      ? await this.prisma.onlineStore.findUnique({ where: { slug: storeSlug } })
      : null;
    if (!store || !store.active) {
      throw new BadRequestException("Ouvre ton compte depuis une boutique : c'est elle qui t'envoie le code.");
    }

    const existing = await this.prisma.customer.findUnique({ where: { phoneKey: key }, select: { id: true } });
    // Nothing to reset: answer as if sent, so nobody can test which numbers have an account.
    if (purpose === 'reset' && !existing) return { sent: true };

    const now = Date.now();
    const recent = await this.prisma.customerOtp.findMany({
      where: { phoneKey: key, createdAt: { gte: new Date(now - 3600_000) } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    if (recent[0] && now - recent[0].createdAt.getTime() < OTP_MIN_INTERVAL_MS) {
      throw new BadRequestException('Un code vient de partir : attends une minute avant d\'en demander un autre.');
    }
    if (recent.length >= OTP_MAX_PER_HOUR) {
      throw new BadRequestException('Trop de codes demandés pour ce numéro : réessaie dans une heure.');
    }
    const sentByStore = (this.storeOtpLog.get(store.id) ?? []).filter(t => now - t < 3600_000);
    if (sentByStore.length >= STORE_OTP_MAX_PER_HOUR) {
      throw new BadRequestException('Trop de demandes en ce moment : réessaie un peu plus tard.');
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    // One code alive at a time per number and purpose.
    await this.prisma.customerOtp.updateMany({
      where: { phoneKey: key, purpose, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    const otp = await this.prisma.customerOtp.create({
      data: { phoneKey: key, purpose, codeHash: sha256(`${key}:${purpose}:${code}`), expiresAt: new Date(now + OTP_TTL_MS) },
    });

    const text = [
      `${store.name} — ton code de vérification : *${code}*`,
      '',
      `Il expire dans 10 minutes. Ne le partage avec personne, même pas avec ${store.name}.`,
    ].join('\n');
    const sent = await this.whatsapp.notifyOrder(store.userId, store.businessId ?? null, international, text).catch(() => false);
    if (!sent) {
      await this.prisma.customerOtp.delete({ where: { id: otp.id } }).catch(() => {});
      this.logger.warn(`requestOtp: store ${store.slug} could not send (WhatsApp not connected?)`);
      throw new BadRequestException("Le code n'a pas pu être envoyé pour le moment : réessaie dans quelques minutes.");
    }
    this.storeOtpLog.set(store.id, [...sentByStore, now]);
    return { sent: true };
  }

  private async consumeOtp(key: string, purpose: OtpPurpose, code: string | undefined) {
    const otp = await this.prisma.customerOtp.findFirst({
      where: { phoneKey: key, purpose, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp || otp.attempts >= OTP_MAX_ATTEMPTS) {
      throw new BadRequestException('Code expiré : demande un nouveau code.');
    }
    if (!code || sha256(`${key}:${purpose}:${code.trim()}`) !== otp.codeHash) {
      await this.prisma.customerOtp.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
      throw new BadRequestException('Code incorrect.');
    }
    // Claimed once: a second request with the same code finds it consumed.
    const { count } = await this.prisma.customerOtp.updateMany({
      where: { id: otp.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (count === 0) throw new BadRequestException('Code expiré : demande un nouveau code.');
  }

  // ── Accounts ───────────────────────────────────────────────────────────────

  // The number is not confirmed by a code for now: the account starts unverified and only
  // shows the orders placed from it (see orders).
  async signup(body: { phone?: string; name?: string; password?: string; deviceVisitorId?: string }) {
    const { key, international } = this.normalizePhone(body.phone);
    const name = body.name?.trim() ?? '';
    if (name.length < 2) throw new BadRequestException('Indique ton nom.');
    this.assertPassword(body.password);

    let customer: Customer;
    try {
      customer = await this.prisma.customer.create({
        data: { phoneKey: key, phone: `+${international}`, name, passwordHash: await bcrypt.hash(body.password!, 10) },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new BadRequestException('Ce numéro a déjà un compte : connecte-toi.');
      }
      throw err;
    }
    return this.openSession(customer, body.deviceVisitorId);
  }

  async login(body: { phone?: string; password?: string; deviceVisitorId?: string }) {
    const { key } = this.normalizePhone(body.phone);
    const customer = await this.prisma.customer.findUnique({ where: { phoneKey: key } });
    const wrong = new BadRequestException('Numéro ou mot de passe incorrect.');
    if (!customer) throw wrong;

    if (customer.lockedUntil && customer.lockedUntil > new Date()) {
      const minutes = Math.ceil((customer.lockedUntil.getTime() - Date.now()) / 60_000);
      throw new BadRequestException(`Trop d'essais : réessaie dans ${minutes} min, ou utilise « Mot de passe oublié ».`);
    }
    if (!customer.passwordHash) {
      throw new BadRequestException("Ce compte n'a pas encore de mot de passe : utilise « Mot de passe oublié » pour en choisir un.");
    }
    if (!body.password || !(await bcrypt.compare(body.password, customer.passwordHash))) {
      const failures = customer.failedLogins + 1;
      await this.prisma.customer.update({
        where: { id: customer.id },
        data: failures >= LOGIN_MAX_FAILURES
          ? { failedLogins: 0, lockedUntil: new Date(Date.now() + LOGIN_LOCK_MS) }
          : { failedLogins: failures },
      });
      throw wrong;
    }
    if (customer.failedLogins || customer.lockedUntil) {
      await this.prisma.customer.update({ where: { id: customer.id }, data: { failedLogins: 0, lockedUntil: null } });
    }
    return this.openSession(customer, body.deviceVisitorId);
  }

  async resetPassword(body: { phone?: string; code?: string; password?: string; deviceVisitorId?: string }) {
    const { key } = this.normalizePhone(body.phone);
    this.assertPassword(body.password);
    await this.consumeOtp(key, 'reset', body.code);
    const customer = await this.prisma.customer.findUnique({ where: { phoneKey: key } });
    if (!customer) throw new BadRequestException('Code expiré : demande un nouveau code.');

    const updated = await this.prisma.$transaction(async tx => {
      await tx.customerSession.deleteMany({ where: { customerId: customer.id } });
      return tx.customer.update({
        where: { id: customer.id },
        // The code reached this number: it is the customer's.
        data: { passwordHash: await bcrypt.hash(body.password!, 10), failedLogins: 0, lockedUntil: null, phoneVerified: true },
      });
    });
    return this.openSession(updated, body.deviceVisitorId);
  }

  async changePassword(customer: Customer, current: string | undefined, next: string | undefined) {
    // An account opened by an order has none yet: the first one is chosen without it.
    if (customer.passwordHash && (!current || !(await bcrypt.compare(current, customer.passwordHash)))) {
      throw new BadRequestException('Mot de passe actuel incorrect.');
    }
    this.assertPassword(next);
    // Every other device is signed out; this one gets a fresh session.
    const updated = await this.prisma.$transaction(async tx => {
      await tx.customerSession.deleteMany({ where: { customerId: customer.id } });
      return tx.customer.update({ where: { id: customer.id }, data: { passwordHash: await bcrypt.hash(next!, 10) } });
    });
    return this.openSession(updated);
  }

  async logout(authorization: string | undefined) {
    const token = this.bearer(authorization);
    if (token) await this.prisma.customerSession.deleteMany({ where: { tokenHash: sha256(token) } });
    return { ok: true };
  }

  /**
   * After an order placed without an account: a number seen for the first time gets one,
   * signed in on this device, to follow the order. A number that already has an account
   * gets no session, as anyone can type any number; a verified account still finds the
   * order by its number.
   */
  async accountForOrder(orderId: string, rawPhone: string, rawName: string, deviceVisitorId?: string) {
    const { key, international } = this.normalizePhone(rawPhone);
    const name = rawName.trim().slice(0, 100) || 'Client';
    let customer: Customer;
    try {
      customer = await this.prisma.customer.create({
        data: { phoneKey: key, phone: `+${international}`, name, passwordHash: null },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return null;
      throw err;
    }
    await this.prisma.storeOrder.update({ where: { id: orderId }, data: { customerId: customer.id } });
    return this.openSession(customer, deviceVisitorId);
  }

  private assertPassword(password: string | undefined) {
    if (!password || password.length < 6) throw new BadRequestException('Le mot de passe doit faire au moins 6 caractères.');
  }

  // ── Sessions ───────────────────────────────────────────────────────────────

  private async openSession(customer: Customer, deviceVisitorId?: string) {
    const token = randomBytes(32).toString('base64url');
    await this.prisma.customerSession.create({
      data: { customerId: customer.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
    });
    if (deviceVisitorId && UUID.test(deviceVisitorId) && deviceVisitorId !== customer.visitorId) {
      await this.mergeVisitor(deviceVisitorId, customer.visitorId).catch(err =>
        this.logger.warn(`mergeVisitor failed for ${customer.id}: ${err?.message}`));
    }
    return { token, customer: this.publicCustomer(customer) };
  }

  /**
   * Likes and follows made on this device before signing in join the account. A reel or a
   * store already liked or followed by the account counts once.
   */
  private async mergeVisitor(from: string, to: string) {
    await this.prisma.$transaction([
      this.prisma.$executeRaw`
        UPDATE product_media m SET like_count = GREATEST(0, m.like_count - 1)
        FROM product_media_likes d
        JOIN product_media_likes a ON a.media_id = d.media_id AND a.visitor_id = ${to}::uuid
        WHERE d.visitor_id = ${from}::uuid AND m.id = d.media_id`,
      this.prisma.$executeRaw`
        DELETE FROM product_media_likes d USING product_media_likes a
        WHERE d.visitor_id = ${from}::uuid AND a.visitor_id = ${to}::uuid AND a.media_id = d.media_id`,
      this.prisma.$executeRaw`UPDATE product_media_likes SET visitor_id = ${to}::uuid WHERE visitor_id = ${from}::uuid`,
      this.prisma.$executeRaw`
        DELETE FROM store_followers d USING store_followers a
        WHERE d.visitor_id = ${from}::uuid AND a.visitor_id = ${to}::uuid AND a.store_id = d.store_id`,
      this.prisma.$executeRaw`UPDATE store_followers SET visitor_id = ${to}::uuid WHERE visitor_id = ${from}::uuid`,
    ]);
  }

  private bearer(authorization: string | undefined) {
    const match = /^Bearer\s+(.+)$/i.exec(authorization ?? '');
    return match?.[1]?.trim() || null;
  }

  /** The signed-in customer, or null: for routes that also work without an account. */
  async optionalCustomer(authorization: string | undefined): Promise<Customer | null> {
    const token = this.bearer(authorization);
    if (!token) return null;
    const session = await this.prisma.customerSession.findUnique({
      where: { tokenHash: sha256(token) },
      include: { customer: true },
    });
    if (!session || session.expiresAt <= new Date()) return null;
    return session.customer;
  }

  async requireCustomer(authorization: string | undefined): Promise<Customer> {
    const customer = await this.optionalCustomer(authorization);
    if (!customer) throw new UnauthorizedException('Connecte-toi à ton compte.');
    return customer;
  }

  publicCustomer(c: Customer) {
    return {
      id: c.id, name: c.name, phone: c.phone, visitorId: c.visitorId, preferredCategories: c.preferredCategories,
      hasPassword: !!c.passwordHash,
    };
  }

  // ── Profile ────────────────────────────────────────────────────────────────

  async updateProfile(customer: Customer, body: { name?: string; preferredCategories?: string[] }) {
    const data: Prisma.CustomerUpdateInput = {};
    if (body.name !== undefined) {
      const name = body.name.trim();
      if (name.length < 2) throw new BadRequestException('Indique ton nom.');
      data.name = name;
    }
    if (body.preferredCategories !== undefined) {
      if (!Array.isArray(body.preferredCategories)) throw new BadRequestException('Préférences invalides.');
      const known = await this.prisma.productCategory.findMany({
        where: { name: { in: body.preferredCategories.map(String) }, active: true },
        select: { name: true },
      });
      data.preferredCategories = known.map(k => k.name);
    }
    const updated = await this.prisma.customer.update({ where: { id: customer.id }, data });
    return this.publicCustomer(updated);
  }

  categories() {
    return this.prisma.productCategory.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { name: true },
    }).then(rows => rows.map(r => r.name));
  }

  // ── Orders, follows ────────────────────────────────────────────────────────

  /**
   * Every store order of this customer: placed from the account and, once the number is
   * verified by a code, placed earlier with this number. An unverified account never sees
   * what others typed this number for.
   */
  async orders(customer: Customer) {
    const tail = customer.phoneKey.slice(-8);
    const rows = await this.prisma.storeOrder.findMany({
      where: customer.phoneVerified
        ? { OR: [{ customerId: customer.id }, { customerPhone: { endsWith: tail } }] }
        : { customerId: customer.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        store: { select: { name: true, slug: true, logoUrl: true, currency: true, primaryColor: true } },
        manualOrder: { select: { status: true, isDraft: true, orderNumber: true } },
      },
    });
    return rows
      .filter(o => o.customerId === customer.id || (customer.phoneVerified && phoneKey(o.customerPhone) === customer.phoneKey))
      .map(o => ({
        id: o.id,
        ref: o.id.slice(0, 8).toUpperCase(),
        createdAt: o.createdAt,
        store: o.store,
        items: o.items,
        totalAmount: o.totalAmount,
        deliveryFee: o.deliveryFee,
        deliveryZone: o.deliveryZone,
        // The Logistics order is the source of truth, as on the merchant's side.
        status: o.manualOrder ? (o.manualOrder.isDraft ? 'pending' : o.manualOrder.status) : o.status,
      }));
  }

  async following(customer: Customer) {
    const rows = await this.prisma.storeFollower.findMany({
      where: { visitorId: customer.visitorId, store: { active: true } },
      orderBy: { createdAt: 'desc' },
      include: { store: { select: { id: true, name: true, slug: true, logoUrl: true, primaryColor: true } } },
    });
    const counts = await this.prisma.storeFollower.groupBy({
      by: ['storeId'],
      where: { storeId: { in: rows.map(r => r.storeId) } },
      _count: { _all: true },
    });
    const followers = new Map(counts.map(c => [c.storeId, c._count._all]));
    return rows.map(r => ({ ...r.store, followers: followers.get(r.storeId) ?? 0 }));
  }

  // ── Addresses ──────────────────────────────────────────────────────────────

  addresses(customer: Customer) {
    return this.prisma.customerAddress.findMany({
      where: { customerId: customer.id },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async addAddress(customer: Customer, body: AddressInput) {
    const data = this.cleanAddress(body);
    const count = await this.prisma.customerAddress.count({ where: { customerId: customer.id } });
    if (count >= MAX_ADDRESSES) throw new BadRequestException(`${MAX_ADDRESSES} adresses au maximum.`);
    // The first address is the default one.
    const isDefault = body.isDefault === true || count === 0;
    return this.prisma.$transaction(async tx => {
      if (isDefault) await tx.customerAddress.updateMany({ where: { customerId: customer.id }, data: { isDefault: false } });
      return tx.customerAddress.create({ data: { ...data, city: data.city!, customerId: customer.id, isDefault } });
    });
  }

  async updateAddress(customer: Customer, id: string, body: AddressInput) {
    await this.findAddress(customer, id);
    const data = this.cleanAddress(body, true);
    return this.prisma.$transaction(async tx => {
      if (body.isDefault === true) await tx.customerAddress.updateMany({ where: { customerId: customer.id }, data: { isDefault: false } });
      return tx.customerAddress.update({ where: { id }, data: { ...data, ...(body.isDefault === true ? { isDefault: true } : {}) } });
    });
  }

  async removeAddress(customer: Customer, id: string) {
    const address = await this.findAddress(customer, id);
    await this.prisma.customerAddress.delete({ where: { id } });
    // Another address takes over as the default one.
    if (address.isDefault) {
      const next = await this.prisma.customerAddress.findFirst({ where: { customerId: customer.id }, orderBy: { createdAt: 'desc' } });
      if (next) await this.prisma.customerAddress.update({ where: { id: next.id }, data: { isDefault: true } });
    }
    return { id };
  }

  /** An address used for an order, kept unless the account already has it (or is full). */
  async rememberAddress(customerId: string, body: AddressInput) {
    const data = this.cleanAddress(body);
    const same = (a?: string | null, b?: string | null) => (a ?? '').toLowerCase() === (b ?? '').toLowerCase();
    const existing = await this.prisma.customerAddress.findMany({ where: { customerId } });
    if (existing.length >= MAX_ADDRESSES) return;
    if (existing.some(a => same(a.city, data.city) && same(a.commune, data.commune) && same(a.avenue, data.avenue))) return;
    await this.prisma.customerAddress.create({
      data: { ...data, city: data.city!, customerId, isDefault: existing.length === 0 },
    });
  }

  private async findAddress(customer: Customer, id: string) {
    const address = UUID.test(id)
      ? await this.prisma.customerAddress.findFirst({ where: { id, customerId: customer.id } })
      : null;
    if (!address) throw new NotFoundException('Adresse introuvable');
    return address;
  }

  private cleanAddress(body: AddressInput, partial = false) {
    const text = (v: unknown) => (typeof v === 'string' ? v.trim().slice(0, 200) : undefined);
    const data = {
      label: text(body.label),
      city: text(body.city),
      commune: text(body.commune),
      avenue: text(body.avenue),
      reference: text(body.reference),
    };
    if (!partial && !data.city) throw new BadRequestException('Indique la ville.');
    if (partial && data.city === '') throw new BadRequestException('Indique la ville.');
    return Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)) as Partial<typeof data>;
  }
}
