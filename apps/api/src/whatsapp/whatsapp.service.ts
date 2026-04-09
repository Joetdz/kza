import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from './ai.service';
import { AutomationService } from './automation.service';
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import * as qrcode from 'qrcode';
import * as fs from 'fs';
import * as path from 'path';

export type WaGatewayCallback = (event: string, userId: string, data: any) => void;

@Injectable()
export class WhatsAppService implements OnModuleDestroy {
  private readonly logger = new Logger(WhatsAppService.name);
  private connections = new Map<string, ReturnType<typeof makeWASocket>>();
  private gatewayEmit: WaGatewayCallback | null = null;

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

  // ── Auth state stored per-user in a temp directory ──────────────────────────
  private getAuthDir(userId: string): string {
    const dir = path.join(process.cwd(), '.wa-auth', userId);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  async connect(userId: string): Promise<void> {
    if (this.connections.has(userId)) {
      // Already connecting or connected — just emit current status
      const session = await this.prisma.whatsAppSession.findUnique({ where: { userId } });
      if (session?.connected) {
        this.emit('connected', userId, { phone: session.phone });
      }
      return;
    }

    const { version } = await fetchLatestBaileysVersion();
    const authDir = this.getAuthDir(userId);
    const { state, saveCreds } = await useMultiFileAuthState(authDir);

    const sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, console as any),
      },
      printQRInTerminal: false,
      logger: { level: 'silent', trace: () => {}, debug: () => {}, info: () => {}, warn: () => {}, error: () => {}, fatal: () => {}, child: () => ({ level: 'silent', trace: () => {}, debug: () => {}, info: () => {}, warn: () => {}, error: () => {}, fatal: () => {}, child: () => ({} as any) }) } as any,
    });

    this.connections.set(userId, sock);

    sock.ev.on('creds.update', saveCreds);

    // ── Display names from phone address book ──────────────────────────────
    sock.ev.on('contacts.upsert', async (waContacts) => {
      for (const c of waContacts) {
        const phone = c.id;
        if (!phone || phone.includes('@g.us')) continue;
        const displayName = c.name ?? (c as any).notify ?? null;
        if (!displayName) continue;
        await this.prisma.whatsAppContact.updateMany({
          where: { userId, phone },
          data: { displayName },
        });
      }
    });

    // ── Chat metadata updates ───────────────────────────────────────────────
    sock.ev.on('chats.upsert', async (chats) => {
      for (const chat of chats) {
        const phone = chat.id;
        if (!phone || phone.includes('@g.us') || phone === 'status@broadcast') continue;
        const lastAt = chat.conversationTimestamp
          ? new Date(Number(chat.conversationTimestamp) * 1000) : undefined;
        if (!lastAt) continue;
        await this.prisma.whatsAppContact.updateMany({
          where: { userId, phone },
          data: { lastMessageAt: lastAt },
        });
      }
    });

    // ── Full history sync on connect (clones the phone) ────────────────────
    sock.ev.on('messaging-history.set', async ({ chats, contacts: histContacts, messages, isLatest }) => {
      this.logger.log(`[${userId}] History sync: ${chats.length} chats, ${messages.length} msgs`);
      this.emit('sync-start', userId, { total: messages.length });

      // Build name map from address book
      const nameMap = new Map<string, string>();
      for (const c of histContacts) {
        if (c.id && (c.name || (c as any).notify)) {
          nameMap.set(c.id, c.name ?? (c as any).notify);
        }
      }

      // Upsert all contacts from chats list
      for (const chat of chats) {
        const phone = chat.id;
        if (!phone || phone.includes('@g.us') || phone === 'status@broadcast') continue;
        const displayName = nameMap.get(phone) ?? (chat as any).name ?? null;
        const lastAt = chat.conversationTimestamp
          ? new Date(Number(chat.conversationTimestamp) * 1000) : new Date();

        await this.prisma.whatsAppContact.upsert({
          where: { userId_phone: { userId, phone } },
          create: {
            userId, phone, displayName,
            isRead: ((chat as any).unreadCount ?? 0) === 0,
            lastMessageAt: lastAt,
          },
          update: {
            ...(displayName ? { displayName } : {}),
            lastMessageAt: lastAt,
          },
        });
      }

      // Group messages by phone for batch insert
      const byPhone = new Map<string, Array<(typeof messages)[0]>>();
      for (const msg of messages) {
        const phone = msg.key.remoteJid ?? '';
        if (!phone || phone.includes('@g.us') || phone === 'status@broadcast') continue;
        if (!msg.message || !msg.key.id) continue;
        const msgTypes = Object.keys(msg.message);
        if (msgTypes.some(t => t === 'statusMentionMessage' || t === 'broadcastListMessage')) continue;
        if (!byPhone.has(phone)) byPhone.set(phone, []);
        byPhone.get(phone)!.push(msg);
      }

      let imported = 0;
      for (const [phone, msgs] of byPhone.entries()) {
        const contact = await this.prisma.whatsAppContact.findUnique({
          where: { userId_phone: { userId, phone } },
        });
        if (!contact) continue;

        const toInsert = msgs.map(msg => ({
          userId,
          contactId: contact.id,
          waId: msg.key.id!,
          direction: msg.key.fromMe ? 'out' : 'in',
          content: msg.message?.conversation
            ?? msg.message?.extendedTextMessage?.text
            ?? msg.message?.imageMessage?.caption
            ?? '[Media]',
          sentAt: new Date(Number(msg.messageTimestamp) * 1000),
        }));

        await this.prisma.whatsAppMessage.createMany({
          data: toInsert,
          skipDuplicates: true,
        });
        imported += toInsert.length;
        this.emit('sync-progress', userId, { imported, total: messages.length });
      }

      // Push refreshed contacts list to all browser tabs
      const allContacts = await this.prisma.whatsAppContact.findMany({
        where: { userId, isArchived: false },
        orderBy: { lastMessageAt: 'desc' },
      });
      this.emit('sync-complete', userId, { imported, contacts: allContacts });
      this.logger.log(`[${userId}] History sync done — ${imported} messages imported`);
    });

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        const qrDataUrl = await qrcode.toDataURL(qr);
        this.emit('qr', userId, { qr: qrDataUrl });
      }

      if (connection === 'open') {
        const phone = sock.user?.id?.split(':')[0] ?? null;
        await this.prisma.whatsAppSession.upsert({
          where: { userId },
          create: { userId, connected: true, phone },
          update: { connected: true, phone },
        });
        this.emit('connected', userId, { phone });
        this.logger.log(`WhatsApp connected for user ${userId} (${phone})`);
      }

      if (connection === 'close') {
        const code = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const shouldReconnect = code !== DisconnectReason.loggedOut;

        this.connections.delete(userId);
        await this.prisma.whatsAppSession.upsert({
          where: { userId },
          create: { userId, connected: false },
          update: { connected: false },
        });
        this.emit('disconnected', userId, {});

        if (shouldReconnect) {
          this.logger.log(`Reconnecting WhatsApp for user ${userId}...`);
          setTimeout(() => this.connect(userId), 3000);
        } else {
          // Logged out — clean auth
          fs.rmSync(this.getAuthDir(userId), { recursive: true, force: true });
        }
      }
    });

    sock.ev.on('messages.upsert', async ({ messages: msgs, type }) => {
      if (type !== 'notify') return;

      for (const msg of msgs) {
        if (msg.key.fromMe) continue;
        if (!msg.message) continue;

        const phone = msg.key.remoteJid ?? '';
        if (!phone) continue;

        // Skip group messages
        if (phone.includes('@g.us')) continue;

        // Skip status broadcasts (WhatsApp Status / Stories)
        if (phone === 'status@broadcast') continue;

        // Skip status update message types
        const msgTypes = Object.keys(msg.message);
        const isStatusMsg = msgTypes.some(t =>
          t === 'statusMentionMessage' ||
          t === 'viewOnceMessageV2Extension' ||
          t === 'broadcastListMessage'
        );
        if (isStatusMsg) continue;

        const content =
          msg.message?.conversation ??
          msg.message?.extendedTextMessage?.text ??
          msg.message?.imageMessage?.caption ??
          '[Media]';

        await this.handleIncoming(userId, phone, content, msg.key.id ?? null);
      }
    });
  }

  private async handleIncoming(userId: string, phone: string, content: string, waId: string | null = null): Promise<void> {
    // 1. Upsert contact
    const isFirstMessage = !(await this.prisma.whatsAppContact.findUnique({
      where: { userId_phone: { userId, phone } },
    }));

    const contact = await this.prisma.whatsAppContact.upsert({
      where: { userId_phone: { userId, phone } },
      create: { userId, phone, isRead: false, lastMessageAt: new Date() },
      update: { isRead: false, lastMessageAt: new Date() },
    });

    // 2. Save message (skip if already imported via history sync)
    const message = await this.prisma.whatsAppMessage.create({
      data: {
        userId,
        contactId: contact.id,
        waId,
        direction: 'in',
        content,
        sentAt: new Date(),
      },
    });

    // 3. Emit to frontend
    this.emit('message', userId, { contact, message });

    // 4. Run automations
    const event = isFirstMessage ? 'welcome' : 'message';
    const autoMessages = await this.automationService.process(userId, contact.id, event, { message: content });
    for (const autoMsg of autoMessages) {
      await this.sendMessage(userId, phone, autoMsg, contact.id, null);
    }

    // 5. AI reply (only if no automation message was sent, or always depending on config)
    if (contact.aiEnabled && autoMessages.length === 0) {
      const history = await this.prisma.whatsAppMessage.findMany({
        where: { contactId: contact.id },
        orderBy: { sentAt: 'asc' },
        take: 10,
      });

      const sock = this.connections.get(userId);
      if (!sock) return;

      const aiConfig = await this.prisma.whatsAppAIConfig.findUnique({ where: { userId } });
      const delay = aiConfig?.simulatedDelayMs ?? 2000;

      // Simulate typing delay
      await sock.sendPresenceUpdate('composing', phone);
      await new Promise(r => setTimeout(r, delay));

      const aiResult = await this.aiService.reply(userId, phone, history, content);
      if (aiResult?.text) {
        await this.sendMessage(userId, phone, aiResult.text, contact.id, true);

        // If escalate — disable AI for this contact
        if (aiResult.shouldEscalate) {
          await this.prisma.whatsAppContact.update({
            where: { id: contact.id },
            data: { aiEnabled: false },
          });
          this.emit('contact-updated', userId, { contactId: contact.id, aiEnabled: false });
        }
      }

      await sock.sendPresenceUpdate('available', phone);

      // 6. Qualify lead
      const updatedHistory = await this.prisma.whatsAppMessage.findMany({
        where: { contactId: contact.id },
        orderBy: { sentAt: 'asc' },
        take: 10,
      });
      const qualification = await this.aiService.qualify(userId, updatedHistory);
      if (qualification && Object.keys(qualification).length > 0) {
        const updated = await this.prisma.whatsAppContact.update({
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

        // Hot lead → automation trigger
        if (qualification.leadStatus === 'hot' && contact.leadStatus !== 'hot') {
          await this.automationService.process(userId, contact.id, 'lead_status', { status: 'hot' });
        }
      }
    }
  }

  async sendMessage(
    userId: string,
    phone: string,
    text: string,
    contactId: string,
    fromAi: boolean | null = false,
  ): Promise<void> {
    const sock = this.connections.get(userId);
    if (!sock) throw new Error('WhatsApp non connecté');

    const result = await sock.sendMessage(phone, { text });
    const waId = result?.key?.id ?? null;

    const message = await this.prisma.whatsAppMessage.create({
      data: {
        userId,
        contactId,
        waId,
        direction: 'out',
        content: text,
        fromAi: fromAi ?? false,
        sentAt: new Date(),
      },
    });

    this.emit('message', userId, {
      contact: { id: contactId },
      message,
    });
  }

  async disconnect(userId: string): Promise<void> {
    const sock = this.connections.get(userId);
    if (sock) {
      await sock.logout();
      this.connections.delete(userId);
    }
    await this.prisma.whatsAppSession.upsert({
      where: { userId },
      create: { userId, connected: false },
      update: { connected: false },
    });
    fs.rmSync(this.getAuthDir(userId), { recursive: true, force: true });
    this.emit('disconnected', userId, {});
  }

  async getStatus(userId: string) {
    const session = await this.prisma.whatsAppSession.findUnique({ where: { userId } });
    const isSocketOpen = this.connections.has(userId);
    return {
      connected: (session?.connected ?? false) && isSocketOpen,
      phone: session?.phone ?? null,
    };
  }

  // Reconnect all sessions on startup (if auth files exist)
  async reconnectAll(): Promise<void> {
    const authBase = path.join(process.cwd(), '.wa-auth');
    if (!fs.existsSync(authBase)) return;
    const userDirs = fs.readdirSync(authBase);
    for (const userId of userDirs) {
      this.logger.log(`Auto-reconnecting WhatsApp for user ${userId}`);
      this.connect(userId).catch(err => this.logger.error(`Reconnect failed for ${userId}:`, err));
    }
  }

  onModuleDestroy() {
    for (const [, sock] of this.connections) {
      sock.end(undefined);
    }
    this.connections.clear();
  }
}
