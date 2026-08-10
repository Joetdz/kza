import { Injectable, Logger, OnModuleDestroy, OnModuleInit, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from './ai.service';
import { AutomationService } from './automation.service';
import makeWASocket, {
  useMultiFileAuthState,
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
  // Trigger label names (case/accent-insensitive) that auto-create a draft order.
  // Short prefixes — matching uses .includes() so "livraison programmée" still matches "livraison".
  private static DRAFT_TRIGGER_LABELS = ['livraison', 'new order', 'commande', 'nouvelle commande'];
  // Grace window after connection during which label events are treated as historical and ignored
  private static LABEL_SYNC_GRACE_MS = 45_000; // 45 seconds

  constructor(
    private prisma: PrismaService,
    private aiService: AiService,
    private automationService: AutomationService,
  ) {}

  // ── Auto-reconnect on server startup ─────────────────────────────────────────

  async onModuleInit(): Promise<void> {
    try {
      const sessions = await this.prisma.whatsAppSession.findMany({ where: { connected: true } });
      if (sessions.length === 0) return;
      this.logger.log(`Auto-reconnecting ${sessions.length} WhatsApp session(s) after server restart...`);
      sessions.forEach((session, idx) => {
        // Stagger by 3 s per user to avoid hammering WA simultaneously
        setTimeout(() => {
          this.connect(session.userId).catch(err =>
            this.logger.error(`Auto-reconnect failed for ${session.userId}:`, err?.message),
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

  private emit(event: string, userId: string, data: any) {
    if (this.gatewayEmit) this.gatewayEmit(event, userId, data);
  }

  private authPath(userId: string): string {
    return path.join(process.cwd(), '.baileys_auth', userId);
  }

  private getPendingSet(userId: string): Set<string> {
    if (!this.pendingSendIds.has(userId)) this.pendingSendIds.set(userId, new Set());
    return this.pendingSendIds.get(userId)!;
  }

  // ── Per-contact sequential message queue ─────────────────────────────────────

  private enqueue(userId: string, phone: string, handler: () => Promise<void>): void {
    const key = `${userId}:${phone}`;
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

  private addToCache(userId: string, phone: string, msg: CachedMsg) {
    const key = `${userId}:${phone}`;
    const cache = this.msgCache.get(key) ?? [];
    cache.push(msg);
    if (cache.length > 50) cache.shift();
    this.msgCache.set(key, cache);
  }

  private getCache(userId: string, phone: string): CachedMsg[] {
    return this.msgCache.get(`${userId}:${phone}`) ?? [];
  }

  // Public accessor for controller (create-draft-order)
  getCacheForContact(userId: string, phone: string): Array<{ direction: string; content: string }> {
    return this.getCache(userId, phone).map(m => ({ direction: m.direction, content: m.content }));
  }

  // Request WA Business label list so labelNames cache is populated after reconnect
  private async refreshLabels(userId: string, sock: WASocket): Promise<void> {
    try {
      const result = await (sock as any).query({
        tag: 'iq',
        attrs: { to: 's.whatsapp.net', type: 'get', xmlns: 'w:biz:label' },
        content: [{ tag: 'label', attrs: {} }],
      });
      const nodes: any[] = Array.isArray(result?.content) ? result.content : [];
      for (const node of nodes) {
        const id = node?.attrs?.id;
        const name = node?.attrs?.name;
        if (id && name) {
          this.labelNames.set(`${userId}:${id}`, name);
          this.logger.log(`Label refreshed: ${id} → "${name}"`);
        }
      }
    } catch {
      // Not all WhatsApp accounts support label queries — silently ignore
    }
  }

  // Resolve a JID or LID to the real phone number (@c.us format).
  // WhatsApp v7 multi-device uses LIDs in label events instead of phone numbers.
  private resolvePhone(userId: string, jid: string): string {
    // Already a normal phone JID
    if (jid.endsWith('@s.whatsapp.net')) return jidToDb(jid);
    // Remove the suffix to get the raw ID
    const raw = jid.replace(/@c\.us$/, '').replace(/@lid$/, '').replace(/@s\.whatsapp\.net$/, '');
    // Check if it looks like a real DRC/international phone (≤13 digits)
    const digits = raw.replace(/\D/g, '');
    if (digits.length <= 13) return jidToDb(jid); // treat as normal phone
    // Looks like a LID (>13 digits) — look up mapping
    const mapped = this.lidToPhone.get(`${userId}:${raw}`);
    if (mapped) {
      this.logger.log(`LID resolved: ${raw} → ${mapped}`);
      return mapped;
    }
    this.logger.warn(`LID ${raw} not yet mapped — using raw JID as fallback`);
    return jidToDb(jid);
  }

  private scheduleReconnect(userId: string) {
    if (this.loggedOut.has(userId)) return;
    // Don't auto-reconnect if a pairing is in progress — let the timeout handle it
    if (this.pairingPhones.has(userId)) return;
    const delay = Math.min(this.reconnectDelay.get(userId) ?? 5000, 60_000);
    this.reconnectDelay.set(userId, delay * 2);
    this.logger.log(`Reconnecting ${userId} in ${delay}ms`);
    setTimeout(() => {
      if (!this.loggedOut.has(userId) && !this.sockets.has(userId) && !this.pairingPhones.has(userId)) {
        this.connect(userId);
      }
    }, delay);
  }

  // ── Anti-ban helpers ──────────────────────────────────────────────────────────

  // Random human-like delay between messages (min-max ms)
  private jitter(minMs = 800, maxMs = 3000): Promise<void> {
    const ms = Math.floor(Math.random() * (maxMs - minMs)) + minMs;
    return new Promise(r => setTimeout(r, ms));
  }

  // Rate limit outgoing messages: max `limit` per 60s window per user.
  // Returns how many ms to wait (0 = no wait needed).
  private rateWait(userId: string, limit = 25): number {
    const now = Date.now();
    const r = this.rateLimiters.get(userId);
    if (!r || now > r.resetAt) {
      this.rateLimiters.set(userId, { count: 1, resetAt: now + 60_000 });
      return 0;
    }
    if (r.count >= limit) {
      return r.resetAt - now; // wait until window resets
    }
    r.count++;
    return 0;
  }

  private clearKeepAlive(userId: string) {
    const t = this.keepAliveTimers.get(userId);
    if (t) { clearInterval(t); this.keepAliveTimers.delete(userId); }
  }

  private clearPairingTimeout(userId: string) {
    const t = this.pairingTimeouts.get(userId);
    if (t) { clearTimeout(t); this.pairingTimeouts.delete(userId); }
  }

  // ── Connect ───────────────────────────────────────────────────────────────────

  async connect(userId: string): Promise<void> {
    if (this.sockets.has(userId)) {
      const session = await this.prisma.whatsAppSession.findUnique({ where: { userId } });
      if (session?.connected && this.connectedUsers.has(userId)) {
        this.emit('connected', userId, { phone: session.phone });
      }
      return;
    }

    const authDir = this.authPath(userId);
    fs.mkdirSync(authDir, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(authDir);

    // fetchLatestBaileysVersion hits GitHub — may hang on VPS; fall back to pinned version after 5s
    const FALLBACK_VERSION: [number, number, number] = [2, 3000, 1015901307];
    let version: [number, number, number];
    try {
      const timeout = new Promise<{ version: [number, number, number] }>(resolve =>
        setTimeout(() => resolve({ version: FALLBACK_VERSION }), 5000),
      );
      const result = await Promise.race([fetchLatestBaileysVersion(), timeout]);
      version = result.version;
    } catch {
      version = FALLBACK_VERSION;
    }

    const pairingPhone = this.pairingPhones.get(userId);

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

    this.sockets.set(userId, sock);

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        if (pairingPhone) {
          this.clearPairingTimeout(userId);
          try {
            const code = await sock.requestPairingCode(pairingPhone.replace(/\D/g, ''));
            this.pairingPhones.delete(userId);
            this.emit('pairing_code', userId, { code });
          } catch (err: any) {
            this.pairingPhones.delete(userId);
            this.emit('pairing_error', userId, {
              message: 'Impossible de générer le code. Réessayez.',
            });
          }
        } else {
          const qrDataUrl = await qrcode.toDataURL(qr);
          this.emit('qr', userId, { qr: qrDataUrl });
        }
      }

      if (connection === 'connecting') {
        this.emit('loading', userId, { percent: 50, message: 'Connexion...' });
      }

      if (connection === 'open') {
        const rawId = sock.user?.id ?? '';
        const phone = rawId ? jidNormalizedUser(rawId).split('@')[0] : null;
        this.connectedUsers.add(userId);
        this.reconnectDelay.set(userId, 5000);
        this.pairingPhones.delete(userId);

        await this.prisma.withRetry(() =>
          this.prisma.whatsAppSession.upsert({
            where: { userId },
            create: { userId, connected: true, phone },
            update: { connected: true, phone },
          })
        );

        this.connectionOpenAt.set(userId, Date.now());
        this.emit('connected', userId, { phone });
        this.logger.log(`WhatsApp connected for ${userId} (${phone}) — label sync window: ${WhatsAppService.LABEL_SYNC_GRACE_MS / 1000}s`);

        // Keep-alive: periodic presence update to prevent session idle-expiry
        this.clearKeepAlive(userId);
        const keepAlive = setInterval(async () => {
          if (this.connectedUsers.has(userId) && this.sockets.has(userId)) {
            await sock.sendPresenceUpdate('available').catch(() => {});
          }
        }, 9 * 60 * 1000); // every 9 minutes
        this.keepAliveTimers.set(userId, keepAlive);

        this.syncContactDirectory(userId).catch(err =>
          this.logger.error(`Contact sync failed for ${userId}:`, err?.message)
        );

        // Request WhatsApp Business labels so cache is populated on reconnect
        this.refreshLabels(userId, sock).catch(() => {});
      }

      if (connection === 'close') {
        this.clearKeepAlive(userId);
        this.sockets.delete(userId);
        this.connectedUsers.delete(userId);
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const isLogout = statusCode === DisconnectReason.loggedOut;

        await this.prisma.whatsAppSession.upsert({
          where: { userId },
          create: { userId, connected: false },
          update: { connected: false },
        }).catch(() => {});

        this.emit('disconnected', userId, { reason: String(statusCode) });

        if (isLogout) {
          const dir = this.authPath(userId);
          if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
          this.logger.log(`WhatsApp logged out for ${userId}`);

          if (this.pairingPhones.has(userId)) {
            // Logout happened during a pairing attempt (stale session wiped by WA)
            // Auth files are now clean — retry the connection to get a fresh QR
            this.logger.log(`Retrying connection for ${userId} after logout during pairing`);
            setTimeout(() => this.connect(userId), 1000);
          } else {
            this.loggedOut.add(userId);
          }
        } else if (!this.loggedOut.has(userId)) {
          this.scheduleReconnect(userId);
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
          if (this.getPendingSet(userId).has(waId)) {
            this.getPendingSet(userId).delete(waId);
            continue; // we already emitted this when we sent it
          }
          if (!jid.endsWith('@g.us')) {
            await this.handleOutgoingFromPhone(userId, msg).catch(err =>
              this.logger.error('handleOutgoingFromPhone error:', err?.message)
            );
          }
        } else {
          if (jid.endsWith('@g.us')) continue; // skip group chat messages
          const phone = jidToDb(jid);
          this.enqueue(userId, phone, () => this.handleIncoming(userId, sock, msg));
        }
      }
    });

    // Contact name updates + LID → phone mapping
    const processContact = (c: any) => {
      const name = c.notify || c.name || null;
      if (name && c.id) this.contactNames.set(`${userId}:${c.id}`, name);
      // Build LID ↔ phone map: if contact has a LID field alongside a normal JID
      const lid: string | undefined = c.lid ?? c.lidJid ?? c.linkedDeviceId;
      if (lid && c.id?.endsWith('@s.whatsapp.net')) {
        const lidRaw = lid.replace(/@lid$/, '').replace(/@c\.us$/, '');
        this.lidToPhone.set(`${userId}:${lidRaw}`, jidToDb(c.id));
        this.logger.log(`LID cached (upsert): ${lidRaw} → ${jidToDb(c.id)}`);
      }
      // Reverse: if the contact itself IS a LID and has a pn (phone number) field
      const pn: string | undefined = c.pn ?? c.phoneNumber ?? c.phone;
      if (pn && c.id && (c.id.endsWith('@lid') || c.id.endsWith('@c.us'))) {
        const lidRaw = c.id.replace(/@lid$/, '').replace(/@c\.us$/, '');
        const digits = lidRaw.replace(/\D/g, '');
        if (digits.length > 12) {
          this.lidToPhone.set(`${userId}:${lidRaw}`, jidToDb(pn));
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
        this.lidToPhone.set(`${userId}:${lidRaw}`, phone);
        this.logger.log(`LID mapped: ${lidRaw} → ${phone}`);
      }
    });

    // Delivery/read receipts
    sock.ev.on('message-receipt.update', (updates) => {
      for (const update of updates) {
        if (update.key?.id) {
          const ack = update.receipt?.receiptTimestamp ? 3 : 2;
          this.emit('message-ack', userId, { waId: update.key.id, ack });
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
        this.groupsCache.set(userId, groups);
        this.logger.log(`Groups cache updated for ${userId}: ${groups.length} groups`);
      }
    };

    // In Baileys v7, initial chats arrive via messaging-history.set
    sock.ev.on('messaging-history.set', ({ chats } : any) => cacheGroups(chats ?? []));
    sock.ev.on('chats.upsert' as any, (chats: any) => {
      const current = this.groupsCache.get(userId) ?? [];
      const updated = [...current];
      const list: any[] = Array.isArray(chats) ? chats : [];
      for (const c of list) {
        if (!(c.id as string)?.endsWith('@g.us')) continue;
        const idx = updated.findIndex(g => g.id === c.id);
        const entry = { id: c.id as string, name: (c.name ?? c.subject ?? c.id) as string, participants: (c.participants as any[])?.length ?? 0 };
        if (idx >= 0) updated[idx] = entry; else updated.push(entry);
      }
      if (updated.length > 0) this.groupsCache.set(userId, updated.sort((a, b) => a.name.localeCompare(b.name)));
    });

    // WhatsApp Business labels — cache label id→name (fires during initial sync)
    const cacheLabels = (labels: any) => {
      const list: any[] = Array.isArray(labels) ? labels : (labels ? [labels] : []);
      for (const label of list) {
        if (label?.id && label?.name) {
          this.labelNames.set(`${userId}:${label.id}`, label.name);
          this.logger.log(`Label cached: ${label.id} → "${label.name}"`);
        }
      }
    };
    sock.ev.on('labels.edit' as any, cacheLabels);
    // Some Baileys builds use 'label.edit' (singular)
    sock.ev.on('label.edit' as any, cacheLabels);

    // Label applied to a chat from the physical WhatsApp Business app → auto-create draft order
    sock.ev.on('labels.association' as any, async (data: any) => {
      try {
        // Ignore label events that arrive within the grace window after connection open.
        // Baileys replays ALL historical label associations during initial app-state sync,
        // which would create hundreds of bogus drafts. Only process real-time events.
        const openAt = this.connectionOpenAt.get(userId) ?? 0;
        const ageMs = Date.now() - openAt;
        if (ageMs < WhatsAppService.LABEL_SYNC_GRACE_MS) {
          this.logger.log(`Skipping historical label event for ${userId} (${Math.round(ageMs / 1000)}s after connect, grace=${WhatsAppService.LABEL_SYNC_GRACE_MS / 1000}s)`);
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
        let labelName = this.labelNames.get(`${userId}:${labelId}`) ?? '';
        if (!labelName) {
          await this.refreshLabels(userId, sock);
          labelName = this.labelNames.get(`${userId}:${labelId}`) ?? '';
        }

        this.logger.log(`Label association: id=${labelId} name="${labelName}" chat=${chatId}`);

        const normalized = (labelName || labelId).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

        const isTrigger = WhatsAppService.DRAFT_TRIGGER_LABELS.some(t => normalized.includes(t));
        if (!isTrigger) return;

        // Resolve LID to real phone number (WhatsApp v7 multi-device uses LIDs in label events)
        let phone = this.resolvePhone(userId, chatId);
        this.logger.log(`Label handler → chatId: ${chatId}, resolved phone: ${phone}`);

        // Detect if LID was not resolved (still has >13 digit number as @c.us)
        const phoneIsLid = /^\d{13,}@c\.us$/.test(phone);

        // Build message history — try in-memory cache first
        let history = this.getCacheForContact(userId, phone);
        let contactDisplayName: string | null = null;

        // If cache is empty OR phone is still a LID, load messages directly from WA
        if (phoneIsLid || history.length === 0) {
          try {
            const rawResult = await (sock as any).loadMessages(chatId, 40, undefined, false);
            const waMessages: WAMessage[] = Array.isArray(rawResult)
              ? rawResult
              : (rawResult?.messages ?? []);

            if (waMessages.length > 0) {
              // Extract real phone JID from a message's remoteJid (non-LID)
              const realMsg = waMessages.find(m =>
                m.key?.remoteJid && !m.key.remoteJid.endsWith('@lid')
              );
              if (realMsg?.key?.remoteJid) {
                const realPhone = jidToDb(realMsg.key.remoteJid);
                if (realPhone !== phone) {
                  const lidRaw = chatId.replace(/@c\.us$/, '').replace(/@lid$/, '');
                  this.lidToPhone.set(`${userId}:${lidRaw}`, realPhone);
                  this.logger.log(`LID resolved via loadMessages: ${chatId} → ${realPhone}`);
                  phone = realPhone;
                  const cached = this.getCacheForContact(userId, phone);
                  if (cached.length > 0) history = cached;
                }
              }

              // Extract contact display name from pushName on incoming messages
              contactDisplayName = waMessages.find(m => !m.key.fromMe && m.pushName)?.pushName ?? null;

              // Build history from WA messages if still empty
              if (history.length === 0) {
                history = waMessages
                  .sort((a, b) => Number(a.messageTimestamp ?? 0) - Number(b.messageTimestamp ?? 0))
                  .map(m => ({
                    direction: (m.key.fromMe ? 'out' : 'in') as 'in' | 'out',
                    content: extractText(m.message) || '',
                  }))
                  .filter(m => m.content.trim().length > 0);
                this.logger.log(`Loaded ${history.length} msgs from WA for ${chatId}`);
              }
            }
          } catch (err: any) {
            this.logger.warn(`loadMessages for ${chatId} failed: ${err?.message}`);
          }
        }

        // Upsert contact — may not exist if conversation was never opened in CRM
        let contact = await this.prisma.whatsAppContact.findUnique({
          where: { userId_phone: { userId, phone } },
        });
        if (!contact) {
          contact = await this.upsertContact(userId, phone, { displayName: contactDisplayName ?? undefined });
        } else if (contactDisplayName && !contact.displayName) {
          contact = await this.upsertContact(userId, phone, { displayName: contactDisplayName });
        }

        // Check no draft already exists for this contact
        const existing = await this.prisma.manualOrder.findFirst({
          where: { userId, sourceContactId: contact.id, isDraft: true },
        });
        if (existing) {
          this.logger.log(`Draft already exists for contact ${contact.id}, skipping`);
          return;
        }

        const details = await this.aiService.extractOrderDetails(history);

        // ── Validation gate — all 5 fields must be present before creating a draft ──
        const resolvedCustomerPhone = normalizeDrcPhone(details.customerPhone) ?? normalizeDrcPhone(phone) ?? null;
        const resolvedCustomerName  = details.customerName ?? contact.leadName ?? contact.displayName ?? contactDisplayName ?? null;

        const missingFields: string[] = [];
        if (!resolvedCustomerPhone)          missingFields.push('numéro client');
        if (!resolvedCustomerName)           missingFields.push('nom client');
        if (!details.productName)            missingFields.push('produit commandé');
        if (details.agreedPriceUsd == null)  missingFields.push('prix $ commande');
        if (details.deliveryFeeCdf == null)  missingFields.push('frais livraison FC');

        if (missingFields.length > 0) {
          this.logger.warn(
            `Draft skipped (missing: ${missingFields.join(', ')}) — label: "${labelName}" chat: ${chatId} history: ${history.length} msgs`
          );
          return;
        }

        const products = await this.prisma.product.findMany({
          where: { userId },
          select: { id: true, name: true, sellingPrice: true },
        });

        let matchedProductId: string | null = null;
        let unitPrice = details.agreedPriceUsd ?? 0;
        if (details.productName && products.length > 0) {
          const needle = details.productName.toLowerCase();
          const matched = products.find(p =>
            p.name.toLowerCase().includes(needle) || needle.includes(p.name.toLowerCase())
          );
          if (matched) {
            matchedProductId = matched.id;
            if (!unitPrice) unitPrice = matched.sellingPrice ?? 0;
          }
        }

        // Get business ID — prefer contact's business, fallback to first business of this user
        let bizId: string = (contact as any).businessId ?? null;
        if (!bizId) {
          const biz = await this.prisma.business.findFirst({
            where: { userId },
            orderBy: { createdAt: 'asc' },
            select: { id: true },
          });
          bizId = biz?.id ?? userId;
        }
        const orderCount = await this.prisma.manualOrder.count({ where: { userId, businessId: bizId } });
        const qty = details.productQuantity ?? 1;

        const order = await this.prisma.manualOrder.create({
          data: {
            userId,
            businessId: bizId,
            orderNumber: orderCount + 1,
            customerName: resolvedCustomerName ?? 'Client WhatsApp',
            customerPhone: resolvedCustomerPhone,
            city: details.city ?? contact.leadCity ?? '',
            address: details.address ?? '',
            deliveryFee: details.deliveryFeeCdf ?? 0,
            totalAmount: matchedProductId ? qty * unitPrice : unitPrice,
            isDraft: true,
            sourceContactId: contact.id,
            notes: details.notes ?? `Brouillon créé automatiquement — label WhatsApp: ${labelName}`,
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

        // Notify frontend
        this.emit('draft-order-created', userId, { orderId: order.id, orderNumber: order.orderNumber, contactId: contact.id });
      } catch (err: any) {
        this.logger.error('labels.association draft error:', err?.message);
      }
    });
  }

  async connectWithPairingCode(userId: string, phone: string): Promise<void> {
    const normalized = phone.replace(/[^0-9]/g, '');
    this.pairingPhones.set(userId, normalized);
    this.clearPairingTimeout(userId);
    this.loggedOut.delete(userId); // allow fresh connection even after a previous logout

    if (this.sockets.has(userId)) {
      const sock = this.sockets.get(userId)!;
      this.sockets.delete(userId);
      this.connectedUsers.delete(userId);
      (sock.ev as any).removeAllListeners();
      sock.end(new Error('reset'));
    }

    // Always wipe stale auth so WhatsApp generates a fresh QR/pairing code
    const authDir = this.authPath(userId);
    if (fs.existsSync(authDir)) {
      fs.rmSync(authDir, { recursive: true, force: true });
      this.logger.log(`Cleared stale auth for ${userId} — fresh pairing`);
    }

    // Emit error if no code arrives within 35s
    const timeout = setTimeout(() => {
      if (this.pairingPhones.has(userId)) {
        this.pairingPhones.delete(userId);
        this.logger.warn(`Pairing timeout for ${userId}`);
        this.emit('pairing_error', userId, {
          message: 'Délai dépassé. Réessayez.',
        });
      }
    }, 35_000);
    this.pairingTimeouts.set(userId, timeout);

    await this.connect(userId);
  }

  // ── Incoming message handler ──────────────────────────────────────────────────

  private async handleIncoming(userId: string, sock: WASocket, msg: WAMessage): Promise<void> {
    const jid = msg.key.remoteJid!;
    const phone = jidToDb(jid);
    const text = extractText(msg.message) ?? '';
    const timestamp = Number(msg.messageTimestamp ?? Date.now() / 1000) * 1000;

    const displayName = this.contactNames.get(`${userId}:${jid}`) ?? null;
    const isFirst = !(await this.prisma.whatsAppContact.findUnique({
      where: { userId_phone: { userId, phone } },
    }));

    const contact = await this.upsertContact(userId, phone, { displayName });

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
    this.addToCache(userId, phone, { direction: 'in', content, mediaType, mediaUrl, waId: msg.key.id ?? undefined, sentAt });

    // Silent product mention classification (always runs, regardless of AI being enabled)
    if (text) this.classifyAndSaveMention(userId, contact.businessId, contact.id, text).catch(() => {});

    const quotedMsgId: string | null =
      (msg.message?.extendedTextMessage?.contextInfo?.stanzaId) ?? null;

    this.emit('message', userId, {
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

    // ── Automations ───────────────────────────────────────────────────────────────
    const event = isFirst ? 'welcome' : 'message';
    const autoMessages = await this.automationService.process(userId, contact.id, event, { message: text });
    for (const autoMsg of autoMessages) {
      await this.sendMessageViaSocket(userId, sock, jid, phone, autoMsg, contact.id, null);
    }

    // ── AI reply ──────────────────────────────────────────────────────────────────
    const hasContent = !!text || ['image', 'audio'].includes(mediaType ?? '');
    if (contact.aiEnabled && autoMessages.length === 0 && hasContent) {
      const hasAgentConfig = await this.prisma.whatsAppAIConfig.findUnique({ where: { userId } })
        .then(c => !!c?.systemPrompt?.trim() && c.enabled);
      const kbCount = await this.prisma.whatsAppKBEntry.count({ where: { userId, enabled: true } });
      if (!hasAgentConfig || kbCount === 0) return;

      const aiConfig = await this.prisma.whatsAppAIConfig.findUnique({ where: { userId } });
      const delay = aiConfig?.simulatedDelayMs ?? 2000;

      await sock.sendPresenceUpdate('composing', jid).catch(() => {});
      await new Promise(r => setTimeout(r, delay));
      await sock.sendPresenceUpdate('paused', jid).catch(() => {});

      // History from in-memory cache (excludes current message)
      const history = this.getCache(userId, phone).slice(0, -1).map(m => ({
        direction: m.direction,
        content: m.content,
      }));

      const aiResult = await this.aiService.reply(
        userId, phone, history, text,
        mediaBase64 ?? undefined, mediaMimetype ?? undefined,
        contact.leadStatus ?? undefined,
      );

      if (aiResult?.text) {
        await this.sendMessageViaSocket(userId, sock, jid, phone, aiResult.text, contact.id, true);

        if (aiResult.imageUrl) {
          await this.sendImageViaSocket(sock, jid, aiResult.imageUrl).catch(() => {});
        }

        if (aiResult.shouldEscalate) {
          await this.prisma.whatsAppContact.update({ where: { id: contact.id }, data: { aiEnabled: false } });
          this.emit('contact-updated', userId, { contactId: contact.id, aiEnabled: false });
        }

        const qualifyHistory = [
          ...history,
          { direction: 'in', content: text },
          { direction: 'out', content: aiResult.text },
        ];
        const qualification = await this.aiService.qualify(userId, qualifyHistory);
        if (qualification && Object.keys(qualification).length > 0) {
          await this.prisma.whatsAppContact.update({
            where: { id: contact.id },
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
          this.emit('lead-updated', userId, { contactId: contact.id, ...qualification });

          if (qualification.leadStatus === 'hot' && contact.leadStatus !== 'hot') {
            await this.automationService.process(userId, contact.id, 'lead_status', { status: 'hot' });
          }
          if (qualification.leadStatus === 'converted' && contact.leadStatus !== 'converted') {
            const recap = await this.aiService.generateOrderRecap(qualifyHistory, aiConfig?.primaryLanguage ?? 'fr');
            if (recap) await this.sendMessageViaSocket(userId, sock, jid, phone, recap, contact.id, true);
            // Mark all product mentions for this contact as converted
            await this.prisma.whatsAppProductMention.updateMany({
              where: { contactId: contact.id, isConverted: false },
              data: { isConverted: true },
            }).catch(() => {});
          }
        }
      }
    }
  }

  // Messages sent from physical phone (not via API)
  private async handleOutgoingFromPhone(userId: string, msg: WAMessage): Promise<void> {
    const jid = msg.key.remoteJid!;
    const phone = jidToDb(jid);
    const text = extractText(msg.message) ?? '';
    const timestamp = Number(msg.messageTimestamp ?? Date.now() / 1000) * 1000;
    const sentAt = new Date(timestamp).toISOString();

    const contact = await this.upsertContact(userId, phone);
    const content = text || '[message]';
    this.addToCache(userId, phone, { direction: 'out', content, waId: msg.key.id ?? undefined, sentAt });

    this.emit('message', userId, {
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
      where: { userId },
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
    sock: WASocket,
    jid: string,
    phone: string,
    text: string,
    contactId: string,
    fromAi: boolean | null,
  ): Promise<void> {
    // Rate limiting: if window is full, wait for it to reset
    const wait = this.rateWait(userId, 25);
    if (wait > 0) {
      this.logger.warn(`Rate limit reached for ${userId}, waiting ${Math.ceil(wait / 1000)}s`);
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
    if (waId) this.getPendingSet(userId).add(waId);

    const sentAt = new Date().toISOString();
    this.addToCache(userId, phone, { direction: 'out', content: text, waId: waId ?? undefined, sentAt });

    this.emit('message', userId, {
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
    phone: string,
    text: string,
    contactId: string,
    fromAi: boolean | null = false,
    _clientOverride?: any,
  ): Promise<void> {
    const sock = this.sockets.get(userId);
    if (!sock || !this.connectedUsers.has(userId)) {
      throw new HttpException('WhatsApp non connecté', HttpStatus.SERVICE_UNAVAILABLE);
    }
    const jid = toJid(phone);
    await this.sendMessageViaSocket(userId, sock, jid, jidToDb(jid), text, contactId, fromAi);
  }

  async sendImage(userId: string, phone: string, imageUrl: string, _clientOverride?: any): Promise<void> {
    const sock = this.sockets.get(userId);
    if (!sock || !this.connectedUsers.has(userId)) {
      throw new HttpException('WhatsApp non connecté', HttpStatus.SERVICE_UNAVAILABLE);
    }
    await this.sendImageViaSocket(sock, toJid(phone), imageUrl);
  }

  async sendDocument(userId: string, phone: string, buffer: Buffer, filename: string, mimetype: string): Promise<void> {
    const sock = this.sockets.get(userId);
    if (!sock || !this.connectedUsers.has(userId)) {
      throw new HttpException('WhatsApp non connecté', HttpStatus.SERVICE_UNAVAILABLE);
    }
    await sock.sendMessage(toJid(phone), { document: buffer, mimetype, fileName: filename });
  }

  async sendReply(userId: string, phone: string, text: string, contactId: string, _quotedWaId: string): Promise<void> {
    await this.sendMessage(userId, phone, text, contactId, false);
  }

  async notifyOrder(
    userId: string,
    toPhone: string,
    text: string,
    imagePath?: string,
  ): Promise<boolean> {
    const sock = this.sockets.get(userId);
    if (!sock) {
      this.logger.warn(`notifyOrder [${userId}]: no socket`);
      return false;
    }

    return new Promise<boolean>(resolve => {
      this.bulkQueue = this.bulkQueue.then(async () => {
        try {
          const wait = this.rateWait(userId, 25);
          if (wait > 0) await new Promise(r => setTimeout(r, wait + 500));

          await this.jitter(1500, 3500);

          const currentSock = this.sockets.get(userId);
          if (!currentSock) {
            this.logger.warn(`notifyOrder [${userId}]: socket lost before send`);
            resolve(false);
            return;
          }

          const jid = toJid(toPhone);

          if (imagePath && fs.existsSync(imagePath)) {
            // Single message: image + full details as caption
            this.logger.log(`notifyOrder [${userId}]: sending image+caption to ${jid}`);
            const buffer = fs.readFileSync(imagePath);
            const ext = path.extname(imagePath).toLowerCase();
            const mimetype = ext === '.png' ? 'image/png'
              : ext === '.webp' ? 'image/webp'
              : ext === '.gif' ? 'image/gif'
              : 'image/jpeg';
            await currentSock.sendMessage(jid, { image: buffer, caption: text, mimetype });
          } else {
            // No image — plain text
            this.logger.log(`notifyOrder [${userId}]: sending text to ${jid}`);
            await currentSock.sendMessage(jid, { text });
          }

          resolve(true);
        } catch (err: any) {
          this.logger.warn(`notifyOrder [${userId}]: failed — ${err?.message}`);
          resolve(false);
        }
      });
    });
  }

  // ── Contacts ──────────────────────────────────────────────────────────────────

  async getContacts(userId: string, filter?: string, search?: string, tagId?: string): Promise<any[]> {
    const dbContacts = await this.prisma.whatsAppContact.findMany({
      where: { userId },
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
        const cache = this.getCache(userId, c.phone);
        const last = cache[cache.length - 1];
        const liveDisplayName = this.contactNames.get(`${userId}:${toJid(c.phone)}`);
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
  async getMessages(userId: string, contactId: string, limit = 50): Promise<any[]> {
    let phone = contactId;
    if (!contactId.includes('@')) {
      const db = await this.prisma.whatsAppContact.findFirst({ where: { id: contactId, userId } });
      if (db) phone = db.phone;
    }
    const cache = this.getCache(userId, phone);
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

  async getGroups(userId: string): Promise<{ id: string; name: string; participants: number }[]> {
    const sock = this.sockets.get(userId);
    const isConnected = this.connectedUsers.has(userId);
    const cached = this.groupsCache.get(userId) ?? [];

    this.logger.log(`getGroups [${userId}]: sock=${!!sock}, connected=${isConnected}, cache=${cached.length}`);

    if (!sock) {
      this.logger.warn(`getGroups [${userId}]: no socket, returning cache`);
      return cached;
    }
    if (!isConnected) {
      this.logger.warn(`getGroups [${userId}]: not in connectedUsers, returning cache`);
      return cached;
    }

    // Live fetch
    try {
      this.logger.log(`getGroups [${userId}]: calling groupFetchAllParticipating...`);
      const raw = await sock.groupFetchAllParticipating();
      const keys = Object.keys(raw ?? {});
      this.logger.log(`getGroups [${userId}]: got ${keys.length} groups from WA`);

      const list = keys
        .map(id => {
          const g = raw[id] as any;
          return {
            id,
            name: (g.subject ?? g.name ?? id) as string,
            participants: (g.participants as any[])?.length ?? 0,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));

      if (list.length > 0) this.groupsCache.set(userId, list);
      return list;
    } catch (err: any) {
      this.logger.warn(`getGroups [${userId}]: groupFetchAllParticipating threw: ${err?.message}`);
    }

    // Cache fallback
    if (cached.length > 0) {
      this.logger.log(`getGroups [${userId}]: returning ${cached.length} cached groups`);
      return cached;
    }

    // Wait 3s and retry once (first call right after fresh connection)
    this.logger.log(`getGroups [${userId}]: cache empty, retrying in 3s...`);
    await new Promise(r => setTimeout(r, 3000));
    try {
      const raw = await sock.groupFetchAllParticipating();
      const list = Object.entries(raw ?? {}).map(([id, g]: [string, any]) => ({
        id,
        name: (g.subject ?? g.name ?? id) as string,
        participants: (g.participants as any[])?.length ?? 0,
      })).sort((a, b) => a.name.localeCompare(b.name));
      this.logger.log(`getGroups [${userId}]: retry got ${list.length} groups`);
      if (list.length > 0) this.groupsCache.set(userId, list);
      return list;
    } catch (err: any) {
      this.logger.warn(`getGroups [${userId}]: retry also failed: ${err?.message}`);
      return [];
    }
  }

  // ── Audience contact directory sync ──────────────────────────────────────────

  async syncContactDirectory(userId: string): Promise<void> {
    const session = await this.prisma.whatsAppSession.findUnique({ where: { userId } });
    const waAccountId = session?.phone ?? null;
    const profile = await this.prisma.userProfile.findUnique({ where: { userId } });
    const businessSector = profile?.businessSector ?? null;
    const now = new Date();

    // Build list from in-memory contact names (populated by contacts.upsert event)
    const contacts: Array<{ phone: string; displayName: string | null }> = [];
    for (const [key, name] of this.contactNames.entries()) {
      if (!key.startsWith(`${userId}:`)) continue;
      const jid = key.slice(userId.length + 1);
      if (jid.endsWith('@g.us') || jid.includes('@broadcast') || jid === 'status@broadcast') continue;
      const phone = jidToDb(jid);
      if (phone.endsWith('@lid')) continue;
      contacts.push({ phone, displayName: name });
    }

    this.logger.log(`Audience sync: ${contacts.length} contacts for ${userId}`);
    this.emit('audience-sync-start', userId, { total: contacts.length });

    const BATCH = 50;
    let done = 0;
    for (let i = 0; i < contacts.length; i += BATCH) {
      const chunk = contacts.slice(i, i + BATCH);
      await Promise.all(chunk.map(c =>
        this.prisma.waCampaignContact.upsert({
          where: { clientId_phoneNumber: { clientId: userId, phoneNumber: c.phone } },
          create: { clientId: userId, phoneNumber: c.phone, displayName: c.displayName, waAccountId, businessSector, source: 'whatsapp_sync', syncedAt: now },
          update: { displayName: c.displayName, waAccountId, syncedAt: now, ...(businessSector ? { businessSector } : {}) },
        }).catch(() => {})
      ));
      done += chunk.length;
      this.emit('audience-sync-progress', userId, { done, total: contacts.length });
    }

    this.emit('audience-sync-complete', userId, { total: done });
    this.logger.log(`Audience sync complete for ${userId}: ${done} contacts`);
  }

  // ── Safe contact upsert ───────────────────────────────────────────────────────

  private async upsertContact(userId: string, phone: string, data: { displayName?: string | null } = {}) {
    try {
      return await this.prisma.whatsAppContact.upsert({
        where: { userId_phone: { userId, phone } },
        create: { userId, phone, ...(data.displayName ? { displayName: data.displayName } : {}) },
        update: { ...(data.displayName ? { displayName: data.displayName } : {}) },
        include: { tags: { include: { tag: true } } },
      });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        return this.prisma.whatsAppContact.findUniqueOrThrow({
          where: { userId_phone: { userId, phone } },
          include: { tags: { include: { tag: true } } },
        });
      }
      throw err;
    }
  }

  // ── Disconnect ────────────────────────────────────────────────────────────────

  async disconnect(userId: string): Promise<void> {
    this.loggedOut.add(userId);
    this.clearKeepAlive(userId);
    const sock = this.sockets.get(userId);
    if (sock) {
      await sock.logout().catch(() => {});
      (sock.ev as any).removeAllListeners();
      this.sockets.delete(userId);
      this.connectedUsers.delete(userId);
    }
    const dir = this.authPath(userId);
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });

    await this.prisma.whatsAppSession.upsert({
      where: { userId },
      create: { userId, connected: false },
      update: { connected: false },
    }).catch(() => {});

    this.pendingSendIds.delete(userId);
    this.emit('disconnected', userId, {});
  }

  async getStatus(userId: string) {
    const session = await this.prisma.whatsAppSession.findUnique({ where: { userId } });
    return {
      connected: this.connectedUsers.has(userId),
      phone: session?.phone ?? null,
    };
  }

  async reconnectAll(): Promise<void> {
    const sessions = await this.prisma.whatsAppSession.findMany({ where: { connected: true } });
    for (const s of sessions) {
      this.logger.log(`Auto-reconnecting ${s.userId}`);
      this.connect(s.userId).catch(err =>
        this.logger.error(`Reconnect failed ${s.userId}:`, err)
      );
    }
  }

  onModuleDestroy() {
    for (const [userId] of this.keepAliveTimers) this.clearKeepAlive(userId);
    for (const [, sock] of this.sockets) {
      (sock.ev as any).removeAllListeners();
      sock.end(new Error('shutdown'));
    }
    this.sockets.clear();
    this.connectedUsers.clear();
  }
}
