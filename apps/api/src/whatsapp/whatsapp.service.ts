import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from './ai.service';
import { AutomationService } from './automation.service';
import { Client, LocalAuth, Message, MessageMedia } from 'whatsapp-web.js';
import * as qrcode from 'qrcode';
import * as path from 'path';
import * as fs from 'fs';
import { execFileSync } from 'child_process';
import puppeteer from 'puppeteer';

function findSystemChrome(): string | undefined {
  const candidates = [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/snap/bin/chromium',
    '/usr/local/bin/chromium',
  ];
  for (const p of candidates) {
    try { execFileSync('test', ['-f', p]); return p; } catch { /* not found */ }
  }
  return undefined;
}

export type WaGatewayCallback = (event: string, userId: string, data: any) => void;

@Injectable()
export class WhatsAppService implements OnModuleDestroy {
  private readonly logger = new Logger(WhatsAppService.name);
  private clients = new Map<string, Client>();
  private gatewayEmit: WaGatewayCallback | null = null;
  // Track waIds of messages we sent via API so message_create doesn't double-emit
  private pendingSendIds = new Map<string, Set<string>>();
  // Reconnect backoff per user (ms)
  private reconnectDelay = new Map<string, number>();
  // Keep-alive interval handles
  private keepAliveTimers = new Map<string, NodeJS.Timeout>();
  // Set of users that explicitly logged out — do not auto-reconnect
  private loggedOut = new Set<string>();
  // Phone number to use for pairing code instead of QR (per user)
  private pairingPhones = new Map<string, string>();
  // Shared Puppeteer browser — launched once, reused by all clients
  private sharedBrowser: any = null;
  private browserLaunching = false;
  // Per-contact sequential queue: key = `userId:phone`, value = last promise in chain
  private messageQueues = new Map<string, Promise<void>>();
  // Buffer of recent AI responses not yet visible in fetchMessages: key = `userId:phone`
  private recentAiReplies = new Map<string, Array<{ content: string; ts: number }>>();

  constructor(
    private prisma: PrismaService,
    private aiService: AiService,
    private automationService: AutomationService,
  ) {}

  setGatewayEmit(fn: WaGatewayCallback) {
    this.gatewayEmit = fn;
  }

  private emit(event: string, userId: string, data: any) {
    if (this.gatewayEmit) this.gatewayEmit(event, userId, data);
  }

  private getPendingSet(userId: string): Set<string> {
    if (!this.pendingSendIds.has(userId)) this.pendingSendIds.set(userId, new Set());
    return this.pendingSendIds.get(userId)!;
  }

  private clearKeepAlive(userId: string) {
    const t = this.keepAliveTimers.get(userId);
    if (t) { clearInterval(t); this.keepAliveTimers.delete(userId); }
  }

  // ── Per-contact sequential queue ─────────────────────────────────────────────
  // Messages from the same contact are processed one by one (like a human agent).
  // Messages from different contacts are processed in parallel.
  private enqueue(userId: string, phone: string, handler: () => Promise<void>): void {
    const key = `${userId}:${phone}`;
    const previous = this.messageQueues.get(key) ?? Promise.resolve();
    const next = previous
      .then(handler)
      .catch(err => this.logger.error(`Queue error [${key}]:`, err?.message ?? err));
    this.messageQueues.set(key, next);
    // Auto-cleanup once the chain is idle
    next.finally(() => {
      if (this.messageQueues.get(key) === next) this.messageQueues.delete(key);
    });
  }

  private scheduleReconnect(userId: string) {
    if (this.loggedOut.has(userId)) return;
    const delay = Math.min(this.reconnectDelay.get(userId) ?? 5000, 60_000);
    this.reconnectDelay.set(userId, delay * 2); // exponential backoff, cap 60s
    this.logger.log(`Reconnecting ${userId} in ${delay}ms`);
    setTimeout(() => {
      if (!this.loggedOut.has(userId)) this.connect(userId);
    }, delay);
  }

  // ── Shared browser — launched once, reused by all clients ────────────────────

  private readonly CHROME_ARGS = [
    '--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu',
    '--disable-dev-shm-usage', '--disable-software-rasterizer',
    '--no-first-run', '--ignore-certificate-errors', '--disable-extensions',
    '--disable-background-networking', '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows', '--disable-breakpad',
    '--disable-client-side-phishing-detection', '--disable-component-update',
    '--disable-default-apps', '--disable-domain-reliability',
    '--disable-hang-monitor', '--disable-ipc-flooding-protection',
    '--disable-notifications', '--disable-popup-blocking',
    '--disable-prompt-on-repost', '--disable-renderer-backgrounding',
    '--disable-sync', '--disable-translate', '--metrics-recording-only',
    '--mute-audio', '--no-default-browser-check',
    '--safebrowsing-disable-auto-update', '--password-store=basic',
    '--use-mock-keychain',
  ];

  private async getSharedBrowser(): Promise<string> {
    // Return existing healthy browser
    if (this.sharedBrowser?.isConnected?.()) {
      return this.sharedBrowser.wsEndpoint();
    }
    // Wait if already launching (concurrent callers)
    if (this.browserLaunching) {
      await new Promise<void>((resolve, reject) => {
        const start = Date.now();
        const check = setInterval(() => {
          if (!this.browserLaunching) { clearInterval(check); resolve(); }
          if (Date.now() - start > 60_000) { clearInterval(check); reject(new Error('Browser launch timeout')); }
        }, 300);
      });
      if (!this.sharedBrowser?.isConnected?.()) throw new Error('Shared browser unavailable after wait');
      return this.sharedBrowser.wsEndpoint();
    }
    this.browserLaunching = true;
    try {
      this.logger.log('Launching shared Chrome browser...');
      this.sharedBrowser = await puppeteer.launch({
        headless: true,
        executablePath: findSystemChrome(),
        args: this.CHROME_ARGS,
      });
      this.sharedBrowser.on('disconnected', () => {
        this.logger.warn('Shared browser disconnected — will relaunch on next connect');
        this.sharedBrowser = null;
      });
      this.logger.log(`Shared Chrome ready (${this.sharedBrowser.wsEndpoint()})`);
      return this.sharedBrowser.wsEndpoint();
    } finally {
      this.browserLaunching = false;
    }
  }

  // ── Connect ───────────────────────────────────────────────────────────────────

  async connect(userId: string): Promise<void> {
    if (this.clients.has(userId)) {
      const session = await this.prisma.whatsAppSession.findUnique({ where: { userId } });
      if (session?.connected) this.emit('connected', userId, { phone: session.phone });
      return;
    }

    const pairingPhone = this.pairingPhones.get(userId);

    // Get (or launch) the shared browser — fast on subsequent calls
    let browserWSEndpoint: string | undefined;
    try {
      browserWSEndpoint = await this.getSharedBrowser();
    } catch (err: any) {
      this.logger.error('Failed to get shared browser:', err?.message);
    }

    const clientOptions: any = {
      authStrategy: new LocalAuth({
        clientId: userId,
        dataPath: path.join(process.cwd(), '.wwebjs_auth'),
      }),
      puppeteer: browserWSEndpoint
        ? { browserWSEndpoint }
        : { headless: true, executablePath: findSystemChrome(), args: this.CHROME_ARGS },
    };

    const client = new Client(clientOptions);

    this.clients.set(userId, client);

    // Pairing code — emitted when requestPairingCode succeeds
    client.on('code', (code: string) => {
      this.pairingPhones.delete(userId);
      this.logger.log(`Pairing code for ${userId}: ${code}`);
      this.emit('pairing_code', userId, { code });
    });

    client.on('qr', async (qr) => {
      const phone = this.pairingPhones.get(userId);
      if (phone) {
        // Manually call requestPairingCode — library already polls for PairingCodeLinkUtils
        client.requestPairingCode(phone).then((code: string) => {
          this.pairingPhones.delete(userId);
          this.logger.log(`Pairing code for ${userId}: ${code}`);
          this.emit('pairing_code', userId, { code });
        }).catch((err: any) => {
          const msg = err?.message ?? String(err);
          this.logger.warn(`requestPairingCode failed for ${userId}: ${msg}`);
          this.pairingPhones.delete(userId);
          this.emit('pairing_error', userId, {
            message: 'Impossible de générer le code. Patientez quelques minutes puis réessayez.',
          });
        });
        return;
      }
      const qrDataUrl = await qrcode.toDataURL(qr);
      this.emit('qr', userId, { qr: qrDataUrl });
    });

    client.on('loading_screen', (percent: number, message: string) => {
      this.emit('loading', userId, { percent, message });
    });

    client.on('ready', async () => {
      const phone = (client as any).info?.wid?.user ?? null;
      await this.prisma.withRetry(() =>
        this.prisma.whatsAppSession.upsert({
          where: { userId },
          create: { userId, connected: true, phone },
          update: { connected: true, phone },
        })
      );
      this.reconnectDelay.set(userId, 5000); // reset backoff on success
      this.pairingPhones.delete(userId);
      this.emit('connected', userId, { phone });
      this.logger.log(`WhatsApp ready for ${userId} (${phone})`);

      // Keep-alive: ping the client every 30s to detect silent drops
      this.clearKeepAlive(userId);
      const timer = setInterval(async () => {
        try {
          await (client as any).getState();
        } catch {
          this.logger.warn(`Keep-alive failed for ${userId} — triggering reconnect`);
          clearInterval(timer);
          this.keepAliveTimers.delete(userId);
          this.scheduleReconnect(userId);
        }
      }, 30_000);
      this.keepAliveTimers.set(userId, timer);

      // Sync audience contact directory in background (non-blocking)
      this.syncContactDirectory(userId).catch(err =>
        this.logger.error(`Audience sync failed for ${userId}:`, err?.message),
      );
    });

    client.on('disconnected', async (reason: string) => {
      this.logger.log(`WhatsApp disconnected for ${userId}: ${reason}`);
      this.clearKeepAlive(userId);
      this.clients.delete(userId);
      this.pendingSendIds.delete(userId);
      await this.prisma.whatsAppSession.upsert({
        where: { userId },
        create: { userId, connected: false },
        update: { connected: false },
      });
      this.emit('disconnected', userId, { reason });

      if (reason === 'LOGOUT') {
        this.loggedOut.add(userId);
      } else {
        this.scheduleReconnect(userId);
      }
    });

    // Incoming messages — queued per contact so replies go out one by one
    client.on('message', (msg: Message) => {
      const phone: string = (msg as any).from;
      if (!phone) return;
      this.enqueue(userId, phone, () => this.handleIncoming(userId, msg, client));
    });

    // Messages created (both incoming and outgoing — filter fromMe)
    client.on('message_create', async (msg: Message) => {
      if (!msg.fromMe) return;
      const waId = msg.id?.id;
      // If we sent this via sendMessage(), we already emitted it — skip
      if (waId && this.getPendingSet(userId).has(waId)) {
        this.getPendingSet(userId).delete(waId);
        return;
      }
      // Message sent directly from the phone
      await this.handleOutgoingFromPhone(userId, msg);
    });

    // Delivery/read receipts — emit to frontend, no DB needed
    client.on('message_ack', (msg: Message, ack: number) => {
      if (!msg.id?.id) return;
      this.emit('message-ack', userId, { waId: msg.id.id, ack });
    });

    // Revoked messages
    client.on('message_revoke_everyone', (_msg: any, revokedMsg: any) => {
      if (!revokedMsg?.id?.id) return;
      this.emit('message-revoked', userId, { waId: revokedMsg.id.id });
    });

    client.initialize()
      .then(() => {
        // Prevent whatsapp-web.js from closing our shared browser.
        // When connected via browserWSEndpoint, replace close() with disconnect()
        // so the browser process stays alive for other clients.
        const pupBrowser = (client as any).pupBrowser;
        if (browserWSEndpoint && pupBrowser) {
          pupBrowser.close = () => pupBrowser.disconnect();
        }
      })
      .catch((err: any) => {
        const msg = err?.message ?? String(err);
        this.logger.error(`Initialize failed for ${userId}: ${msg}`);
        this.clients.delete(userId);
        this.clearKeepAlive(userId);
        if (this.pairingPhones.has(userId)) {
          this.pairingPhones.delete(userId);
          this.emit('pairing_error', userId, { message: 'Échec de connexion. Réessayez.' });
        }
        if (!this.loggedOut.has(userId)) {
          this.scheduleReconnect(userId);
        }
      });
  }

  async connectWithPairingCode(userId: string, phone: string): Promise<void> {
    // Normalize: strip +, spaces, dashes
    const normalized = phone.replace(/[^0-9]/g, '');
    this.pairingPhones.set(userId, normalized);
    // If client already exists, it already passed the qr stage — clear and reconnect
    if (this.clients.has(userId)) {
      const client = this.clients.get(userId)!;
      this.clients.delete(userId);
      this.clearKeepAlive(userId);
      try { await client.destroy(); } catch { /* ignore */ }
    }
    await this.connect(userId);
  }

  // ── Contacts — live from WA client + CRM overlay from DB ─────────────────────

  async getContacts(
    userId: string,
    filter?: string,
    search?: string,
    tagId?: string,
  ): Promise<any[]> {
    const client = this.clients.get(userId);

    // CRM overlay from DB
    const dbContacts = await this.prisma.whatsAppContact.findMany({
      where: { userId },
      include: { tags: { include: { tag: true } } },
    });
    const dbByPhone = new Map(dbContacts.map(c => [c.phone, c]));

    const clientReady = !!(client && (client as any).info?.wid);

    if (!clientReady) {
      // Not connected or Puppeteer still initializing — return DB contacts
      return dbContacts
        .filter(c => filter === 'archived' ? c.isArchived : !c.isArchived)
        .map(c => ({ ...c, unreadCount: 0 }));
    }

    const chats = await client!.getChats().catch(() => []) as any[];
    const privateChats = chats
      .filter((c: any) =>
        !c.isGroup &&
        !c.id._serialized.endsWith('@broadcast') &&
        !c.id._serialized.endsWith('@newsletter'),
      )
      .sort((a: any, b: any) => (b.timestamp ?? 0) - (a.timestamp ?? 0));

    const results: any[] = [];

    for (const chat of privateChats) {
      const phone: string = chat.id._serialized;
      const db = dbByPhone.get(phone);

      // Archived filter
      if (filter === 'archived' && !db?.isArchived) continue;
      if (filter !== 'archived' && db?.isArchived) continue;

      // Other filters
      if (filter === 'unread' && !chat.unreadCount) continue;
      if (filter === 'assigned' && !db?.assignedAgent) continue;
      if (filter === 'hot' && db?.leadStatus !== 'hot') continue;
      if (tagId && !db?.tags?.some((t: any) => t.tagId === tagId)) continue;

      // Search
      if (search) {
        const s = search.toLowerCase();
        const name = (chat.name || phone).toLowerCase();
        if (!phone.includes(s) && !name.includes(s) && !db?.leadName?.toLowerCase().includes(s)) continue;
      }

      const lastMsg = chat.lastMessage;
      results.push({
        id: db?.id ?? phone,
        phone,
        displayName: chat.name || db?.displayName || phone,
        lastMessageAt: lastMsg?.timestamp ? new Date(lastMsg.timestamp * 1000).toISOString() : null,
        lastMessageText: lastMsg?.body ?? null,
        unreadCount: chat.unreadCount ?? 0,
        isRead: !(chat.unreadCount > 0),
        isArchived: db?.isArchived ?? false,
        assignedAgent: db?.assignedAgent ?? null,
        aiEnabled: db?.aiEnabled ?? true,
        leadStatus: db?.leadStatus ?? 'cold',
        leadScore: db?.leadScore ?? 0,
        leadName: db?.leadName ?? null,
        leadNeed: db?.leadNeed ?? null,
        leadBudget: db?.leadBudget ?? null,
        leadCity: db?.leadCity ?? null,
        leadUrgency: db?.leadUrgency ?? null,
        leadProduct: db?.leadProduct ?? null,
        source: db?.source ?? null,
        tags: db?.tags ?? [],
      });
    }

    return results;
  }

  // ── Messages — live from WA client ───────────────────────────────────────────

  async getMessages(userId: string, contactId: string, limit = 50): Promise<any[]> {
    // Resolve phone from contactId (DB uuid) or use contactId directly as phone
    let phone = contactId;
    if (!contactId.includes('@')) {
      const db = await this.prisma.whatsAppContact.findFirst({ where: { id: contactId, userId } });
      if (db) phone = db.phone;
    }

    const client = this.clients.get(userId);
    if (!client) return [];

    const chat = await client.getChatById(phone).catch(() => null) as any;
    if (!chat) return [];

    const msgs = await chat.fetchMessages({ limit }).catch(() => []) as any[];

    return msgs
      .filter((m: any) => m.id?.id)
      .map((m: any) => ({
        id: m.id._serialized,
        waId: m.id.id,
        contactId,
        direction: m.fromMe ? 'out' : 'in',
        content: m.body || (m.hasMedia ? `[${m.type}]` : '[Message]'),
        mediaType: m.hasMedia ? m.type : null,
        mediaUrl: null,
        quotedMsgId: m._data?.quotedMsgObj?.id?.id ?? null,
        ack: m.ack ?? 0,
        fromAi: false,
        sentAt: new Date(m.timestamp * 1000).toISOString(),
      }));
  }

  // ── Apply a native WhatsApp label to a chat ──────────────────────────────────

  async applyLabelToChat(userId: string, phone: string, labelName: string): Promise<boolean> {
    const client = this.clients.get(userId);
    if (!client) return false;
    try {
      const labels: any[] = await client.getLabels().catch(() => []);
      const label = labels.find((l: any) =>
        l.name?.toLowerCase().trim() === labelName.toLowerCase().trim(),
      );
      if (!label) {
        this.logger.warn(`Label "${labelName}" not found on WhatsApp (available: ${labels.map((l: any) => l.name).join(', ')})`);
        return false;
      }
      await (client as any).addOrRemoveLabels([label.id], [phone]);
      this.logger.log(`Label "${labelName}" applied to ${phone}`);
      return true;
    } catch (err: any) {
      this.logger.warn(`applyLabelToChat error: ${err?.message}`);
      return false;
    }
  }

  // ── Safe contact upsert (handles P2002 race conditions) ──────────────────────

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
        // Another concurrent request created the contact — just fetch it
        return this.prisma.whatsAppContact.findUniqueOrThrow({
          where: { userId_phone: { userId, phone } },
          include: { tags: { include: { tag: true } } },
        });
      }
      throw err;
    }
  }

  // ── Mark chat as read via WhatsApp ───────────────────────────────────────────

  async markRead(userId: string, phone: string): Promise<void> {
    const client = this.clients.get(userId);
    if (!client) return;
    const chat = await client.getChatById(phone).catch(() => null) as any;
    if (chat) await chat.sendSeen().catch(() => {});
  }

  // ── Incoming message handler ──────────────────────────────────────────────────

  private async handleIncoming(userId: string, msg: Message, client: Client): Promise<void> {
    const phone: string = (msg as any).from;
    if (!phone || phone === 'status@broadcast' || phone.endsWith('@g.us')) return;

    const waContact = await client.getContactById(phone).catch(() => null) as any;
    const displayName: string | null = waContact?.pushname || waContact?.name || null;

    // Check first contact for automation trigger
    const isFirst = !(await this.prisma.whatsAppContact.findUnique({
      where: { userId_phone: { userId, phone } },
    }));

    // Upsert contact in DB (CRM overlay only — no message storage)
    const contact = await this.upsertContact(userId, phone, { displayName });

    // Download media for AI and frontend preview
    let mediaUrl: string | null = null;
    let mediaType: string | null = null;
    let mediaBase64: string | null = null;
    let mediaMimetype: string | null = null;
    if ((msg as any).hasMedia) {
      try {
        const media = await (msg as any).downloadMedia();
        if (media?.data) {
          const ext = media.mimetype.split('/')[1]?.split(';')[0] ?? 'bin';
          const filename = `${msg.id.id}.${ext}`;
          const uploadDir = path.join(process.cwd(), 'uploads');
          fs.mkdirSync(uploadDir, { recursive: true });
          fs.writeFileSync(path.join(uploadDir, filename), Buffer.from(media.data, 'base64'));
          mediaUrl = `/uploads/${filename}`;
          mediaType = (msg as any).type;
          if (['image', 'audio', 'ptt'].includes((msg as any).type)) {
            mediaBase64 = media.data;
            mediaMimetype = media.mimetype;
          }
        }
      } catch {
        mediaType = (msg as any).type;
      }
    }

    const quotedMsgId: string | null = (msg as any).hasQuotedMsg
      ? (await (msg as any).getQuotedMessage().catch(() => null))?.id?.id ?? null
      : null;

    // Build message object in memory — NOT saved to DB
    const message = {
      id: (msg.id as any)._serialized,
      waId: msg.id.id,
      contactId: contact.id,
      direction: 'in',
      content: (msg as any).body || (mediaType ? `[${mediaType}]` : '[Message]'),
      mediaUrl,
      mediaType,
      quotedMsgId,
      ack: 3,
      fromAi: false,
      sentAt: new Date((msg as any).timestamp * 1000).toISOString(),
    };

    this.emit('message', userId, { contact: { ...contact, unreadCount: 1 }, message });

    // Automations
    const event = isFirst ? 'welcome' : 'message';
    const autoMessages = await this.automationService.process(userId, contact.id, event, { message: (msg as any).body });
    for (const autoMsg of autoMessages) {
      await this.sendMessage(userId, phone, autoMsg, contact.id, null, client);
    }

    // AI reply — requires systemPrompt + at least 1 KB entry
    const hasAiContent = !!(msg as any).body || ['image', 'audio', 'ptt'].includes((msg as any).type);
    if (contact.aiEnabled && autoMessages.length === 0 && hasAiContent) {
      // Pre-check: don't even call OpenAI if agent/KB not configured
      const hasAgentConfig = await this.prisma.whatsAppAIConfig.findUnique({ where: { userId } })
        .then(c => !!c?.systemPrompt?.trim() && c.enabled);
      const kbCount = await this.prisma.whatsAppKBEntry.count({ where: { userId, enabled: true } });
      if (!hasAgentConfig || kbCount === 0) return;

      // Get full conversation history from WA client — exclude the current message (last one)
      const chat = await (msg as any).getChat().catch(() => null) as any;
      const fetchedMsgs: any[] = chat
        ? await chat.fetchMessages({ limit: 40 }).catch(() => [])
        : [];
      // Drop the last message (it's the one we just received, passed separately as newMessage)
      const historyMsgs = fetchedMsgs.slice(0, -1);
      const history = historyMsgs.map((m: any) => ({
        direction: m.fromMe ? 'out' : 'in',
        content: m.body || '',
      }));

      // Inject recent AI replies not yet visible in fetchMessages (burst message scenario)
      const bufKey = `${userId}:${phone}`;
      const bufferTTL = 30_000; // 30s
      const recentBuf = (this.recentAiReplies.get(bufKey) ?? [])
        .filter(r => Date.now() - r.ts < bufferTTL);
      // Find which buffered replies are already in fetched history to avoid duplicates
      const fetchedOutContents = new Set(historyMsgs.filter((m: any) => m.fromMe).map((m: any) => m.body as string));
      const missingReplies = recentBuf.filter(r => !fetchedOutContents.has(r.content));
      if (missingReplies.length > 0) {
        // Insert missing AI replies before the last client message to preserve order
        history.push(...missingReplies.map(r => ({ direction: 'out', content: r.content })));
      }

      // Simulated typing delay
      const aiConfig = await this.prisma.whatsAppAIConfig.findUnique({ where: { userId } });
      const delay = aiConfig?.simulatedDelayMs ?? 2000;
      if (chat) await chat.sendStateTyping().catch(() => {});
      await new Promise(r => setTimeout(r, delay));
      if (chat) await chat.clearState().catch(() => {});

      const aiResult = await this.aiService.reply(
        userId, phone, history, (msg as any).body ?? '',
        mediaBase64 ?? undefined, mediaMimetype ?? undefined,
        contact.leadStatus ?? undefined,
      );

      if (aiResult?.text) {
        await this.sendMessage(userId, phone, aiResult.text, contact.id, true, client);

        // Store reply in burst buffer so subsequent rapid messages see it in context
        const buf = this.recentAiReplies.get(bufKey) ?? [];
        buf.push({ content: aiResult.text, ts: Date.now() });
        this.recentAiReplies.set(bufKey, buf.slice(-5));

        // Send image if AI decided to include one
        if (aiResult.imageUrl) {
          await this.sendImage(userId, phone, aiResult.imageUrl, client).catch(err =>
            this.logger.warn(`Image send failed: ${err?.message}`),
          );
        }

        if (aiResult.shouldEscalate) {
          await this.prisma.whatsAppContact.update({
            where: { id: contact.id },
            data: { aiEnabled: false },
          });
          this.emit('contact-updated', userId, { contactId: contact.id, aiEnabled: false });
        }

        // Lead qualification — include full exchange (history + new client msg + AI reply)
        const qualifyHistory = [
          ...history,
          { direction: 'in', content: (msg as any).body ?? '' },
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
            await this.applyLabelToChat(userId, phone, 'Livraison Programmée');

            // Send order recap
            const cfg = await this.prisma.whatsAppAIConfig.findUnique({ where: { userId } });
            const recap = await this.aiService.generateOrderRecap(
              qualifyHistory,
              cfg?.primaryLanguage ?? 'fr',
            );
            if (recap) {
              await this.sendMessage(userId, phone, recap, contact.id, true, client);
            }
          }
        }
      }
    }
  }

  // ── Messages sent from physical phone (not via our API) ───────────────────────

  private async handleOutgoingFromPhone(userId: string, msg: Message): Promise<void> {
    const phone: string = (msg as any).to;
    if (!phone || phone.endsWith('@g.us') || phone === 'status@broadcast') return;

    const contact = await this.upsertContact(userId, phone);

    const message = {
      id: (msg.id as any)._serialized,
      waId: msg.id.id,
      contactId: contact.id,
      direction: 'out',
      content: (msg as any).body || `[${(msg as any).type ?? 'media'}]`,
      mediaType: (msg as any).hasMedia ? (msg as any).type : null,
      mediaUrl: null,
      quotedMsgId: null,
      ack: (msg as any).ack ?? 1,
      fromAi: false,
      sentAt: new Date((msg as any).timestamp * 1000).toISOString(),
    };

    this.emit('message', userId, { contact, message });
  }

  // ── Send message (via API / AI) ───────────────────────────────────────────────

  async sendMessage(
    userId: string,
    phone: string,
    text: string,
    contactId: string,
    fromAi: boolean | null = false,
    clientOverride?: Client,
  ): Promise<void> {
    const client = clientOverride ?? this.clients.get(userId);
    if (!client) throw new Error('WhatsApp non connecté');

    let result: any;
    try {
      result = await client.sendMessage(phone, text);
    } catch (err: any) {
      // whatsapp-web.js bug: sendSeen() called internally may fail on WA JS updates
      // Log but don't crash — the message was likely sent even if sendSeen threw
      this.logger.warn(`sendMessage internal error (message may still be sent): ${err?.message}`);
      result = null;
    }
    const waId: string | null = result?.id?.id ?? null;

    // Register waId so message_create handler skips it (avoids double emit)
    if (waId) this.getPendingSet(userId).add(waId);

    // Emit immediately for real-time UX
    const message = {
      id: result?.id?._serialized ?? `out-${Date.now()}`,
      waId,
      contactId,
      direction: 'out',
      content: text,
      mediaType: null,
      mediaUrl: null,
      quotedMsgId: null,
      ack: 1,
      fromAi: fromAi ?? false,
      sentAt: new Date().toISOString(),
    };

    this.emit('message', userId, { contact: { id: contactId }, message });
  }

  // ── Send image ────────────────────────────────────────────────────────────────

  async sendImage(userId: string, phone: string, imageUrl: string, clientOverride?: Client): Promise<void> {
    const client = clientOverride ?? this.clients.get(userId);
    if (!client) throw new Error('WhatsApp non connecté');

    let media: MessageMedia;
    if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
      media = await MessageMedia.fromUrl(imageUrl, { unsafeMime: true });
    } else {
      // Local file path
      const fullPath = imageUrl.startsWith('/')
        ? path.join(process.cwd(), imageUrl)
        : imageUrl;
      media = MessageMedia.fromFilePath(fullPath);
    }

    try {
      await client.sendMessage(phone, media);
    } catch (err: any) {
      this.logger.warn(`sendImage internal error: ${err?.message}`);
    }
  }

  // ── Send quoted reply ─────────────────────────────────────────────────────────

  async sendReply(
    userId: string,
    phone: string,
    text: string,
    contactId: string,
    quotedWaId: string,
  ): Promise<void> {
    const client = this.clients.get(userId);
    if (!client) throw new Error('WhatsApp non connecté');

    const chat = await client.getChatById(phone).catch(() => null) as any;
    let result: any;

    try {
      if (chat) {
        const fetchedMsgs = await chat.fetchMessages({ limit: 50 }).catch(() => []) as any[];
        const originalMsg = fetchedMsgs.find((m: any) => m.id?.id === quotedWaId);
        result = originalMsg
          ? await originalMsg.reply(text)
          : await client.sendMessage(phone, text);
      } else {
        result = await client.sendMessage(phone, text);
      }
    } catch (err: any) {
      this.logger.warn(`sendReply internal error: ${err?.message}`);
      result = null;
    }

    const waId: string | null = result?.id?.id ?? null;
    if (waId) this.getPendingSet(userId).add(waId);

    const message = {
      id: result?.id?._serialized ?? `out-${Date.now()}`,
      waId,
      contactId,
      direction: 'out',
      content: text,
      mediaType: null,
      mediaUrl: null,
      quotedMsgId: quotedWaId,
      ack: 1,
      fromAi: false,
      sentAt: new Date().toISOString(),
    };

    this.emit('message', userId, { contact: { id: contactId }, message });
  }

  // ── Audience contact directory sync ──────────────────────────────────────────

  async syncContactDirectory(userId: string): Promise<void> {
    const client = this.clients.get(userId);
    if (!client) return;

    const allContacts = await (client as any).getContacts().catch(() => []) as any[];
    this.logger.log(`Audience sync: ${allContacts.length} raw contacts from getContacts() for ${userId}`);

    // Keep only real WA users — exclude groups, broadcasts, self
    // Supports both @s.whatsapp.net and @lid (new LID format)
    let filtered = allContacts.filter((c: any) =>
      !c.isMe &&
      !c.isGroup &&
      (
        c.id?._serialized?.endsWith('@s.whatsapp.net') ||
        c.id?._serialized?.endsWith('@lid')
      ),
    );

    // Fallback: if getContacts() returned nothing, sync from active chats instead
    if (filtered.length === 0) {
      this.logger.warn(`Audience sync: getContacts() empty, falling back to getChats() for ${userId}`);
      const chats = await (client as any).getChats().catch(() => []) as any[];
      filtered = chats.filter((c: any) =>
        !c.isGroup &&
        !c.id?._serialized?.endsWith('@broadcast') &&
        !c.id?._serialized?.endsWith('@newsletter'),
      );
      this.logger.log(`Audience sync: ${filtered.length} contacts from chats fallback`);
    }

    this.logger.log(`Audience sync: ${filtered.length} contacts to upsert`);

    const session = await this.prisma.whatsAppSession.findUnique({ where: { userId } });
    const waAccountId = session?.phone ?? null;

    const profile = await this.prisma.userProfile.findUnique({ where: { userId } });
    const businessSector = profile?.businessSector ?? null;
    const now = new Date();

    this.emit('audience-sync-start', userId, { total: filtered.length });
    this.logger.log(`Audience sync started for ${userId}: ${filtered.length} contacts`);

    const BATCH = 50;
    let done = 0;

    for (let i = 0; i < filtered.length; i += BATCH) {
      const chunk = filtered.slice(i, i + BATCH);
      await Promise.all(
        chunk.map((c: any) => {
          const displayName: string | null = c.pushname || c.name || null;

          // Resolve real phone number from available properties
          let phone: string = c.id._serialized;
          if (c.number && c.number.trim()) {
            // c.number contains digits only (e.g. "243978536075")
            phone = `${c.number.replace(/\D/g, '')}@s.whatsapp.net`;
          } else if (phone.endsWith('@lid')) {
            // Try to extract phone from pushname/name if it looks like a phone number
            const raw = (c.pushname || c.name || '').replace(/[\s\-().+]/g, '');
            if (/^\d{7,15}$/.test(raw)) {
              phone = `${raw}@s.whatsapp.net`;
            }
            // else keep @lid — better than nothing
          }

          return this.prisma.waCampaignContact
            .upsert({
              where: { clientId_phoneNumber: { clientId: userId, phoneNumber: phone } },
              create: {
                clientId: userId,
                phoneNumber: phone,
                displayName,
                waAccountId,
                businessSector,
                source: 'whatsapp_sync',
                syncedAt: now,
              },
              update: {
                displayName,
                waAccountId,
                syncedAt: now,
                ...(businessSector ? { businessSector } : {}),
              },
            })
            .catch(err =>
              this.logger.warn(`Upsert ${phone}: ${err?.message}`),
            );
        }),
      );
      done += chunk.length;
      this.emit('audience-sync-progress', userId, { done, total: filtered.length });
    }

    this.emit('audience-sync-complete', userId, { total: done });
    this.logger.log(`Audience sync complete for ${userId}: ${done} contacts saved`);
  }

  // ── Disconnect ────────────────────────────────────────────────────────────────

  async disconnect(userId: string): Promise<void> {
    this.loggedOut.add(userId); // prevent auto-reconnect
    this.clearKeepAlive(userId);
    const client = this.clients.get(userId);
    if (client) {
      await client.logout().catch(() => {});
      await client.destroy().catch(() => {});
      this.clients.delete(userId);
    }
    this.pendingSendIds.delete(userId);
    await this.prisma.whatsAppSession.upsert({
      where: { userId },
      create: { userId, connected: false },
      update: { connected: false },
    });
    this.emit('disconnected', userId, {});
  }

  async getStatus(userId: string) {
    const session = await this.prisma.whatsAppSession.findUnique({ where: { userId } });
    const client = this.clients.get(userId);
    // Client must be in memory AND fully initialized (info.wid set on 'ready')
    const ready = !!(client && (client as any).info?.wid);
    return {
      connected: (session?.connected ?? false) && ready,
      phone: session?.phone ?? null,
    };
  }

  async reconnectAll(): Promise<void> {
    const sessions = await this.prisma.whatsAppSession.findMany({ where: { connected: true } });
    for (const s of sessions) {
      this.logger.log(`Auto-reconnecting ${s.userId}`);
      this.connect(s.userId).catch(err =>
        this.logger.error(`Reconnect failed ${s.userId}:`, err),
      );
    }
  }

  onModuleDestroy() {
    for (const [userId] of this.keepAliveTimers) this.clearKeepAlive(userId);
    for (const [, client] of this.clients) client.destroy().catch(() => {});
    this.clients.clear();
    // Actually close the shared browser on shutdown
    if (this.sharedBrowser?.isConnected?.()) {
      const orig = this.sharedBrowser.close.bind(this.sharedBrowser);
      orig().catch(() => {});
    }
  }
}
