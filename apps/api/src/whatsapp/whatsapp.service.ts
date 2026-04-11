import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from './ai.service';
import { AutomationService } from './automation.service';
import { Client, LocalAuth, Message } from 'whatsapp-web.js';
import * as qrcode from 'qrcode';
import * as path from 'path';
import * as fs from 'fs';

export type WaGatewayCallback = (event: string, userId: string, data: any) => void;

@Injectable()
export class WhatsAppService implements OnModuleDestroy {
  private readonly logger = new Logger(WhatsAppService.name);
  private clients = new Map<string, Client>();
  private importedUsers = new Set<string>(); // prevent double import on reconnect
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

  async connect(userId: string): Promise<void> {
    if (this.clients.has(userId)) {
      const session = await this.prisma.whatsAppSession.findUnique({ where: { userId } });
      if (session?.connected) this.emit('connected', userId, { phone: session.phone });
      return;
    }

    const client = new Client({
      authStrategy: new LocalAuth({
        clientId: userId,
        dataPath: path.join(process.cwd(), '.wwebjs_auth'),
      }),
      puppeteer: {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-gpu',
          '--disable-dev-shm-usage',
          '--disable-extensions',
        ],
      },
    });

    this.clients.set(userId, client);

    client.on('qr', async (qr) => {
      const qrDataUrl = await qrcode.toDataURL(qr);
      this.emit('qr', userId, { qr: qrDataUrl });
    });

    client.on('loading_screen', (percent: number, message: string) => {
      this.emit('loading', userId, { percent, message });
    });

    client.on('ready', async () => {
      const phone = (client as any).info?.wid?.user ?? null;
      await this.prisma.whatsAppSession.upsert({
        where: { userId },
        create: { userId, connected: true, phone },
        update: { connected: true, phone },
      });
      this.emit('connected', userId, { phone });
      this.logger.log(`WhatsApp ready for ${userId} (${phone})`);

      // Import full chat history only once per session (not on every reconnect)
      if (!this.importedUsers.has(userId)) {
        this.importedUsers.add(userId);
        this.importAllChats(userId, client).catch(err =>
          this.logger.error(`Import failed for ${userId}:`, err),
        );
      }
    });

    client.on('disconnected', async (reason: string) => {
      this.logger.log(`WhatsApp disconnected for ${userId}: ${reason}`);
      this.clients.delete(userId);
      this.importedUsers.delete(userId); // allow re-import if reconnecting after logout
      await this.prisma.whatsAppSession.upsert({
        where: { userId },
        create: { userId, connected: false },
        update: { connected: false },
      });
      this.emit('disconnected', userId, { reason });

      if (reason !== 'LOGOUT') {
        setTimeout(() => this.connect(userId), 5000);
      }
    });

    // Incoming messages (from others)
    client.on('message', async (msg: Message) => {
      await this.handleIncoming(userId, msg, client);
    });

    // Messages sent from the phone (not via our API)
    // message_create fires for ALL outgoing — we skip ones already saved by sendMessage()
    client.on('message_create', async (msg: Message) => {
      if (!msg.fromMe) return;
      // Skip if this waId was already saved by our sendMessage() call
      if (msg.id?.id) {
        const dup = await (this.prisma.whatsAppMessage as any).findFirst({
          where: { userId, waId: msg.id.id },
        });
        if (dup) return;
      }
      await this.handleOutgoingFromPhone(userId, msg);
    });

    // Read receipts / delivery status
    client.on('message_ack', async (msg: Message, ack: number) => {
      if (!msg.id?.id) return;
      await (this.prisma.whatsAppMessage as any).updateMany({
        where: { waId: msg.id.id, userId },
        data: { ack },
      });
      this.emit('message-ack', userId, { waId: msg.id.id, ack });
    });

    // Deleted messages
    client.on('message_revoke_everyone', async (_msg: any, revokedMsg: any) => {
      if (!revokedMsg?.id?.id) return;
      await (this.prisma.whatsAppMessage as any).updateMany({
        where: { waId: revokedMsg.id.id, userId },
        data: { content: '🚫 Message supprimé' },
      });
      this.emit('message-revoked', userId, { waId: revokedMsg.id.id });
    });

    // Fire-and-forget — initialize runs in background, events push via WebSocket
    client.initialize().catch(err =>
      this.logger.error(`Initialize failed for ${userId}:`, err),
    );
  }

  // ── Import full history on connect ────────────────────────────────────────────

  private async importAllChats(userId: string, client: Client): Promise<void> {
    const chats = await client.getChats();
    const privateChats = chats.filter((c: any) => !c.isGroup && !c.id._serialized.endsWith('@broadcast'));

    this.emit('sync-start', userId, { total: privateChats.length });
    this.logger.log(`[${userId}] Importing ${privateChats.length} chats`);

    let done = 0;
    for (const chat of privateChats) {
      try {
        const phone: string = chat.id._serialized;
        const waContact = await client.getContactById(phone).catch(() => null) as any;
        const displayName: string | null = waContact?.pushname || waContact?.name || (chat as any).name || null;
        const lastAt = (chat as any).timestamp ? new Date((chat as any).timestamp * 1000) : new Date();
        const unread: number = (chat as any).unreadCount ?? 0;

        // Fetch last 50 messages
        const msgs: any[] = await (chat as any).fetchMessages({ limit: 50 }).catch(() => []);
        const lastMsg = msgs[msgs.length - 1];
        const lastMessageText: string | null = lastMsg?.body || null;

        const dbContact = await this.prisma.whatsAppContact.upsert({
          where: { userId_phone: { userId, phone } },
          create: {
            userId, phone, displayName,
            isRead: unread === 0,
            lastMessageAt: lastAt,
            lastMessageText,
          },
          update: {
            ...(displayName ? { displayName } : {}),
            isRead: unread === 0,
            lastMessageAt: lastAt,
            ...(lastMessageText ? { lastMessageText } : {}),
          },
        });

        if (msgs.length > 0) {
          const toInsert = msgs
            .filter((m: any) => m.id?.id) // only messages with a waId
            .map((m: any) => ({
              userId,
              contactId: dbContact.id,
              waId: m.id.id,
              direction: m.fromMe ? 'out' : 'in',
              content: m.body || (m.hasMedia ? `[${m.type}]` : '[Message]'),
              mediaType: m.hasMedia ? m.type : null,
              ack: m.ack ?? 0,
              sentAt: new Date(m.timestamp * 1000),
            }));

          if (toInsert.length > 0) {
            // skipDuplicates enforced by @@unique([userId, waId]) in DB
            await (this.prisma.whatsAppMessage as any).createMany({
              data: toInsert,
              skipDuplicates: true,
            });
          }
        }
      } catch (err: any) {
        this.logger.warn(`Chat import error ${(chat as any).id?._serialized}: ${err.message}`);
      }

      done++;
      this.emit('sync-progress', userId, { imported: done, total: privateChats.length });
    }

    const allContacts = await this.prisma.whatsAppContact.findMany({
      where: { userId, isArchived: false },
      include: { tags: { include: { tag: true } } },
      orderBy: { lastMessageAt: 'desc' },
    });
    this.emit('sync-complete', userId, { imported: done, contacts: allContacts });
    this.logger.log(`[${userId}] Sync complete — ${done} chats`);
  }

  // ── Incoming message handler ──────────────────────────────────────────────────

  private async handleIncoming(userId: string, msg: Message, client: Client): Promise<void> {
    const phone: string = (msg as any).from;
    if (!phone || phone === 'status@broadcast' || phone.endsWith('@g.us')) return;

    // Dedup
    if (msg.id?.id) {
      const dup = await (this.prisma.whatsAppMessage as any).findFirst({
        where: { userId, waId: msg.id.id },
      });
      if (dup) return;
    }

    const waContact = await client.getContactById(phone).catch(() => null) as any;
    const displayName: string | null = waContact?.pushname || waContact?.name || null;

    const isFirst = !(await this.prisma.whatsAppContact.findUnique({
      where: { userId_phone: { userId, phone } },
    }));

    // Download media if any
    let mediaUrl: string | null = null;
    let mediaType: string | null = null;
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
        }
      } catch {
        mediaType = (msg as any).type;
      }
    }

    const quotedMsgId: string | null = (msg as any).hasQuotedMsg
      ? (await (msg as any).getQuotedMessage().catch(() => null))?.id?.id ?? null
      : null;

    const contact = await this.prisma.whatsAppContact.upsert({
      where: { userId_phone: { userId, phone } },
      create: {
        userId, phone, displayName,
        isRead: false,
        lastMessageAt: new Date(),
        lastMessageText: (msg as any).body || null,
      },
      update: {
        ...(displayName ? { displayName } : {}),
        isRead: false,
        lastMessageAt: new Date(),
        lastMessageText: (msg as any).body || null,
      },
    });

    const message = await (this.prisma.whatsAppMessage as any).create({
      data: {
        userId,
        contactId: contact.id,
        waId: msg.id?.id ?? null,
        direction: 'in',
        content: (msg as any).body || (mediaType ? `[${mediaType}]` : '[Message]'),
        mediaUrl,
        mediaType,
        quotedMsgId,
        ack: 3,
        sentAt: new Date((msg as any).timestamp * 1000),
      },
    });

    this.emit('message', userId, { contact, message });

    // Automations
    const event = isFirst ? 'welcome' : 'message';
    const autoMessages = await this.automationService.process(userId, contact.id, event, { message: (msg as any).body });
    for (const autoMsg of autoMessages) {
      await this.sendMessage(userId, phone, autoMsg, contact.id, null, client);
    }

    // AI reply
    if (contact.aiEnabled && autoMessages.length === 0 && (msg as any).body) {
      const history = await this.prisma.whatsAppMessage.findMany({
        where: { contactId: contact.id },
        orderBy: { sentAt: 'asc' },
        take: 10,
      });

      const aiConfig = await this.prisma.whatsAppAIConfig.findUnique({ where: { userId } });
      const delay = aiConfig?.simulatedDelayMs ?? 2000;

      const chat = await (msg as any).getChat().catch(() => null);
      if (chat) await chat.sendStateTyping().catch(() => {});
      await new Promise(r => setTimeout(r, delay));
      if (chat) await chat.clearState().catch(() => {});

      const aiResult = await this.aiService.reply(userId, phone, history, (msg as any).body);
      if (aiResult?.text) {
        await this.sendMessage(userId, phone, aiResult.text, contact.id, true, client);
        if (aiResult.shouldEscalate) {
          await this.prisma.whatsAppContact.update({
            where: { id: contact.id },
            data: { aiEnabled: false },
          });
          this.emit('contact-updated', userId, { contactId: contact.id, aiEnabled: false });
        }
      }

      // Lead qualification
      const fullHistory = await this.prisma.whatsAppMessage.findMany({
        where: { contactId: contact.id },
        orderBy: { sentAt: 'asc' },
        take: 10,
      });
      const qualification = await this.aiService.qualify(userId, fullHistory);
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
      }
    }
  }

  // ── Messages sent from the physical phone (not via API) ───────────────────────

  private async handleOutgoingFromPhone(userId: string, msg: Message): Promise<void> {
    const phone: string = (msg as any).to;
    if (!phone || phone.endsWith('@g.us') || phone === 'status@broadcast') return;

    const body: string = (msg as any).body || '';

    // Upsert contact — create if first time sending to this number from phone
    const contact = await this.prisma.whatsAppContact.upsert({
      where: { userId_phone: { userId, phone } },
      create: {
        userId, phone,
        isRead: true,
        lastMessageAt: new Date(),
        lastMessageText: body || null,
      },
      update: {
        lastMessageAt: new Date(),
        lastMessageText: body || null,
      },
    });

    const message = await (this.prisma.whatsAppMessage as any).create({
      data: {
        userId,
        contactId: contact.id,
        waId: msg.id?.id ?? null,
        direction: 'out',
        content: (msg as any).body || `[${(msg as any).type ?? 'media'}]`,
        mediaType: (msg as any).hasMedia ? (msg as any).type : null,
        ack: (msg as any).ack ?? 1,
        sentAt: new Date((msg as any).timestamp * 1000),
      },
    });

    await this.prisma.whatsAppContact.update({
      where: { id: contact.id },
      data: { lastMessageAt: new Date(), lastMessageText: (msg as any).body || null },
    });

    this.emit('message', userId, { contact, message });
  }

  // ── Send message (via API) ────────────────────────────────────────────────────

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

    const result = await client.sendMessage(phone, text) as any;
    const waId: string | null = result?.id?.id ?? null;

    const message = await (this.prisma.whatsAppMessage as any).create({
      data: {
        userId,
        contactId,
        waId,
        direction: 'out',
        content: text,
        fromAi: fromAi ?? false,
        ack: 1,
        sentAt: new Date(),
      },
    });

    await this.prisma.whatsAppContact.update({
      where: { id: contactId },
      data: { lastMessageAt: new Date(), lastMessageText: text },
    });

    this.emit('message', userId, { contact: { id: contactId }, message });
  }

  // ── Send message with reply (quoted) ─────────────────────────────────────────

  async sendReply(
    userId: string,
    phone: string,
    text: string,
    contactId: string,
    quotedWaId: string,
  ): Promise<void> {
    const client = this.clients.get(userId);
    if (!client) throw new Error('WhatsApp non connecté');

    // Find the original message to quote it
    const chat = await client.getChatById(phone).catch(() => null);
    if (!chat) {
      await this.sendMessage(userId, phone, text, contactId, false);
      return;
    }

    // Fetch messages to find the quoted one
    const fetchedMsgs = await (chat as any).fetchMessages({ limit: 50 }).catch(() => []) as any[];
    const originalMsg = fetchedMsgs.find((m: any) => m.id?.id === quotedWaId);

    let result: any;
    if (originalMsg) {
      result = await originalMsg.reply(text);
    } else {
      result = await client.sendMessage(phone, text);
    }

    const waId: string | null = result?.id?.id ?? null;

    const message = await (this.prisma.whatsAppMessage as any).create({
      data: {
        userId,
        contactId,
        waId,
        direction: 'out',
        content: text,
        quotedMsgId: quotedWaId,
        ack: 1,
        sentAt: new Date(),
      },
    });

    await this.prisma.whatsAppContact.update({
      where: { id: contactId },
      data: { lastMessageAt: new Date(), lastMessageText: text },
    });

    this.emit('message', userId, { contact: { id: contactId }, message });
  }

  // ── Disconnect ────────────────────────────────────────────────────────────────

  async disconnect(userId: string): Promise<void> {
    const client = this.clients.get(userId);
    if (client) {
      await client.logout().catch(() => {});
      await client.destroy().catch(() => {});
      this.clients.delete(userId);
    }
    await this.prisma.whatsAppSession.upsert({
      where: { userId },
      create: { userId, connected: false },
      update: { connected: false },
    });
    this.emit('disconnected', userId, {});
  }

  async getStatus(userId: string) {
    const session = await this.prisma.whatsAppSession.findUnique({ where: { userId } });
    return {
      connected: (session?.connected ?? false) && this.clients.has(userId),
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
    for (const [, client] of this.clients) {
      client.destroy().catch(() => {});
    }
    this.clients.clear();
  }
}
