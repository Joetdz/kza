import { ConflictException, Inject, Injectable, Logger, NotFoundException, forwardRef } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  COUNTRY_INFO, addDays, hasModule, localToUtc, minutesToTime, timeToMinutes, timeZoneForCountry, utcToLocal,
} from '@kza/shared';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { AgendaSettingsDto, CreateAppointmentDto, UpdateAppointmentDto } from './dto/agenda.dto';

type OpeningRange = { day: number; from: string; to: string };
type Appt = { startAt: Date; endAt: Date; resource: string | null; id: string };

const WEEKDAYS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
// Appointments that no longer hold their slot.
const FREE_STATUSES = ['cancelled'];

@Injectable()
export class AgendaService {
  private readonly logger = new Logger(AgendaService.name);

  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => WhatsAppService)) private whatsapp: WhatsAppService,
  ) {}

  // ── Settings ───────────────────────────────────────────────────────────────

  private async business(businessId: string | null) {
    return businessId ? this.prisma.business.findUnique({ where: { id: businessId } }) : null;
  }

  async getSettings(userId: string, businessId: string | null) {
    const [saved, biz] = await Promise.all([
      this.prisma.agendaSettings.findFirst({ where: { userId, businessId } }),
      this.business(businessId),
    ]);
    const timeZone = timeZoneForCountry(biz?.country);
    if (saved) return { ...saved, timeZone };
    // Not configured yet: sensible defaults the owner adjusts, Monday–Saturday 9h–18h.
    return {
      openingHours: [1, 2, 3, 4, 5, 6].map(day => ({ day, from: '09:00', to: '18:00' })),
      slotMinutes: 30, defaultDurationMinutes: 60, resources: [], capacity: 1, reminderHours: 24,
      timeZone, configured: false,
    };
  }

  async saveSettings(userId: string, businessId: string | null, dto: AgendaSettingsDto) {
    const data = {
      openingHours: dto.openingHours.filter(r => timeToMinutes(r.from) < timeToMinutes(r.to)) as any,
      slotMinutes: dto.slotMinutes,
      defaultDurationMinutes: dto.defaultDurationMinutes,
      resources: [...new Set(dto.resources.map(r => r.trim()).filter(Boolean))],
      capacity: dto.capacity,
      reminderHours: dto.reminderHours,
    };
    const existing = await this.prisma.agendaSettings.findFirst({ where: { userId, businessId } });
    if (existing) await this.prisma.agendaSettings.update({ where: { id: existing.id }, data });
    else await this.prisma.agendaSettings.create({ data: { userId, businessId, ...data } });
    return this.getSettings(userId, businessId);
  }

  // ── Appointments ───────────────────────────────────────────────────────────

  async list(userId: string, businessId: string | null, from: string, to: string) {
    const { timeZone } = await this.getSettings(userId, businessId);
    return this.prisma.appointment.findMany({
      where: {
        userId, businessId,
        startAt: { gte: localToUtc(from, '00:00', timeZone), lt: localToUtc(addDays(to, 1), '00:00', timeZone) },
      },
      orderBy: { startAt: 'asc' },
    });
  }

  private async overlapping(userId: string, businessId: string | null, startAt: Date, endAt: Date, excludeId?: string): Promise<Appt[]> {
    return this.prisma.appointment.findMany({
      where: {
        userId, businessId,
        status: { notIn: FREE_STATUSES },
        startAt: { lt: endAt },
        endAt: { gt: startAt },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true, startAt: true, endAt: true, resource: true },
    });
  }

  /**
   * Which resource can take [startAt, endAt): the requested one if free, else the first
   * free one. No resources configured → anything under capacity. null = slot taken.
   */
  private pickResource(
    settings: { resources: string[]; capacity: number },
    busy: Appt[],
    startAt: Date,
    endAt: Date,
    wanted?: string | null,
  ): { ok: boolean; resource: string | null } {
    const clash = busy.filter(a => a.startAt < endAt && a.endAt > startAt);
    if (settings.resources.length === 0) {
      return { ok: clash.length < settings.capacity, resource: null };
    }
    const taken = new Set(clash.map(a => a.resource));
    const candidates = wanted ? [wanted] : settings.resources;
    const free = candidates.find(r => !taken.has(r));
    return { ok: !!free, resource: free ?? null };
  }

  private async durationFor(productId: string | null | undefined, explicit: number | undefined, fallback: number) {
    if (explicit) return explicit;
    if (productId) {
      const product = await this.prisma.product.findUnique({ where: { id: productId }, select: { durationMinutes: true } });
      if (product?.durationMinutes) return product.durationMinutes;
    }
    return fallback;
  }

  async create(
    userId: string,
    businessId: string | null,
    dto: CreateAppointmentDto,
    extra: { source?: string; contactId?: string | null } = {},
  ) {
    const settings = await this.getSettings(userId, businessId);
    const duration = await this.durationFor(dto.productId, dto.durationMinutes, settings.defaultDurationMinutes);
    const startAt = localToUtc(dto.date, dto.time, settings.timeZone);
    const endAt = new Date(startAt.getTime() + duration * 60000);

    const busy = await this.overlapping(userId, businessId, startAt, endAt);
    const pick = this.pickResource(settings, busy, startAt, endAt, dto.resource || null);
    if (!pick.ok) throw new ConflictException('Ce créneau est déjà pris.');

    const product = dto.productId
      ? await this.prisma.product.findFirst({ where: { id: dto.productId, userId }, select: { name: true } })
      : null;

    return this.prisma.appointment.create({
      data: {
        userId, businessId,
        customerName: dto.customerName.trim() || 'Client',
        customerPhone: dto.customerPhone?.trim() || null,
        contactId: extra.contactId ?? null,
        productId: product ? dto.productId : null,
        serviceName: product?.name ?? null,
        resource: pick.resource,
        startAt, endAt,
        source: extra.source ?? 'manual',
        notes: dto.notes?.trim() || null,
      },
    });
  }

  async update(userId: string, businessId: string | null, id: string, dto: UpdateAppointmentDto) {
    const appt = await this.prisma.appointment.findFirst({ where: { id, userId, businessId } });
    if (!appt) throw new NotFoundException('Rendez-vous introuvable');

    let startAt = appt.startAt;
    let endAt = appt.endAt;
    let resource = dto.resource !== undefined ? (dto.resource || null) : appt.resource;
    const rescheduled = !!(dto.date && dto.time) || dto.durationMinutes !== undefined || dto.resource !== undefined;
    const reopening = dto.status === 'confirmed' && appt.status === 'cancelled';

    if (rescheduled || reopening) {
      const settings = await this.getSettings(userId, businessId);
      if (dto.date && dto.time) startAt = localToUtc(dto.date, dto.time, settings.timeZone);
      const duration = dto.durationMinutes ?? Math.round((appt.endAt.getTime() - appt.startAt.getTime()) / 60000);
      endAt = new Date(startAt.getTime() + duration * 60000);
      const busy = await this.overlapping(userId, businessId, startAt, endAt, appt.id);
      const pick = this.pickResource(settings, busy, startAt, endAt, resource);
      if (!pick.ok) throw new ConflictException('Ce créneau est déjà pris.');
      resource = pick.resource;
    }

    return this.prisma.appointment.update({
      where: { id },
      data: {
        startAt, endAt, resource,
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.notes !== undefined && { notes: dto.notes || null }),
        ...(dto.customerName !== undefined && { customerName: dto.customerName }),
        ...(dto.customerPhone !== undefined && { customerPhone: dto.customerPhone || null }),
        // A moved appointment deserves a fresh reminder.
        ...(startAt.getTime() !== appt.startAt.getTime() && { reminderSentAt: null }),
      },
    });
  }

  async remove(userId: string, businessId: string | null, id: string) {
    const appt = await this.prisma.appointment.findFirst({ where: { id, userId, businessId } });
    if (!appt) throw new NotFoundException('Rendez-vous introuvable');
    await this.prisma.appointment.delete({ where: { id } });
    return { id };
  }

  // ── Availability ───────────────────────────────────────────────────────────

  /** Free start times ("HH:MM", local) on one day for a booking of `durationMinutes`. */
  async availability(
    userId: string,
    businessId: string | null,
    date: string,
    opts: { productId?: string; durationMinutes?: number; resource?: string } = {},
  ): Promise<string[]> {
    const settings = await this.getSettings(userId, businessId);
    const duration = await this.durationFor(opts.productId, opts.durationMinutes, settings.defaultDurationMinutes);
    return this.freeSlots(userId, businessId, settings, date, duration, opts.resource);
  }

  private async freeSlots(
    userId: string,
    businessId: string | null,
    settings: { openingHours: any; slotMinutes: number; resources: string[]; capacity: number; timeZone: string },
    date: string,
    duration: number,
    resource?: string,
  ): Promise<string[]> {
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    const ranges = (settings.openingHours as OpeningRange[]).filter(r => r.day === weekday);
    if (ranges.length === 0) return [];

    const dayStart = localToUtc(date, '00:00', settings.timeZone);
    const dayEnd = localToUtc(addDays(date, 1), '00:00', settings.timeZone);
    const busy = await this.overlapping(userId, businessId, dayStart, dayEnd);
    const now = Date.now();

    const slots: string[] = [];
    for (const range of ranges) {
      const end = timeToMinutes(range.to);
      for (let t = timeToMinutes(range.from); t + duration <= end; t += settings.slotMinutes) {
        const time = minutesToTime(t);
        const startAt = localToUtc(date, time, settings.timeZone);
        if (startAt.getTime() <= now) continue;
        const endAt = new Date(startAt.getTime() + duration * 60000);
        if (this.pickResource(settings, busy, startAt, endAt, resource).ok) slots.push(time);
      }
    }
    return slots;
  }

  // ── WhatsApp AI booking ────────────────────────────────────────────────────

  /**
   * What the AI needs to take bookings: services with their length and the free
   * slots of the coming days. null when the business doesn't use the agenda or
   * hasn't set its opening hours — the AI then behaves exactly as before.
   */
  async bookingBrief(userId: string, businessId: string | null): Promise<string | null> {
    const biz = await this.business(businessId);
    if (businessId && !hasModule(biz?.modules, 'agenda')) return null;
    const saved = await this.prisma.agendaSettings.findFirst({ where: { userId, businessId } });
    if (!saved || (saved.openingHours as OpeningRange[]).length === 0) return null;
    const settings = { ...saved, timeZone: timeZoneForCountry(biz?.country) };

    const services = await this.prisma.product.findMany({
      where: { userId, businessId, trackStock: false },
      select: { name: true, durationMinutes: true, sellingPrice: true },
      orderBy: { name: 'asc' },
    });

    const today = utcToLocal(new Date(), settings.timeZone).date;
    const lines: string[] = [];
    for (let i = 0; i < 7; i++) {
      const date = addDays(today, i);
      const slots = await this.freeSlots(userId, businessId, settings, date, settings.defaultDurationMinutes);
      if (slots.length === 0) continue;
      const weekday = WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()];
      // A dozen per day is plenty to offer and keeps the prompt short.
      const shown = slots.length > 12 ? [...slots.slice(0, 12), '…'] : slots;
      lines.push(`- ${weekday} ${date} : ${shown.join(', ')}`);
    }

    const serviceLines = services.length
      ? services.map(s => `- ${s.name} (${s.durationMinutes ?? settings.defaultDurationMinutes} min)`).join('\n')
      : '(aucun service enregistré — réservation générale)';
    return `Aujourd'hui : ${today} (heure locale).
SERVICES RÉSERVABLES :
${serviceLines}

CRÉNEAUX LIBRES (durée standard ${settings.defaultDurationMinutes} min) :
${lines.length ? lines.join('\n') : '(aucun créneau libre dans les 7 prochains jours)'}`;
  }

  /**
   * Books what the AI agreed with the customer. If the slot was taken in the meantime,
   * returns the next free times so the reply can offer them instead.
   */
  async bookFromAi(
    userId: string,
    businessId: string | null,
    req: { date: string; time: string; service: string | null; name: string; phone: string | null; contactId: string },
  ): Promise<{ ok: true; when: string } | { ok: false; alternatives: string[] }> {
    const product = req.service
      ? await this.prisma.product.findFirst({
          where: { userId, businessId, name: { equals: req.service, mode: 'insensitive' } },
          select: { id: true },
        })
      : null;
    try {
      await this.create(userId, businessId, {
        customerName: req.name, customerPhone: req.phone ?? undefined,
        productId: product?.id, date: req.date, time: req.time,
      }, { source: 'whatsapp_ai', contactId: req.contactId });
      return { ok: true, when: `${req.date} ${req.time}` };
    } catch (err) {
      if (!(err instanceof ConflictException)) throw err;
      const alternatives: string[] = [];
      for (let i = 0; i < 3 && alternatives.length < 3; i++) {
        const date = addDays(req.date, i);
        const slots = await this.availability(userId, businessId, date, { productId: product?.id });
        for (const t of slots.slice(0, 3 - alternatives.length)) alternatives.push(`${date} à ${t}`);
      }
      return { ok: false, alternatives };
    }
  }

  // ── Reminders ──────────────────────────────────────────────────────────────

  // Every 15 min: WhatsApp reminder for appointments entering their reminder window.
  @Cron('*/15 * * * *')
  async sendReminders(): Promise<void> {
    const horizon = new Date(Date.now() + 168 * 3600_000);
    const due = await this.prisma.appointment.findMany({
      where: { status: 'confirmed', reminderSentAt: null, customerPhone: { not: null }, startAt: { gt: new Date(), lte: horizon } },
      orderBy: { startAt: 'asc' },
      take: 200,
    });
    if (due.length === 0) return;

    const settingsCache = new Map<string, { reminderHours: number; timeZone: string; name: string; country: string }>();
    for (const appt of due) {
      const key = `${appt.userId}:${appt.businessId}`;
      if (!settingsCache.has(key)) {
        const [s, biz] = await Promise.all([
          this.prisma.agendaSettings.findFirst({ where: { userId: appt.userId, businessId: appt.businessId } }),
          this.business(appt.businessId),
        ]);
        settingsCache.set(key, {
          reminderHours: s?.reminderHours ?? 24,
          timeZone: timeZoneForCountry(biz?.country),
          name: biz?.name ?? '',
          country: biz?.country ?? 'CD',
        });
      }
      const conf = settingsCache.get(key)!;
      if (conf.reminderHours <= 0) continue;
      if (appt.startAt.getTime() - Date.now() > conf.reminderHours * 3600_000) continue;

      const phone = internationalPhone(appt.customerPhone!, conf.country);
      if (!phone) continue;
      const local = utcToLocal(appt.startAt, conf.timeZone);
      const day = local.date === utcToLocal(new Date(), conf.timeZone).date ? "aujourd'hui" : `le ${frenchDate(local.date)}`;
      const text = `Bonjour ${appt.customerName} 👋\nPetit rappel : votre rendez-vous${appt.serviceName ? ` (${appt.serviceName})` : ''} est prévu ${day} à ${local.time}.\nÀ très vite !${conf.name ? `\n— ${conf.name}` : ''}`;

      const sent = await this.whatsapp.notifyOrder(appt.userId, appt.businessId, phone, text).catch(() => false);
      if (sent) {
        await this.prisma.appointment.update({ where: { id: appt.id }, data: { reminderSentAt: new Date() } });
      }
    }
  }
}

// "0812345678" / "+243 81 234 5678" / "243812345678@c.us" → "243812345678". null for a LID.
function internationalPhone(raw: string, country: string): string | null {
  const digits = raw.replace(/@.*$/, '').replace(/\D/g, '');
  if (!digits || digits.length > 13) return null;
  const dial = COUNTRY_INFO[country]?.dialCode ?? '';
  if (dial && digits.startsWith(dial)) return digits;
  if (dial && digits.startsWith('0')) return dial + digits.slice(1);
  if (dial && digits.length <= 9) return dial + digits;
  return digits;
}

function frenchDate(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
}
