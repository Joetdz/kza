import { Injectable, Logger, OnModuleDestroy, OnModuleInit, HttpException, HttpStatus, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from './ai.service';
import { AutomationService } from './automation.service';
import { PushService } from '../push/push.service';
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  proto,
  downloadMediaMessage,
  Browsers,
  jidNormalizedUser,
  WASocket,
  WAMessage,
} from '@whiskeysockets/baileys';
import * as qrcode from 'qrcode';
import * as path from 'path';
import * as fs from 'fs';
import pino from 'pino';
import { useDbAuthState, clearDbAuth } from './wa-auth-state';

// Normalize a phone number to DRC format (0XXXXXXXXX or +243XXXXXXXXX)
function normalizeDrcPhone(raw: string | null): string | null {
  if (!raw) return null;
  // Strip WhatsApp JID suffixes before normalizing
  const stripped = raw
    .replace(/@c\.us$/, '')
    .replace(/@s\.whatsapp\.net$/, '')
    .replace(/@lid$/, '');
  const digits = stripped.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('243')) return '+' + digits; // +243XXXXXXXXX
  if (digits.length === 10 && digits.startsWith('0')) return digits;         // 0XXXXXXXXX
  if (digits.length === 9) return '0' + digits;                              // 8XXXXXXXX → 08XXXXXXXX
  if (digits.length > 12) return null; // LID or garbage, cannot normalize
  return stripped || null;
}

// Baileys JID (@s.whatsapp.net) → legacy @c.us format stored in DB
function jidToDb(jid: string): string {
  if (!jid) return jid;
  return jid.replace('@s.whatsapp.net', '@c.us').replace('@lid', '@c.us');
}

// Any phone format → Baileys JID (@s.whatsapp.net or @g.us)
function toJid(phone: string): string {
  if (!phone) return phone;
  if (phone.endsWith('@g.us')) return phone;
  if (phone.endsWith('@s.whatsapp.net')) return phone;
  if (phone.endsWith('@c.us')) return phone.replace('@c.us', '@s.whatsapp.net');
  return phone.replace(/\D/g, '') + '@s.whatsapp.net';
}

// Extract plain text from a WA proto message
function extractText(msg: proto.IMessage | null | undefined): string {
  if (!msg) return '';
  return (
    msg.conversation ??
    msg.extendedTextMessage?.text ??
    msg.imageMessage?.caption ??
    msg.videoMessage?.caption ??
    msg.documentMessage?.caption ??
    ''
  ) ?? '';
}

interface CachedMsg {
  direction: 'in' | 'out';
  content: string;
  mediaType?: string | null;
  mediaUrl?: string | null;
  waId?: string;
  sentAt: string;
}

// Messages a contact sent in a rapid burst, accumulated while we wait to see if
// they're still typing — flushed as one turn once the burst goes quiet.
interface PendingBatch {
  texts: string[];
  isFirst: boolean;
  jid: string;
  contactId: string;
  aiEnabled: boolean;
  leadStatus: string | null;
  mediaBase64?: string;
  mediaMimetype?: string;
  hasContent: boolean;
}

export type WaGatewayCallback = (event: string, userId: string, data: any) => void;

const silentLogger = pino({ level: 'silent' });

@Injectable()
export class WhatsAppService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WhatsAppService.name);
  private sockets = new Map<string, WASocket>();
  private connectedUsers = new Set<string>();
  private gatewayEmit: WaGatewayCallback | null = null;
  private loggedOut = new Set<string>();
  private reconnectDelay = new Map<string, number>();
  private pairingPhones = new Map<string, string>();
  private pairingTimeouts = new Map<string, NodeJS.Timeout>();

  // Per-contact sequential queue: key = `userId:phone`
  private messageQueues = new Map<string, Promise<void>>();
  // Track message IDs we sent via API to avoid double-emit
  private pendingSendIds = new Map<string, Set<string>>();
  // Per-contact message cache: key = `userId:phone` (50 messages max)
  private msgCache = new Map<string, CachedMsg[]>();
  // Contact display name cache: key = `userId:jid`
  private contactNames = new Map<string, string>();
  // Keep-alive timers (periodic presence update to maintain session)
  private keepAliveTimers = new Map<string, NodeJS.Timeout>();
  // Per-user outgoing message rate counter {count, resetAt}
  private rateLimiters = new Map<string, { count: number; resetAt: number }>();
  // Global bulk-send queue (shared across all logistics notifications)
  private bulkQueue = Promise.resolve();
  // Groups cache: key = userId, populated on chats.set / chats.upsert
  private groupsCache = new Map<string, Array<{ id: string; name: string; participants: number }>>();
  // WhatsApp Business label cache: key = `userId:labelId` → label name
  private labelNames = new Map<string, string>();
  // Timestamp (ms) when WhatsApp connection opened — used to skip historical label events
  private connectionOpenAt = new Map<string, number>();
  // LID (Linked Device ID) → real phone (@c.us format): key = `userId:lid`
  private lidToPhone = new Map<string, string>();
  // Sessions with a connect() in flight — the socket lands in `sockets` only seconds
  // later, and this holds the key in the meantime so nothing opens a rival stream.
  private connecting = new Set<string>();
  // At most one pending reconnect per session
  private reconnectTimers = new Map<string, NodeJS.Timeout>();
  // Messages awaiting the quiet window before the bot engages: key = `userId:businessId:phone`
  private pendingBatches = new Map<string, PendingBatch>();
  // Debounce timers backing pendingBatches — reset on every new message in the burst
  private engagementTimers = new Map<string, NodeJS.Timeout>();
  // Trigger label names (case/accent-insensitive) that auto-create a draft order.
  // Short prefixes — matching uses .includes() so "livraison programmée" still matches "livraison".
  private static DRAFT_TRIGGER_LABELS = ['livraison', 'new order', 'commande', 'nouvelle commande'];
  // Grace window after connection during which label events are treated as historical and ignored
  private static LABEL_SYNC_GRACE_MS = 45_000; // 45 s — WA replays historical label events during every reconnect

  constructor(
    private prisma: PrismaService,
    private aiService: AiService,
    private automationService: AutomationService,
    @Optional() private pushService: PushService,
  ) {}

  // ── Auto-reconnect on server startup ─────────────────────────────────────────

  async onModuleInit(): Promise<void> {
    try {
      const sessions = await this.prisma.whatsAppSession.findMany({ where: { connected: true } });
      if (sessions.length === 0) return;
      this.logger.log(`Auto-reconnecting ${sessions.length} WhatsApp session(s) after server restart...`);
      sessions.forEach((session, idx) => {
        // Stagger by 3 s per session to avoid hammering WA simultaneously
        setTimeout(() => {
          this.connect(session.userId, session.businessId).catch(err =>
            this.logger.error(`Auto-reconnect failed for ${session.userId}/${session.businessId}:`, err?.message),
          );
        }, idx * 3000);
      });
    } catch (err: any) {
      this.logger.error('onModuleInit auto-reconnect error:', err?.message);
    }
  }

  setGatewayEmit(fn: WaGatewayCallback) {
    this.gatewayEmit = fn;
  }

  // A WhatsApp connection belongs to one business of one user, so every in-memory
  // map is keyed by this composite — never by userId alone.
  private waKey(userId: string, businessId: string | null): string {
    return `${userId}:${businessId ?? ''}`;
  }

  emitDraftOrderCreated(
    userId: string,
    businessId: string | null,
    orderId: string,
    orderNumber: number,
    contactId?: string,
  ) {
    this.emit('draft-order-created', userId, businessId, {
      orderId, orderNumber, contactId: contactId ?? null, userId,
    });
  }

  // Events reach every socket of the user, so the payload carries businessId
  // and the client drops what doesn't belong to the business it is showing.
  private emit(event: string, userId: string, businessId: string | null, data: any) {
    if (event === 'draft-order-created') {
      this.logger.log(`[emit] draft-order-created → userId=${userId} biz=${businessId} hasGateway=${!!this.gatewayEmit}`);
    }
    if (this.gatewayEmit) this.gatewayEmit(event, userId, { ...data, businessId });
  }

  private getPendingSet(userId: string, businessId: string | null): Set<string> {
    const key = this.waKey(userId, businessId);
    if (!this.pendingSendIds.has(key)) this.pendingSendIds.set(key, new Set());
    return this.pendingSendIds.get(key)!;
  }

  // ── Per-contact sequential message queue ─────────────────────────────────────

  private enqueue(userId: string, businessId: string | null, phone: string, handler: () => Promise<void>): void {
    const key = `${this.waKey(userId, businessId)}:${phone}`;
    const prev = this.messageQueues.get(key) ?? Promise.resolve();
    const next = prev.then(handler).catch(err =>
      this.logger.error(`Queue error [${key}]:`, err?.message ?? err)
    );
    this.messageQueues.set(key, next);
    next.finally(() => {
      if (this.messageQueues.get(key) === next) this.messageQueues.delete(key);
    });
  }

  // ── In-memory message cache ───────────────────────────────────────────────────

  private addToCache(userId: string, businessId: string | null, phone: string, msg: CachedMsg) {
    const key = `${this.waKey(userId, businessId)}:${phone}`;
    const cache = this.msgCache.get(key) ?? [];
    cache.push(msg);
    if (cache.length > 50) cache.shift();
    this.msgCache.set(key, cache);
  }

  private getCache(userId: string, businessId: string | null, phone: string): CachedMsg[] {
    return this.msgCache.get(`${this.waKey(userId, businessId)}:${phone}`) ?? [];
  }

  // Public accessor for controller (create-draft-order)
  getCacheForContact(
    userId: string,
    businessId: string | null,
    phone: string,
  ): Array<{ direction: string; content: string }> {
    return this.getCache(userId, businessId, phone).map(m => ({ direction: m.direction, content: m.content }));
  }

  // ── Label management ─────────────────────────────────────────────────────────

  // Request WA Business label list so labelNames cache is populated after reconnect
  private async refreshLabels(userId: string, businessId: string | null, sock: WASocket): Promise<void> {
    try {
      const query = (sock as any).query({
        tag: 'iq',
        attrs: { to: 's.whatsapp.net', type: 'get', xmlns: 'w:biz:label' },
        content: [{ tag: 'label', attrs: {} }],
      });
      const result = await Promise.race([
        query,
        new Promise<null>((_, r) => setTimeout(() => r(new Error('timeout')), 5_000)),
      ]);
      this.logger.log(`[refreshLabels] raw result: ${JSON.stringify(result)?.slice(0, 2000)}`);
      // Try top-level content first, then one level deeper (some accounts wrap in a list node)
      const topLevel: any[] = Array.isArray(result?.content) ? result.content : [];
      const nodes: any[] = topLevel.flatMap((n: any) =>
        n?.attrs?.id ? [n] : (Array.isArray(n?.content) ? n.content : [])
      );
      let refreshed = 0;
      for (const node of nodes) {
        const id = node?.attrs?.id;
        const name = node?.attrs?.name;
        if (id && name) {
          this.labelNames.set(`${this.waKey(userId, businessId)}:${id}`, name);
          refreshed++;
        }
      }
      this.logger.log(`[refreshLabels] found ${refreshed} label(s), cache now ${this.labelNames.size}`);
    } catch (e: any) {
      this.logger.log(`[refreshLabels] error/timeout: ${e?.message}`);
    }
  }

  // Resolve a JID or LID to the real phone number (@c.us format).
  // WhatsApp v7 multi-device uses LIDs in label events instead of phone numbers.
  private resolvePhone(userId: string, businessId: string | null, jid: string): string {
    // Already a normal phone JID
    if (jid.endsWith('@s.whatsapp.net')) return jidToDb(jid);
    // Remove the suffix to get the raw ID
    const raw = jid.replace(/@c\.us$/, '').replace(/@lid$/, '').replace(/@s\.whatsapp\.net$/, '');
    // Check if it looks like a real DRC/international phone (≤13 digits)
    const digits = raw.replace(/\D/g, '');
    if (digits.length <= 13) return jidToDb(jid); // treat as normal phone
    // Looks like a LID (>13 digits) — look up mapping
    const mapped = this.lidToPhone.get(`${this.waKey(userId, businessId)}:${raw}`);
    if (mapped) {
      this.logger.log(`LID resolved: ${raw} → ${mapped}`);
      return mapped;
    }
    this.logger.warn(`LID ${raw} not yet mapped — using raw JID as fallback`);
    return jidToDb(jid);
  }

  private scheduleReconnect(userId: string, businessId: string | null, statusCode?: number) {
    const key = this.waKey(userId, businessId);
    if (this.loggedOut.has(key)) return;
    // Don't auto-reconnect if a pairing is in progress — let the timeout handle it
    if (this.pairingPhones.has(key)) return;

    // Never leave two reconnects pending: both timers would fire on an empty socket
    // map and each open its own stream.
    const pending = this.reconnectTimers.get(key);
    if (pending) clearTimeout(pending);

    // A 440 means another client currently holds this session. Retrying every 5 s just
    // trades kicks with it, so wait long enough for whoever owns it to settle.
    const isConflict = statusCode === DisconnectReason.connectionReplaced;
    const floor = isConflict ? 60_000 : 5000;
    const delay = Math.min(Math.max(this.reconnectDelay.get(key) ?? floor, floor), 120_000);
    this.reconnectDelay.set(key, delay * 2);
    this.logger.log(`Reconnecting ${key} in ${delay}ms${isConflict ? ' (conflict — another client holds this session)' : ''}`);

    const timer = setTimeout(() => {
      this.reconnectTimers.delete(key);
      if (!this.loggedOut.has(key) && !this.sockets.has(key) && !this.connecting.has(key) && !this.pairingPhones.has(key)) {
        this.connect(userId, businessId);
      }
    }, delay);
    this.reconnectTimers.set(key, timer);
  }

  // ── Anti-ban helpers ──────────────────────────────────────────────────────────

  // Random human-like delay between messages (min-max ms)
  private jitter(minMs = 800, maxMs = 3000): Promise<void> {
    const ms = Math.floor(Math.random() * (maxMs - minMs)) + minMs;
    return new Promise(r => setTimeout(r, ms));
  }

  // Rate limit outgoing messages: max `limit` per 60s window per user.
  // Returns how many ms to wait (0 = no wait needed).
  private rateWait(userId: string, businessId: string | null, limit = 25): number {
    const key = this.waKey(userId, businessId);
    const now = Date.now();
    const r = this.rateLimiters.get(key);
    if (!r || now > r.resetAt) {
      this.rateLimiters.set(key, { count: 1, resetAt: now + 60_000 });
      return 0;
    }
    if (r.count >= limit) {
      return r.resetAt - now; // wait until window resets
    }
    r.count++;
    return 0;
  }

  private clearKeepAlive(userId: string, businessId: string | null) {
    const key = this.waKey(userId, businessId);
    const t = this.keepAliveTimers.get(key);
    if (t) { clearInterval(t); this.keepAliveTimers.delete(key); }
  }

  private clearPairingTimeout(userId: string, businessId: string | null) {
    const key = this.waKey(userId, businessId);
    const t = this.pairingTimeouts.get(key);
    if (t) { clearTimeout(t); this.pairingTimeouts.delete(key); }
  }

  // ── Connect ───────────────────────────────────────────────────────────────────

  // businessId is nullable, so the (userId, businessId) unique can't drive an upsert —
  // update the row if it exists, insert otherwise.
  private async markSession(
    userId: string,
    businessId: string | null,
    data: { connected: boolean; phone?: string | null },
  ): Promise<void> {
    const updated = await this.prisma.whatsAppSession.updateMany({
      where: { userId, businessId },
      data,
    });
    if (updated.count === 0) {
      await this.prisma.whatsAppSession.create({ data: { userId, businessId, ...data } });
    }
  }

  async connect(userId: string, businessId: string | null): Promise<void> {
    const key = this.waKey(userId, businessId);

    // Claim the key before the first await. The socket is only registered in
    // `this.sockets` further down, after a DB read and a version fetch that can take
    // 5 s — a second connect() slipping into that gap would open a rival stream on the
    // same credentials, and WhatsApp answers that with a 440 conflict that kills one of
    // the two. Whichever loses then tears down state and reconnects, on repeat.
    if (this.sockets.has(key) || this.connecting.has(key)) {
      const session = await this.prisma.whatsAppSession.findFirst({ where: { userId, businessId } });
      if (session?.connected && this.connectedUsers.has(key)) {
        this.emit('connected', userId, businessId, { phone: session.phone });
      }
      return;
    }
    this.connecting.add(key);

    let state: Awaited<ReturnType<typeof useDbAuthState>>['state'];
    let saveCreds: Awaited<ReturnType<typeof useDbAuthState>>['saveCreds'];
    let version: [number, number, number];
    try {
      ({ state, saveCreds } = await useDbAuthState(userId, businessId, this.prisma));

      // fetchLatestBaileysVersion hits GitHub — may hang on VPS; fall back to pinned version after 5s
      const FALLBACK_VERSION: [number, number, number] = [2, 3000, 1015901307];
      try {
        const timeout = new Promise<{ version: [number, number, number] }>(resolve =>
          setTimeout(() => resolve({ version: FALLBACK_VERSION }), 5000),
        );
        const result = await Promise.race([fetchLatestBaileysVersion(), timeout]);
        version = result.version;
      } catch {
        version = FALLBACK_VERSION;
      }
    } catch (err) {
      this.connecting.delete(key);
      throw err;
    }

    const pairingPhone = this.pairingPhones.get(key);

    const sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      logger: silentLogger as any,
      browser: Browsers.ubuntu('Chrome'),
      syncFullHistory: false,
      markOnlineOnConnect: false,
      generateHighQualityLinkPreview: false,
    });

    this.sockets.set(key, sock);
    this.connecting.delete(key);

    // DEBUG: intercept ALL Baileys events to diagnose label issues
    const _origEmit = (sock.ev as any).emit.bind(sock.ev);
    (sock.ev as any).emit = (...args: any[]) => {
      const evName = args[0];
      if (typeof evName === 'string' && evName.includes('label')) {
        this.logger.log(`[baileys-all] ${evName}: ${JSON.stringify(args[1])?.slice(0, 500)}`);
      }
      return _origEmit(...args);
    };

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        if (pairingPhone) {
          this.clearPairingTimeout(userId, businessId);
          try {
            const code = await sock.requestPairingCode(pairingPhone.replace(/\D/g, ''));
            this.pairingPhones.delete(key);
            this.emit('pairing_code', userId, businessId, { code });
          } catch (err: any) {
            this.pairingPhones.delete(key);
            this.emit('pairing_error', userId, businessId, {
              message: 'Impossible de générer le code. Réessayez.',
            });
          }
        } else {
          const qrDataUrl = await qrcode.toDataURL(qr);
          this.emit('qr', userId, businessId, { qr: qrDataUrl });
        }
      }

      if (connection === 'connecting') {
        this.emit('loading', userId, businessId, { percent: 50, message: 'Connexion...' });
      }

      if (connection === 'open') {
        const rawId = sock.user?.id ?? '';
        const phone = rawId ? jidNormalizedUser(rawId).split('@')[0] : null;

        // One number belongs to exactly one business. Linking the same WhatsApp account
        // to a second business would leave two sessions fighting over the single stream
        // WhatsApp allows per set of credentials — an endless 440 conflict loop. Refuse
        // the newcomer instead, and stop it retrying.
        if (phone) {
          const takenBy = await this.prisma.whatsAppSession.findFirst({
            where: { userId, phone, NOT: { businessId } },
            select: { businessId: true },
          });
          if (takenBy) {
            const owner = await this.prisma.business.findUnique({
              where: { id: takenBy.businessId ?? '' },
              select: { name: true },
            });
            const ownerName = owner?.name ?? 'un autre business';
            this.logger.warn(`Refusing ${key}: number ${phone} is already linked to ${ownerName} (${takenBy.businessId})`);

            this.loggedOut.add(key); // block scheduleReconnect
            this.sockets.delete(key);
            this.connectedUsers.delete(key);
            (sock.ev as any).removeAllListeners();
            sock.end(new Error('duplicate number'));

            await clearDbAuth(userId, businessId, this.prisma).catch(() => {});
            await this.markSession(userId, businessId, { connected: false, phone: null }).catch(() => {});
            this.emit('pairing_error', userId, businessId, {
              message: `Ce numéro est déjà connecté à « ${ownerName} ». Chaque business doit avoir son propre numéro WhatsApp.`,
            });
            return;
          }
        }

        this.connectedUsers.add(key);
        this.reconnectDelay.set(key, 5000);
        this.pairingPhones.delete(key);

        await this.prisma.withRetry(() =>
          this.markSession(userId, businessId, { connected: true, phone })
        );

        // Reset grace window on every connection (including reconnects) — WA replays historical
        // labels.association events during every reconnect and they must be ignored
        this.connectionOpenAt.set(key, Date.now());
        this.emit('connected', userId, businessId, { phone });
        this.logger.log(`WhatsApp connected for ${key} (${phone}) — label sync window: ${WhatsAppService.LABEL_SYNC_GRACE_MS / 1000}s`);

        // Keep-alive: periodic presence update to prevent session idle-expiry
        this.clearKeepAlive(userId, businessId);
        const keepAlive = setInterval(async () => {
          if (this.connectedUsers.has(key) && this.sockets.has(key)) {
            await sock.sendPresenceUpdate('available').catch(() => {});
          }
        }, 9 * 60 * 1000); // every 9 minutes
        this.keepAliveTimers.set(key, keepAlive);

        this.syncContactDirectory(userId, businessId).catch(err =>
          this.logger.error(`Contact sync failed for ${key}:`, err?.message)
        );

        this.refreshLabels(userId, businessId, sock).catch(() => {});
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;

        // A socket that has already been superseded still emits close — typically the
        // loser of a 440 conflict. Letting it run would delete the live socket's entry
        // and schedule a reconnect on top of a healthy connection, which is what turns
        // a single conflict into an endless connect/kick loop.
        if (this.sockets.get(key) !== sock) {
          this.logger.warn(`Ignoring close from superseded socket for ${key} (statusCode=${statusCode})`);
          return;
        }

        this.clearKeepAlive(userId, businessId);
        this.sockets.delete(key);
        this.connectedUsers.delete(key);
        const isLogout = statusCode === DisconnectReason.loggedOut;
        this.logger.warn(`WhatsApp closed for ${key}: statusCode=${statusCode} message=${lastDisconnect?.error?.message}`);

        await this.markSession(userId, businessId, { connected: false }).catch(() => {});

        this.emit('disconnected', userId, businessId, { reason: String(statusCode) });

        if (isLogout) {
          await clearDbAuth(userId, businessId, this.prisma);
          this.logger.log(`WhatsApp logged out for ${key}`);

          if (this.pairingPhones.has(key)) {
            // Logout happened during a pairing attempt (stale session wiped by WA)
            // Auth files are now clean — retry the connection to get a fresh QR
            this.logger.log(`Retrying connection for ${key} after logout during pairing`);
            setTimeout(() => this.connect(userId, businessId), 1000);
          } else {
            this.loggedOut.add(key);
          }
        } else if (!this.loggedOut.has(key)) {
          this.scheduleReconnect(userId, businessId, statusCode);
        }
      }
    });

    // Messages (incoming from contact OR outgoing from physical phone)
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const msg of messages) {
        const jid = msg.key.remoteJid;
        if (!jid || jid === 'status@broadcast' || jid.endsWith('@broadcast')) continue;

        if (msg.key.fromMe) {
          const waId = msg.key.id ?? '';
          if (this.getPendingSet(userId, businessId).has(waId)) {
            this.getPendingSet(userId, businessId).delete(waId);
            continue; // we already emitted this when we sent it
          }
          if (!jid.endsWith('@g.us')) {
            await this.handleOutgoingFromPhone(userId, businessId, msg).catch(err =>
              this.logger.error('handleOutgoingFromPhone error:', err?.message)
            );
          }
        } else {
          if (jid.endsWith('@g.us')) continue; // skip group chat messages
          const phone = jidToDb(jid);
          this.enqueue(userId, businessId, phone, () => this.handleIncoming(userId, businessId, sock, msg));
        }
      }
    });

    // Contact name updates + LID → phone mapping
    const processContact = (c: any) => {
      const name = c.notify || c.name || null;
      if (name && c.id) this.contactNames.set(`${key}:${c.id}`, name);
      // Build LID ↔ phone map: if contact has a LID field alongside a normal JID
      const lid: string | undefined = c.lid ?? c.lidJid ?? c.linkedDeviceId;
      if (lid && c.id?.endsWith('@s.whatsapp.net')) {
        const lidRaw = lid.replace(/@lid$/, '').replace(/@c\.us$/, '');
        this.lidToPhone.set(`${key}:${lidRaw}`, jidToDb(c.id));
        this.logger.log(`LID cached (upsert): ${lidRaw} → ${jidToDb(c.id)}`);
      }
      // Reverse: if the contact itself IS a LID and has a pn (phone number) field
      const pn: string | undefined = c.pn ?? c.phoneNumber ?? c.phone;
      if (pn && c.id && (c.id.endsWith('@lid') || c.id.endsWith('@c.us'))) {
        const lidRaw = c.id.replace(/@lid$/, '').replace(/@c\.us$/, '');
        const digits = lidRaw.replace(/\D/g, '');
        if (digits.length > 12) {
          this.lidToPhone.set(`${key}:${lidRaw}`, jidToDb(pn));
          this.logger.log(`LID cached (pn): ${lidRaw} → ${jidToDb(pn)}`);
        }
      }
    };

    sock.ev.on('contacts.upsert', (contacts) => {
      for (const c of contacts) processContact(c);
    });

    sock.ev.on('contacts.update', (updates) => {
      for (const c of updates) processContact(c);
    });

    // LID-to-phone mapping pushed by WhatsApp (Baileys v7 multi-device)
    sock.ev.on('lid-mapping.update' as any, (data: any) => {
      const lid: string = data?.lid ?? '';
      const pn: string = data?.pn ?? '';
      if (lid && pn) {
        const lidRaw = lid.replace(/@lid$/, '').replace(/@c\.us$/, '');
        const phone = jidToDb(pn);
        this.lidToPhone.set(`${key}:${lidRaw}`, phone);
        this.logger.log(`LID mapped: ${lidRaw} → ${phone}`);
      }
    });

    // Delivery/read receipts
    sock.ev.on('message-receipt.update', (updates) => {
      for (const update of updates) {
        if (update.key?.id) {
          const ack = update.receipt?.receiptTimestamp ? 3 : 2;
          this.emit('message-ack', userId, businessId, { waId: update.key.id, ack });
        }
      }
    });

    // Groups cache — populated when WA sends the initial chat list
    const cacheGroups = (chats: any[]) => {
      const groups = chats
        .filter((c: any) => (c.id as string)?.endsWith('@g.us'))
        .map((c: any) => ({
          id: c.id as string,
          name: (c.name ?? c.subject ?? c.id) as string,
          participants: (c.participants as any[])?.length ?? 0,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
      if (groups.length > 0) {
        this.groupsCache.set(key, groups);
        this.logger.log(`Groups cache updated for ${key}: ${groups.length} groups`);
      }
    };

    // In Baileys v7, initial history arrives via messaging-history.set
    sock.ev.on('messaging-history.set', ({ chats, contacts, messages } : any) => {
      // Groups cache
      cacheGroups(chats ?? []);

      // Populate contact names from history contacts
      for (const c of (contacts ?? [])) {
        processContact(c);
      }

      // Populate message cache from historical messages (so label events can find history)
      const msgs: WAMessage[] = Array.isArray(messages) ? messages : [];
      let cached = 0;
      for (const msg of msgs) {
        const jid = msg.key?.remoteJid;
        if (!jid || jid === 'status@broadcast' || jid.endsWith('@g.us') || jid.endsWith('@broadcast')) continue;
        const phone = jidToDb(jid);
        const text = extractText(msg.message) ?? '';
        if (!text) continue;
        const timestamp = Number(msg.messageTimestamp ?? Date.now() / 1000) * 1000;
        this.addToCache(userId, businessId, phone, {
          direction: msg.key.fromMe ? 'out' : 'in',
          content: text,
          waId: msg.key.id ?? undefined,
          sentAt: new Date(timestamp).toISOString(),
        });
        cached++;
      }
      if (cached > 0) this.logger.log(`History sync: cached ${cached} msgs for ${key}`);
    });
    sock.ev.on('chats.upsert' as any, (chats: any) => {
      const current = this.groupsCache.get(key) ?? [];
      const updated = [...current];
      const list: any[] = Array.isArray(chats) ? chats : [];
      for (const c of list) {
        if (!(c.id as string)?.endsWith('@g.us')) continue;
        const idx = updated.findIndex(g => g.id === c.id);
        const entry = { id: c.id as string, name: (c.name ?? c.subject ?? c.id) as string, participants: (c.participants as any[])?.length ?? 0 };
        if (idx >= 0) updated[idx] = entry; else updated.push(entry);
      }
      if (updated.length > 0) this.groupsCache.set(key, updated.sort((a, b) => a.name.localeCompare(b.name)));
    });

    // WhatsApp Business labels — cache label id→name (fires during initial sync)
    const cacheLabels = (labels: any) => {
      const list: any[] = Array.isArray(labels) ? labels : (labels ? [labels] : []);
      for (const label of list) {
        if (label?.id && label?.name) {
          this.labelNames.set(`${key}:${label.id}`, label.name);
          this.logger.log(`Label cached: ${label.id} → "${label.name}"`);
        }
      }
    };
    sock.ev.on('labels.edit' as any, cacheLabels);
    // Some Baileys builds use 'label.edit' (singular)
    sock.ev.on('label.edit' as any, cacheLabels);

    // Label applied to a chat from the physical WhatsApp Business app → auto-create draft order
    sock.ev.on('labels.association' as any, async (data: any) => {
      this.logger.log(`[labels.association] event received — raw: ${JSON.stringify(data)}`);
      try {
        // Ignore label events that arrive within the grace window after connection open.
        // Baileys replays ALL historical label associations during initial app-state sync,
        // which would create hundreds of bogus drafts. Only process real-time events.
        const openAt = this.connectionOpenAt.get(key) ?? 0;
        const ageMs = Date.now() - openAt;
        if (ageMs < WhatsAppService.LABEL_SYNC_GRACE_MS) {
          this.logger.log(`Skipping historical label event for ${key} (${Math.round(ageMs / 1000)}s after connect, grace=${WhatsAppService.LABEL_SYNC_GRACE_MS / 1000}s)`);
          return;
        }

        this.logger.log(`labels.association raw: ${JSON.stringify(data)}`);

        // Baileys structure: { type: 'add'|'remove', association: { chatId, labelId, type: 'label_chat'|'label_jid' } }
        // The add/remove flag is at data.type, NOT inside data.association.type
        const addOrRemove: string = data?.type ?? data?.association?.type ?? '';
        if (addOrRemove !== 'add') return;

        const assoc = data?.association ?? data;
        const labelId: string = assoc?.labelId ?? assoc?.label_id ?? '';
        const chatId: string = assoc?.chatId ?? assoc?.chat_id ?? '';
        if (!labelId || !chatId) return;

        // Look up label name; if not cached yet, try to refresh then retry
        let labelName = this.labelNames.get(`${key}:${labelId}`) ?? '';
        if (!labelName) {
          await this.refreshLabels(userId, businessId, sock);
          labelName = this.labelNames.get(`${key}:${labelId}`) ?? '';
        }

        this.logger.log(`Label association: id=${labelId} name="${labelName}" chat=${chatId} (cached labels: ${this.labelNames.size})`);

        // Normalize both label name and label ID — some WA accounts use human-readable IDs
        const normalizeStr = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
        const normalizedName = normalizeStr(labelName);
        const normalizedId   = normalizeStr(labelId);

        const isTrigger =
          WhatsAppService.DRAFT_TRIGGER_LABELS.some(t => normalizedName.includes(t)) ||
          WhatsAppService.DRAFT_TRIGGER_LABELS.some(t => normalizedId.includes(t));

        if (!isTrigger) {
          this.logger.log(`Label "${labelName}" (id: ${labelId}) is not a draft trigger — ignoring`);
          return;
        }

        // Resolve LID to real phone number (WhatsApp v7 multi-device uses LIDs in label events)
        let phone = this.resolvePhone(userId, businessId, chatId);
        this.logger.log(`Label handler → chatId: ${chatId}, resolved phone: ${phone}`);

        // Detect if LID was not resolved (still has >13 digit number as @c.us)
        const phoneIsLid = /^\d{13,}@c\.us$/.test(phone);

        if (phoneIsLid) {
          // Use Baileys v7 built-in LID→PN mapping (backed by auth-state DB + WA USync query)
          try {
            const pn: string | null = await (sock as any).signalRepository?.lidMapping?.getPNForLID(chatId);
            if (pn) {
              const realPhone = jidToDb(jidNormalizedUser(pn));
              const lidRaw = chatId.replace(/@lid$/, '').replace(/@c\.us$/, '');
              this.lidToPhone.set(`${key}:${lidRaw}`, realPhone);
              this.logger.log(`LID resolved via signalRepository: ${chatId} → ${realPhone}`);
              phone = realPhone;
            } else {
              this.logger.warn(`signalRepository.getPNForLID returned null for ${chatId}`);
            }
          } catch (err: any) {
            this.logger.warn(`getPNForLID failed for ${chatId}: ${err?.message}`);
          }
        }

        // Build message history from in-memory cache (populated by messages.upsert + messaging-history.set)
        // Also try the LID-format key — messaging-history.set caches messages under the LID remoteJid
        let history = this.getCacheForContact(userId, businessId, phone);
        if (history.length === 0) {
          const lidKey = jidToDb(chatId); // e.g. 259544957616361@c.us
          if (lidKey !== phone) {
            history = this.getCacheForContact(userId, businessId, lidKey);
            if (history.length > 0) {
              this.logger.log(`History found under LID key ${lidKey}: ${history.length} msgs`);
            }
          }
        }
        this.logger.log(`History for ${phone}: ${history.length} msgs — preview: ${history.slice(0, 2).map(m => m.content.substring(0, 60)).join(' | ')}`);

        // Upsert contact — also try the raw chatId (LID stored as @c.us) if not found by resolved phone
        let contact = await this.prisma.whatsAppContact.findFirst({
          where: { userId, businessId, phone },
        });
        if (!contact && phone !== jidToDb(chatId)) {
          contact = await this.prisma.whatsAppContact.findFirst({
            where: { userId, businessId, phone: jidToDb(chatId) },
          });
        }
        if (!contact) {
          contact = await this.upsertContact(userId, businessId, phone);
        }

        // Check if a draft already exists for this contact — skip if already exists
        const existing = await this.prisma.manualOrder.findFirst({
          where: { userId, sourceContactId: contact.id, isDraft: true },
        });
        if (existing) {
          this.logger.log(`Draft already exists for contact ${contact.id}, skipping`);
          return;
        }

        // ── Name + phone come from WhatsApp, not from AI ─────────────────────────
        // Priority: normalizeDrcPhone(resolved phone) > contact.phone from DB > raw LID stripped
        let resolvedCustomerPhone = normalizeDrcPhone(phone) ?? null;
        if (!resolvedCustomerPhone) {
          resolvedCustomerPhone = normalizeDrcPhone(contact.phone) ?? null;
        }
        if (!resolvedCustomerPhone) {
          const stripped = phone.replace(/@.*$/, '');
          if (stripped && stripped.length > 0) {
            resolvedCustomerPhone = stripped;
            this.logger.warn(`LID unresolved — using raw stripped phone "${stripped}" for draft. Needs manual review.`);
          }
        }

        const resolvedCustomerName  =
          this.contactNames.get(`${key}:${toJid(phone)}`)
          ?? this.contactNames.get(`${key}:${chatId}`)
          ?? contact.leadName
          ?? contact.displayName
          ?? null;

        // ── AI extracts order details from conversation + catalog ─────────────────
        const products = await this.prisma.product.findMany({
          where: { userId, businessId },
          select: { id: true, name: true, sellingPrice: true },
        });

        this.logger.log(`Sending ${history.length} msgs to AI for extraction (chat: ${chatId})`);
        const details = await this.aiService.extractOrderDetails(history, products);
        this.logger.log(`AI extracted: product=${details.productName} price=${details.agreedPriceUsd} delivery=${details.deliveryFeeCdf} address=${details.address}`);

        if (!resolvedCustomerPhone) {
          this.logger.warn(`Draft skipped — impossible de résoudre un numéro quelconque pour (LID: ${chatId})`);
          return;
        }

        // Signal missing fields but still create the draft
        const missingFields: string[] = [];
        if (!resolvedCustomerName)           missingFields.push('nom client');
        if (!details.productName)            missingFields.push('produit commandé');
        if (details.agreedPriceUsd == null)  missingFields.push('prix $ commande');
        if (details.deliveryFeeCdf == null)  missingFields.push('frais livraison FC');
        if (missingFields.length > 0) {
          this.logger.warn(`Draft créé mais incomplet (à compléter: ${missingFields.join(', ')}) — chat: ${chatId}`);
        }

        // Use productId returned by AI if it matched catalog, else fallback fuzzy match
        let matchedProductId: string | null = details.productId ?? null;
        let unitPrice = details.agreedPriceUsd ?? 0;
        if (!matchedProductId && details.productName && products.length > 0) {
          const needle = details.productName.toLowerCase();
          const matched = products.find(p =>
            p.name.toLowerCase().includes(needle) || needle.includes(p.name.toLowerCase())
          );
          if (matched) {
            matchedProductId = matched.id;
            if (!unitPrice) unitPrice = matched.sellingPrice ?? 0;
          }
        } else if (matchedProductId && !unitPrice) {
          const catalogProduct = products.find(p => p.id === matchedProductId);
          if (catalogProduct) unitPrice = catalogProduct.sellingPrice ?? 0;
        }

        // The order belongs to the business this WhatsApp connection serves.
        // Fall back to the contact's own business, then to the user's oldest one.
        let bizId: string | null = businessId ?? (contact as any).businessId ?? null;
        if (!bizId) {
          const biz = await this.prisma.business.findFirst({
            where: { userId },
            orderBy: { createdAt: 'asc' },
            select: { id: true },
          });
          bizId = biz?.id ?? userId;
        }
        const qty = details.productQuantity ?? 1;

        const agg = await this.prisma.manualOrder.aggregate({ _max: { orderNumber: true }, where: { userId, businessId: bizId } });
        const nextOrderNumber = (agg._max.orderNumber ?? 0) + 1;
        const order = await this.prisma.manualOrder.create({
          data: {
            userId,
            businessId: bizId,
            orderNumber: nextOrderNumber,
            customerName: resolvedCustomerName ?? resolvedCustomerPhone ?? 'Client WhatsApp',
            customerPhone: resolvedCustomerPhone,
            city: details.city ?? contact.leadCity ?? '',
            address: details.address ?? '',
            deliveryFee: details.deliveryFeeCdf ?? 0,
            totalAmount: matchedProductId ? qty * unitPrice : unitPrice,
            isDraft: true,
            sourceContactId: contact.id,
            scheduledAt: details.expectedDeliveryDate ? new Date(details.expectedDeliveryDate) : null,
            notes: details.notes ?? null,
            items: matchedProductId ? {
              create: [{ productId: matchedProductId, quantity: qty, unitPrice }],
            } : undefined,
          },
        });

        // Mark mentions as converted
        await this.prisma.whatsAppProductMention.updateMany({
          where: { contactId: contact.id, isConverted: false },
          data: { isConverted: true },
        }).catch(() => {});

        this.logger.log(`Auto-draft order #${order.orderNumber} created for contact ${contact.phone} (label: ${labelName})`);

        // Notify frontend via WebSocket
        this.emit('draft-order-created', userId, businessId, { orderId: order.id, orderNumber: order.orderNumber, contactId: contact.id, userId });

        // Push notification pour les utilisateurs hors de l'app
        this.pushService?.sendToUser(userId, {
          title: '🛒 Nouveau brouillon de commande',
          body: `Commande #${order.orderNumber} créée depuis WhatsApp — ${contact.phone}`,
          url: '/#/logistique',
          tag: 'draft-order',
        }).catch(() => {});
      } catch (err: any) {
        this.logger.error('labels.association draft error:', err?.message);
      }
    });
  }

  // Called from the HTTP endpoint (user clicks "Générer le QR Code" or "Connecter").
  // Always starts fresh: kills any stale socket and wipes the stored auth so Baileys
  // emits a new QR / pairing code instead of silently trying to reuse an old session.
  async connectFresh(userId: string, businessId: string | null): Promise<void> {
    const key = this.waKey(userId, businessId);
    this.loggedOut.delete(key);

    if (this.sockets.has(key)) {
      const sock = this.sockets.get(key)!;
      this.sockets.delete(key);
      this.connectedUsers.delete(key);
      (sock.ev as any).removeAllListeners();
      sock.end(new Error('reset'));
    }

    await clearDbAuth(userId, businessId, this.prisma);
    this.logger.log(`Cleared stale auth for ${key} — fresh QR connect`);
    await this.connect(userId, businessId);
  }

  async connectWithPairingCode(userId: string, businessId: string | null, phone: string): Promise<void> {
    const key = this.waKey(userId, businessId);
    const normalized = phone.replace(/[^0-9]/g, '');
    this.pairingPhones.set(key, normalized);
    this.clearPairingTimeout(userId, businessId);
    this.loggedOut.delete(key); // allow fresh connection even after a previous logout

    if (this.sockets.has(key)) {
      const sock = this.sockets.get(key)!;
      this.sockets.delete(key);
      this.connectedUsers.delete(key);
      (sock.ev as any).removeAllListeners();
      sock.end(new Error('reset'));
    }

    // Always wipe stale auth so WhatsApp generates a fresh QR/pairing code
    await clearDbAuth(userId, businessId, this.prisma);
    this.logger.log(`Cleared stale auth for ${key} — fresh pairing`);

    // Emit error if no code arrives within 35s
    const timeout = setTimeout(() => {
      if (this.pairingPhones.has(key)) {
        this.pairingPhones.delete(key);
        this.logger.warn(`Pairing timeout for ${key}`);
        this.emit('pairing_error', userId, businessId, {
          message: 'Délai dépassé. Réessayez.',
        });
      }
    }, 35_000);
    this.pairingTimeouts.set(key, timeout);

    await this.connect(userId, businessId);
  }

  // ── Incoming message handler ──────────────────────────────────────────────────

  private async handleIncoming(
    userId: string,
    businessId: string | null,
    sock: WASocket,
    msg: WAMessage,
  ): Promise<void> {
    const key = this.waKey(userId, businessId);
    const jid = msg.key.remoteJid!;
    const phone = jidToDb(jid);
    const text = extractText(msg.message) ?? '';
    const timestamp = Number(msg.messageTimestamp ?? Date.now() / 1000) * 1000;

    const displayName = this.contactNames.get(`${key}:${jid}`) ?? null;
    const isFirst = !(await this.prisma.whatsAppContact.findFirst({
      where: { userId, businessId, phone },
    }));

    const contact = await this.upsertContact(userId, businessId, phone, { displayName });

    // ── Media handling ────────────────────────────────────────────────────────────
    let mediaUrl: string | null = null;
    let mediaType: string | null = null;
    let mediaBase64: string | null = null;
    let mediaMimetype: string | null = null;

    const msgContent = msg.message ?? {};
    const hasImage = !!msgContent.imageMessage;
    const hasAudio = !!msgContent.audioMessage || !!(msgContent as any).pttMessage;
    const hasVideo = !!msgContent.videoMessage;
    const hasDoc = !!msgContent.documentMessage;
    const hasMedia = hasImage || hasAudio || hasVideo || hasDoc || !!msgContent.stickerMessage;

    if (hasMedia) {
      try {
        const buffer = await downloadMediaMessage(msg, 'buffer', {}, {
          logger: silentLogger as any,
          reuploadRequest: sock.updateMediaMessage,
        }) as Buffer;

        const mediaProto: any = msgContent.imageMessage ?? msgContent.audioMessage ??
          (msgContent as any).pttMessage ?? msgContent.videoMessage ??
          msgContent.documentMessage ?? msgContent.stickerMessage;
        const mimetype: string = mediaProto?.mimetype ?? 'application/octet-stream';
        const ext = mimetype.split('/')[1]?.split(';')[0] ?? 'bin';
        const filename = `${msg.key.id}.${ext}`;
        const uploadDir = path.join(process.cwd(), 'uploads');
        fs.mkdirSync(uploadDir, { recursive: true });
        fs.writeFileSync(path.join(uploadDir, filename), buffer);
        mediaUrl = `/uploads/${filename}`;
        mediaType = hasImage ? 'image' : hasAudio ? 'audio' : hasVideo ? 'video' : 'document';
        if (['image', 'audio'].includes(mediaType)) {
          mediaBase64 = buffer.toString('base64');
          mediaMimetype = mimetype;
        }
      } catch (err: any) {
        this.logger.warn(`Media download failed: ${err?.message}`);
        mediaType = hasImage ? 'image' : hasAudio ? 'audio' : hasVideo ? 'video' : 'document';
      }
    }

    const content = text || (mediaType ? `[${mediaType}]` : '[Message]');
    const sentAt = new Date(timestamp).toISOString();
    this.addToCache(userId, businessId, phone, { direction: 'in', content, mediaType, mediaUrl, waId: msg.key.id ?? undefined, sentAt });

    // Silent product mention classification (always runs, regardless of AI being enabled)
    if (text) this.classifyAndSaveMention(userId, contact.businessId, contact.id, text).catch(() => {});

    const quotedMsgId: string | null =
      (msg.message?.extendedTextMessage?.contextInfo?.stanzaId) ?? null;

    this.emit('message', userId, businessId, {
      contact: { ...contact, unreadCount: 1 },
      message: {
        id: msg.key.id!,
        waId: msg.key.id!,
        contactId: contact.id,
        direction: 'in',
        content,
        mediaUrl,
        mediaType,
        quotedMsgId,
        ack: 3,
        fromAi: false,
        sentAt,
      },
    });

    // ── Accumulate into the pending batch, then debounce engagement ────────────────
    // A burst of messages from the same contact collapses into a single AI turn once
    // the burst goes quiet (see engageContact) — this also is what makes the bot wait
    // before reacting, rather than opening/replying within milliseconds like a script.
    const contactKey = `${key}:${phone}`;
    const msgHasContent = !!text || ['image', 'audio'].includes(mediaType ?? '');
    const batch = this.pendingBatches.get(contactKey);
    if (batch) {
      batch.texts.push(content);
      batch.hasContent = batch.hasContent || msgHasContent;
      batch.aiEnabled = contact.aiEnabled;
      batch.leadStatus = contact.leadStatus ?? null;
      if (mediaBase64 && mediaMimetype) {
        batch.mediaBase64 = mediaBase64;
        batch.mediaMimetype = mediaMimetype;
      }
    } else {
      this.pendingBatches.set(contactKey, {
        texts: [content],
        isFirst,
        jid,
        contactId: contact.id,
        aiEnabled: contact.aiEnabled,
        leadStatus: contact.leadStatus ?? null,
        mediaBase64: mediaBase64 ?? undefined,
        mediaMimetype: mediaMimetype ?? undefined,
        hasContent: msgHasContent,
      });
    }
    this.logger.log(`[batch] ${contactKey}: ${batch ? 'appended to' : 'started'} batch (now ${this.pendingBatches.get(contactKey)?.texts.length} msg(s))`);
    this.scheduleEngagement(contactKey, userId, businessId, phone);
  }

  // Reset (or start) the quiet-window timer for one contact. Called on every
  // incoming message — a fresh message always pushes the flush further out, so a
  // burst only flushes once the contact actually stops typing.
  private scheduleEngagement(contactKey: string, userId: string, businessId: string | null, phone: string): void {
    const prevTimer = this.engagementTimers.get(contactKey);
    if (prevTimer) clearTimeout(prevTimer);

    // 4–7s: long enough to catch a fast follow-up message, short enough to still feel
    // prompt. Also serves as the anti-ban "a human doesn't react instantly" delay.
    const waitMs = Math.floor(Math.random() * 3000) + 4000;
    const timer = setTimeout(() => {
      this.engagementTimers.delete(contactKey);
      this.engageContact(userId, businessId, phone).catch(err =>
        this.logger.error(`Engagement error [${contactKey}]:`, err?.message ?? err)
      );
    }, waitMs);
    this.engagementTimers.set(contactKey, timer);
  }

  // Flushes one contact's pending batch: runs automations, then the AI reply, treating
  // every message accumulated during the quiet window as a single conversational turn.
  private async engageContact(userId: string, businessId: string | null, phone: string): Promise<void> {
    const key = this.waKey(userId, businessId);
    const contactKey = `${key}:${phone}`;
    const batch = this.pendingBatches.get(contactKey);
    if (!batch) {
      this.logger.warn(`[engage] ${contactKey}: fired with no pending batch — should not happen`);
      return;
    }
    this.pendingBatches.delete(contactKey);

    const sock = this.sockets.get(key);
    if (!sock || !this.connectedUsers.has(key)) {
      this.logger.warn(`[engage] ${contactKey}: no live socket (sock=${!!sock}, connected=${this.connectedUsers.has(key)}) — dropping batch of ${batch.texts.length} msg(s)`);
      return;
    }

    const combinedText = batch.texts.filter(Boolean).join('\n');
    const jid = batch.jid;
    this.logger.log(`[engage] ${contactKey}: flushing ${batch.texts.length} msg(s) — "${combinedText.slice(0, 120)}"`);

    // ── Automations ───────────────────────────────────────────────────────────────
    const event = batch.isFirst ? 'welcome' : 'message';
    const autoMessages = await this.automationService.process(userId, batch.contactId, event, { message: combinedText });
    for (const autoMsg of autoMessages) {
      await this.sendMessageViaSocket(userId, businessId, sock, jid, phone, autoMsg, batch.contactId, null);
    }
    if (autoMessages.length > 0) {
      this.logger.log(`[engage] ${contactKey}: ${autoMessages.length} automation reply sent, skipping AI`);
    }

    // ── AI reply ──────────────────────────────────────────────────────────────────
    if (!batch.aiEnabled || autoMessages.length > 0 || !batch.hasContent) {
      this.logger.log(`[engage] ${contactKey}: AI skipped (aiEnabled=${batch.aiEnabled}, autoSent=${autoMessages.length}, hasContent=${batch.hasContent})`);
      return;
    }

    const aiConfig = await this.prisma.whatsAppAIConfig.findFirst({ where: { userId, businessId } });
    const hasAgentConfig = !!aiConfig?.systemPrompt?.trim() && aiConfig.enabled;
    const kbCount = await this.prisma.whatsAppKBEntry.count({ where: { userId, businessId, enabled: true } });
    if (!hasAgentConfig || kbCount === 0) {
      this.logger.log(`[engage] ${contactKey}: AI not configured (hasAgentConfig=${hasAgentConfig}, kbCount=${kbCount}) — no reply`);
      return;
    }

    const delay = Math.floor(Math.random() * 7000) + 3000; // 3–10s "typing" on top of the quiet window above

    await sock.sendPresenceUpdate('composing', jid).catch(() => {});
    await new Promise(r => setTimeout(r, delay));
    await sock.sendPresenceUpdate('paused', jid).catch(() => {});

    // History excludes this batch's own messages — they become the new turn below.
    const fullCache = this.getCache(userId, businessId, phone);
    const history = fullCache.slice(0, -batch.texts.length).map(m => ({
      direction: m.direction,
      content: m.content,
    }));

    const aiResult = await this.aiService.reply(
      userId, businessId, phone, history, combinedText,
      batch.mediaBase64, batch.mediaMimetype,
      batch.leadStatus ?? undefined,
    );

    if (!aiResult?.text) {
      this.logger.log(`[engage] ${contactKey}: aiService.reply returned no text — nothing to send`);
      return;
    }
    this.logger.log(`[engage] ${contactKey}: sending AI reply (${aiResult.text.length} chars)`);

    await this.sendMessageViaSocket(userId, businessId, sock, jid, phone, aiResult.text, batch.contactId, true);

    if (aiResult.imageUrl) {
      await this.sendImageViaSocket(sock, jid, aiResult.imageUrl).catch(() => {});
    }

    if (aiResult.shouldEscalate) {
      await this.prisma.whatsAppContact.update({ where: { id: batch.contactId }, data: { aiEnabled: false } });
      this.emit('contact-updated', userId, businessId, { contactId: batch.contactId, aiEnabled: false });
    }

    const qualifyHistory = [
      ...history,
      { direction: 'in', content: combinedText },
      { direction: 'out', content: aiResult.text },
    ];
    const qualification = await this.aiService.qualify(userId, qualifyHistory);
    if (qualification && Object.keys(qualification).length > 0) {
      await this.prisma.whatsAppContact.update({
        where: { id: batch.contactId },
        data: {
          ...(qualification.leadName && { leadName: qualification.leadName }),
          ...(qualification.leadNeed && { leadNeed: qualification.leadNeed }),
          ...(qualification.leadBudget && { leadBudget: qualification.leadBudget }),
          ...(qualification.leadCity && { leadCity: qualification.leadCity }),
          ...(qualification.leadUrgency && { leadUrgency: qualification.leadUrgency }),
          ...(qualification.leadProduct && { leadProduct: qualification.leadProduct }),
          ...(qualification.leadScore !== undefined && { leadScore: qualification.leadScore }),
          ...(qualification.leadStatus && { leadStatus: qualification.leadStatus }),
        },
      });
      this.emit('lead-updated', userId, businessId, { contactId: batch.contactId, ...qualification });

      if (qualification.leadStatus === 'hot' && batch.leadStatus !== 'hot') {
        await this.automationService.process(userId, batch.contactId, 'lead_status', { status: 'hot' });
      }
      if (qualification.leadStatus === 'converted' && batch.leadStatus !== 'converted') {
        const recap = await this.aiService.generateOrderRecap(qualifyHistory, aiConfig?.primaryLanguage ?? 'fr');
        if (recap) await this.sendMessageViaSocket(userId, businessId, sock, jid, phone, recap, batch.contactId, true);
        // Mark all product mentions for this contact as converted
        await this.prisma.whatsAppProductMention.updateMany({
          where: { contactId: batch.contactId, isConverted: false },
          data: { isConverted: true },
        }).catch(() => {});
      }
    }
  }

  // Messages sent from physical phone (not via API)
  private async handleOutgoingFromPhone(
    userId: string,
    businessId: string | null,
    msg: WAMessage,
  ): Promise<void> {
    const jid = msg.key.remoteJid!;
    const phone = jidToDb(jid);
    const text = extractText(msg.message) ?? '';
    const timestamp = Number(msg.messageTimestamp ?? Date.now() / 1000) * 1000;
    const sentAt = new Date(timestamp).toISOString();

    const contact = await this.upsertContact(userId, businessId, phone);
    const content = text || '[message]';
    this.addToCache(userId, businessId, phone, { direction: 'out', content, waId: msg.key.id ?? undefined, sentAt });

    this.emit('message', userId, businessId, {
      contact,
      message: {
        id: msg.key.id!,
        waId: msg.key.id!,
        contactId: contact.id,
        direction: 'out',
        content,
        mediaType: null,
        mediaUrl: null,
        quotedMsgId: null,
        ack: 1,
        fromAi: false,
        sentAt,
      },
    });
  }

  // ── Silent product mention classification ─────────────────────────────────────
  private async classifyAndSaveMention(
    userId: string,
    businessId: string | null | undefined,
    contactId: string,
    text: string,
  ): Promise<void> {
    const products = await this.prisma.product.findMany({
      where: { userId, businessId: businessId ?? null },
      select: { id: true, name: true },
    });
    if (!products.length) return;

    const result = await this.aiService.classifyProductMention(text, products);
    if (!result.productName) return;

    await this.prisma.whatsAppProductMention.create({
      data: {
        userId,
        businessId: businessId ?? userId,
        contactId,
        productId: result.productId ?? null,
        productName: result.productName,
        messageText: text.substring(0, 500),
      },
    });
  }

  // ── Internal send helpers ─────────────────────────────────────────────────────

  private async sendMessageViaSocket(
    userId: string,
    businessId: string | null,
    sock: WASocket,
    jid: string,
    phone: string,
    text: string,
    contactId: string,
    fromAi: boolean | null,
  ): Promise<void> {
    // Rate limiting: if window is full, wait for it to reset
    const wait = this.rateWait(userId, businessId, 25);
    if (wait > 0) {
      this.logger.warn(`Rate limit reached for ${this.waKey(userId, businessId)}, waiting ${Math.ceil(wait / 1000)}s`);
      await new Promise(r => setTimeout(r, wait + 500));
    }

    // Human-like jitter between messages (shorter for AI replies to feel natural)
    const isAi = fromAi === true;
    await this.jitter(isAi ? 300 : 500, isAi ? 1200 : 2000);

    let result: any;
    try {
      result = await sock.sendMessage(jid, { text });
    } catch (err: any) {
      this.logger.warn(`sendMessage error: ${err?.message}`);
      result = null;
    }

    const waId = result?.key?.id ?? null;
    if (waId) this.getPendingSet(userId, businessId).add(waId);

    const sentAt = new Date().toISOString();
    this.addToCache(userId, businessId, phone, { direction: 'out', content: text, waId: waId ?? undefined, sentAt });

    this.emit('message', userId, businessId, {
      contact: { id: contactId },
      message: {
        id: waId ?? `out-${Date.now()}`,
        waId,
        contactId,
        direction: 'out',
        content: text,
        mediaType: null,
        mediaUrl: null,
        quotedMsgId: null,
        ack: 1,
        fromAi: fromAi ?? false,
        sentAt,
      },
    });
  }

  private async sendImageViaSocket(sock: WASocket, jid: string, imageUrl: string): Promise<void> {
    if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
      await sock.sendMessage(jid, { image: { url: imageUrl } });
    } else {
      const fullPath = imageUrl.startsWith('/') ? path.join(process.cwd(), imageUrl) : imageUrl;
      const buffer = fs.readFileSync(fullPath);
      await sock.sendMessage(jid, { image: buffer });
    }
  }

  // ── Public API methods ────────────────────────────────────────────────────────

  async sendMessage(
    userId: string,
    businessId: string | null,
    phone: string,
    text: string,
    contactId: string,
    fromAi: boolean | null = false,
    _clientOverride?: any,
  ): Promise<void> {
    const key = this.waKey(userId, businessId);
    const sock = this.sockets.get(key);
    if (!sock || !this.connectedUsers.has(key)) {
      throw new HttpException('WhatsApp non connecté', HttpStatus.SERVICE_UNAVAILABLE);
    }
    const jid = toJid(phone);
    await this.sendMessageViaSocket(userId, businessId, sock, jid, jidToDb(jid), text, contactId, fromAi);
  }

  async sendImage(userId: string, businessId: string | null, phone: string, imageUrl: string, _clientOverride?: any): Promise<void> {
    const key = this.waKey(userId, businessId);
    const sock = this.sockets.get(key);
    if (!sock || !this.connectedUsers.has(key)) {
      throw new HttpException('WhatsApp non connecté', HttpStatus.SERVICE_UNAVAILABLE);
    }
    await this.sendImageViaSocket(sock, toJid(phone), imageUrl);
  }

  async sendDocument(userId: string, businessId: string | null, phone: string, buffer: Buffer, filename: string, mimetype: string): Promise<void> {
    const key = this.waKey(userId, businessId);
    const sock = this.sockets.get(key);
    if (!sock || !this.connectedUsers.has(key)) {
      throw new HttpException('WhatsApp non connecté', HttpStatus.SERVICE_UNAVAILABLE);
    }
    await sock.sendMessage(toJid(phone), { document: buffer, mimetype, fileName: filename });
  }

  async sendReply(userId: string, businessId: string | null, phone: string, text: string, contactId: string, _quotedWaId: string): Promise<void> {
    await this.sendMessage(userId, businessId, phone, text, contactId, false);
  }

  async notifyOrder(
    userId: string,
    businessId: string | null,
    toPhone: string,
    text: string,
    imagePath?: string,
  ): Promise<boolean> {
    const key = this.waKey(userId, businessId);
    const sock = this.sockets.get(key);
    if (!sock) {
      this.logger.warn(`notifyOrder [${key}]: no socket`);
      return false;
    }

    return new Promise<boolean>(resolve => {
      this.bulkQueue = this.bulkQueue.then(async () => {
        try {
          const wait = this.rateWait(userId, businessId, 25);
          if (wait > 0) await new Promise(r => setTimeout(r, wait + 500));

          await this.jitter(1500, 3500);

          const currentSock = this.sockets.get(key);
          if (!currentSock) {
            this.logger.warn(`notifyOrder [${key}]: socket lost before send`);
            resolve(false);
            return;
          }

          const jid = toJid(toPhone);

          if (imagePath && fs.existsSync(imagePath)) {
            // Single message: image + full details as caption
            this.logger.log(`notifyOrder [${key}]: sending image+caption to ${jid}`);
            const buffer = fs.readFileSync(imagePath);
            const ext = path.extname(imagePath).toLowerCase();
            const mimetype = ext === '.png' ? 'image/png'
              : ext === '.webp' ? 'image/webp'
              : ext === '.gif' ? 'image/gif'
              : 'image/jpeg';
            await currentSock.sendMessage(jid, { image: buffer, caption: text, mimetype });
          } else {
            // No image — plain text
            this.logger.log(`notifyOrder [${key}]: sending text to ${jid}`);
            await currentSock.sendMessage(jid, { text });
          }

          resolve(true);
        } catch (err: any) {
          this.logger.warn(`notifyOrder [${key}]: failed — ${err?.message}`);
          resolve(false);
        }
      });
    });
  }

  // ── Contacts ──────────────────────────────────────────────────────────────────

  async getContacts(
    userId: string,
    businessId: string | null,
    filter?: string,
    search?: string,
    tagId?: string,
  ): Promise<any[]> {
    const dbContacts = await this.prisma.whatsAppContact.findMany({
      where: { userId, businessId },
      include: { tags: { include: { tag: true } } },
    });

    return dbContacts
      .filter(c => {
        if (filter === 'archived' && !c.isArchived) return false;
        if (filter !== 'archived' && c.isArchived) return false;
        if (filter === 'assigned' && !c.assignedAgent) return false;
        if (filter === 'hot' && c.leadStatus !== 'hot') return false;
        if (tagId && !c.tags?.some((t: any) => t.tagId === tagId)) return false;
        if (search) {
          const s = search.toLowerCase();
          if (
            !c.phone.includes(s) &&
            !c.displayName?.toLowerCase().includes(s) &&
            !c.leadName?.toLowerCase().includes(s)
          ) return false;
        }
        return true;
      })
      .map(c => {
        const cache = this.getCache(userId, businessId, c.phone);
        const last = cache[cache.length - 1];
        const liveDisplayName = this.contactNames.get(`${this.waKey(userId, businessId)}:${toJid(c.phone)}`);
        return {
          id: c.id,
          phone: c.phone,
          displayName: liveDisplayName ?? c.displayName ?? c.phone,
          lastMessageAt: last?.sentAt ?? null,
          lastMessageText: last?.content ?? null,
          unreadCount: 0,
          isRead: true,
          isArchived: c.isArchived ?? false,
          assignedAgent: c.assignedAgent ?? null,
          aiEnabled: c.aiEnabled ?? true,
          leadStatus: c.leadStatus ?? 'cold',
          leadScore: c.leadScore ?? 0,
          leadName: c.leadName ?? null,
          leadNeed: c.leadNeed ?? null,
          leadBudget: c.leadBudget ?? null,
          leadCity: c.leadCity ?? null,
          leadUrgency: c.leadUrgency ?? null,
          leadProduct: c.leadProduct ?? null,
          source: c.source ?? null,
          tags: c.tags ?? [],
        };
      });
  }

  // Returns cached messages (in-memory, rebuilt as messages flow)
  async getMessages(userId: string, businessId: string | null, contactId: string, limit = 50): Promise<any[]> {
    let phone = contactId;
    if (!contactId.includes('@')) {
      const db = await this.prisma.whatsAppContact.findFirst({ where: { id: contactId, userId, businessId } });
      if (db) phone = db.phone;
    }
    const cache = this.getCache(userId, businessId, phone);
    return cache.slice(-limit).map((m, i) => ({
      id: m.waId ?? `cached-${i}`,
      waId: m.waId ?? null,
      contactId,
      direction: m.direction,
      content: m.content,
      mediaType: m.mediaType ?? null,
      mediaUrl: m.mediaUrl ?? null,
      quotedMsgId: null,
      ack: m.direction === 'in' ? 3 : 2,
      fromAi: false,
      sentAt: m.sentAt,
    }));
  }

  async markRead(_userId: string, _phone: string): Promise<void> {
    // No-op: Baileys mark-read requires full message key objects
  }

  async applyLabelToChat(_userId: string, _phone: string, labelName: string): Promise<boolean> {
    this.logger.warn(`applyLabelToChat "${labelName}": WA labels require Business API, not supported`);
    return false;
  }

  // ── Groups ────────────────────────────────────────────────────────────────────

  async getGroups(userId: string, businessId: string | null): Promise<{ id: string; name: string; participants: number }[]> {
    const key = this.waKey(userId, businessId);
    const sock = this.sockets.get(key);
    const isConnected = this.connectedUsers.has(key);
    const cached = this.groupsCache.get(key) ?? [];

    this.logger.log(`getGroups [${key}]: sock=${!!sock}, connected=${isConnected}, cache=${cached.length}`);

    if (!sock) {
      this.logger.warn(`getGroups [${key}]: no socket, returning cache`);
      return cached;
    }
    if (!isConnected) {
      this.logger.warn(`getGroups [${key}]: not in connectedUsers, returning cache`);
      return cached;
    }

    // Live fetch
    try {
      this.logger.log(`getGroups [${key}]: calling groupFetchAllParticipating...`);
      const raw = await sock.groupFetchAllParticipating();
      const ids = Object.keys(raw ?? {});
      this.logger.log(`getGroups [${key}]: got ${ids.length} groups from WA`);

      const list = ids
        .map(id => {
          const g = raw[id] as any;
          return {
            id,
            name: (g.subject ?? g.name ?? id) as string,
            participants: (g.participants as any[])?.length ?? 0,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));

      if (list.length > 0) this.groupsCache.set(key, list);
      return list;
    } catch (err: any) {
      this.logger.warn(`getGroups [${key}]: groupFetchAllParticipating threw: ${err?.message}`);
    }

    // Cache fallback
    if (cached.length > 0) {
      this.logger.log(`getGroups [${key}]: returning ${cached.length} cached groups`);
      return cached;
    }

    // Wait 3s and retry once (first call right after fresh connection)
    this.logger.log(`getGroups [${key}]: cache empty, retrying in 3s...`);
    await new Promise(r => setTimeout(r, 3000));
    try {
      const raw = await sock.groupFetchAllParticipating();
      const list = Object.entries(raw ?? {}).map(([id, g]: [string, any]) => ({
        id,
        name: (g.subject ?? g.name ?? id) as string,
        participants: (g.participants as any[])?.length ?? 0,
      })).sort((a, b) => a.name.localeCompare(b.name));
      this.logger.log(`getGroups [${key}]: retry got ${list.length} groups`);
      if (list.length > 0) this.groupsCache.set(key, list);
      return list;
    } catch (err: any) {
      this.logger.warn(`getGroups [${key}]: retry also failed: ${err?.message}`);
      return [];
    }
  }

  // ── Audience contact directory sync ──────────────────────────────────────────

  async syncContactDirectory(userId: string, businessId: string | null): Promise<void> {
    const waPrefix = `${this.waKey(userId, businessId)}:`;
    const session = await this.prisma.whatsAppSession.findFirst({ where: { userId, businessId } });
    const waAccountId = session?.phone ?? null;
    const profile = await this.prisma.userProfile.findUnique({ where: { userId } });
    const businessSector = profile?.businessSector ?? null;
    const now = new Date();

    // Build list from in-memory contact names (populated by contacts.upsert event)
    const contacts: Array<{ phone: string; displayName: string | null }> = [];
    for (const [cacheKey, name] of this.contactNames.entries()) {
      if (!cacheKey.startsWith(waPrefix)) continue;
      const jid = cacheKey.slice(waPrefix.length);
      if (jid.endsWith('@g.us') || jid.includes('@broadcast') || jid === 'status@broadcast') continue;
      const phone = jidToDb(jid);
      if (phone.endsWith('@lid')) continue;
      contacts.push({ phone, displayName: name });
    }

    this.logger.log(`Audience sync: ${contacts.length} contacts for ${waPrefix}`);
    this.emit('audience-sync-start', userId, businessId, { total: contacts.length });

    const BATCH = 50;
    let done = 0;
    for (let i = 0; i < contacts.length; i += BATCH) {
      const chunk = contacts.slice(i, i + BATCH);
      await Promise.all(chunk.map(c =>
        this.prisma.waCampaignContact.upsert({
          where: { clientId_phoneNumber: { clientId: userId, phoneNumber: c.phone } },
          create: { clientId: userId, businessId, phoneNumber: c.phone, displayName: c.displayName, waAccountId, businessSector, source: 'whatsapp_sync', syncedAt: now },
          update: { displayName: c.displayName, waAccountId, syncedAt: now, ...(businessSector ? { businessSector } : {}) },
        }).catch(() => {})
      ));
      done += chunk.length;
      this.emit('audience-sync-progress', userId, businessId, { done, total: contacts.length });
    }

    this.emit('audience-sync-complete', userId, businessId, { total: done });
    this.logger.log(`Audience sync complete for ${userId}: ${done} contacts`);
  }

  // ── Safe contact upsert ───────────────────────────────────────────────────────

  // businessId is nullable, so the (userId, businessId, phone) unique can't drive an
  // upsert — look up first, then create, retrying the read on a unique-violation race.
  private async upsertContact(
    userId: string,
    businessId: string | null,
    phone: string,
    data: { displayName?: string | null } = {},
  ) {
    const include = { tags: { include: { tag: true } } };
    const existing = await this.prisma.whatsAppContact.findFirst({
      where: { userId, businessId, phone },
      include,
    });

    if (existing) {
      if (!data.displayName || data.displayName === existing.displayName) return existing;
      return this.prisma.whatsAppContact.update({
        where: { id: existing.id },
        data: { displayName: data.displayName },
        include,
      });
    }

    try {
      return await this.prisma.whatsAppContact.create({
        data: { userId, businessId, phone, ...(data.displayName ? { displayName: data.displayName } : {}) },
        include,
      });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        const raced = await this.prisma.whatsAppContact.findFirst({
          where: { userId, businessId, phone },
          include,
        });
        if (raced) return raced;
      }
      throw err;
    }
  }

  // ── Disconnect ────────────────────────────────────────────────────────────────

  async disconnect(userId: string, businessId: string | null): Promise<void> {
    const key = this.waKey(userId, businessId);
    this.loggedOut.add(key);
    this.clearKeepAlive(userId, businessId);
    const sock = this.sockets.get(key);
    if (sock) {
      await sock.logout().catch(() => {});
      (sock.ev as any).removeAllListeners();
      this.sockets.delete(key);
      this.connectedUsers.delete(key);
    }
    await clearDbAuth(userId, businessId, this.prisma);

    await this.markSession(userId, businessId, { connected: false }).catch(() => {});

    const pendingReconnect = this.reconnectTimers.get(key);
    if (pendingReconnect) { clearTimeout(pendingReconnect); this.reconnectTimers.delete(key); }
    this.connecting.delete(key);

    this.pendingSendIds.delete(key);
    this.clearPendingEngagements(key);
    this.emit('disconnected', userId, businessId, {});
  }

  // Drop any queued "reply after the burst goes quiet" work for one business — its
  // socket is gone, so engageContact would only no-op anyway; this just skips the wait.
  private clearPendingEngagements(businessKey: string): void {
    const prefix = `${businessKey}:`;
    for (const [contactKey, timer] of this.engagementTimers) {
      if (!contactKey.startsWith(prefix)) continue;
      clearTimeout(timer);
      this.engagementTimers.delete(contactKey);
      this.pendingBatches.delete(contactKey);
    }
  }

  async getStatus(userId: string, businessId: string | null) {
    const session = await this.prisma.whatsAppSession.findFirst({ where: { userId, businessId } });
    return {
      connected: this.connectedUsers.has(this.waKey(userId, businessId)),
      phone: session?.phone ?? null,
    };
  }

  async reconnectAll(): Promise<void> {
    const sessions = await this.prisma.whatsAppSession.findMany({ where: { connected: true } });
    for (const s of sessions) {
      this.logger.log(`Auto-reconnecting ${s.userId}/${s.businessId}`);
      this.connect(s.userId, s.businessId).catch(err =>
        this.logger.error(`Reconnect failed ${s.userId}/${s.businessId}:`, err)
      );
    }
  }

  onModuleDestroy() {
    for (const [, timer] of this.keepAliveTimers) clearInterval(timer);
    this.keepAliveTimers.clear();
    for (const [, timer] of this.engagementTimers) clearTimeout(timer);
    this.engagementTimers.clear();
    this.pendingBatches.clear();
    for (const [, timer] of this.reconnectTimers) clearTimeout(timer);
    this.reconnectTimers.clear();
    this.connecting.clear();
    for (const [, sock] of this.sockets) {
      (sock.ev as any).removeAllListeners();
      sock.end(new Error('shutdown'));
    }
    this.sockets.clear();
    this.connectedUsers.clear();
  }

}
