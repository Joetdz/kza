import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query, Req,
  NotFoundException,
} from '@nestjs/common';
import { WhatsAppService } from './whatsapp.service';
import { AiService } from './ai.service';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { SendMessageDto } from './dto/send-message.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { AiConfigDto } from './dto/ai-config.dto';
import { KbEntryDto, UpdateKbEntryDto } from './dto/kb-entry.dto';
import { AutomationDto, UpdateAutomationDto } from './dto/automation.dto';
import { UpdateAudienceContactDto, UpdateUserProfileDto } from './dto/audience.dto';
import { IsIn, IsOptional, IsString, IsPhoneNumber, IsUrl } from 'class-validator';

class CreateNoteDto {
  @IsString() content: string;
}

class ImportKbDto {
  @IsUrl({ require_protocol: true })
  url: string;

  @IsIn(['website', 'facebook', 'instagram'])
  kind: 'website' | 'facebook' | 'instagram';
}

class ConnectPairingDto {
  @IsString() phone: string;
}

class CreateTagDto {
  @IsString() name: string;
  @IsOptional() @IsString() color?: string;
}

@Controller('whatsapp')
export class WhatsAppController {
  constructor(
    private wa: WhatsAppService,
    private ai: AiService,
    private prisma: PrismaService,
  ) {}

  // ── Helper: resolve or auto-create a contact ─────────────────────────────────
  // When contacts are deleted from DB, getContacts() returns id = phone number.
  // This helper auto-creates the DB record on first interaction.
  // Everything WhatsApp belongs to the business the request is scoped to.
  private biz(user: AuthUser): string | null {
    return user.businessId || null;
  }

  private async resolveContact(id: string, user: AuthUser) {
    const userId = user.ownerId;
    const businessId = this.biz(user);
    const include = { tags: { include: { tag: true } } };

    if (id.includes('@')) {
      // id is a phone number — create the contact record if it doesn't exist yet
      const existing = await this.prisma.whatsAppContact.findFirst({
        where: { userId, businessId, phone: id },
        include,
      });
      if (existing) return existing;
      return this.prisma.whatsAppContact.create({
        data: { userId, businessId, phone: id },
        include,
      });
    }
    const contact = await this.prisma.whatsAppContact.findFirst({
      where: { id, userId, businessId },
      include,
    });
    if (!contact) throw new NotFoundException();
    return contact;
  }

  // ── Internal: force audience sync (dev only, uses X-Dev-UserId header) ───────
  @Post('internal/sync')
  async internalSync(@Req() req: any) {
    const secret = process.env.INTERNAL_SYNC_SECRET;
    const userId = req.headers['x-dev-userid'] as string;
    const key = req.headers['x-dev-secret'] as string;
    if (!userId || !secret || key !== secret) return { error: 'forbidden' };
    // Clean up @lid entries first, then re-sync with real phone numbers
    await this.prisma.$executeRaw`
      DELETE FROM wa_campaign_contacts
      WHERE client_id = ${userId}
      AND phone_number LIKE '%@lid'
    `;
    const bizId = (req.headers['x-business-id'] as string) || null;
    this.wa.syncContactDirectory(userId, bizId).catch(() => {});
    return { ok: true, userId };
  }

  // ── Connexion ────────────────────────────────────────────────────────────────

  @Get('status')
  getStatus(@CurrentUser() user: AuthUser) {
    return this.wa.getStatus(user.ownerId, this.biz(user));
  }

  @Get('groups')
  getGroups(@CurrentUser() user: AuthUser) {
    return this.wa.getGroups(user.ownerId, this.biz(user));
  }

  @Post('connect')
  async connect(@CurrentUser() user: AuthUser) {
    await this.wa.connectFresh(user.ownerId, this.biz(user));
    return { message: 'Connexion initialisée' };
  }

  @Post('disconnect')
  async disconnect(@CurrentUser() user: AuthUser) {
    await this.wa.disconnect(user.ownerId, this.biz(user));
    return { message: 'Déconnecté' };
  }

  @Post('connect-pairing')
  async connectPairing(@CurrentUser() user: AuthUser, @Body() dto: ConnectPairingDto) {
    await this.wa.connectWithPairingCode(user.ownerId, this.biz(user), dto.phone);
    return { message: 'Connexion par code initialisée' };
  }

  // ── Contacts ─────────────────────────────────────────────────────────────────

  @Get('contacts')
  getContacts(
    @CurrentUser() user: AuthUser,
    @Query('filter') filter?: string,
    @Query('search') search?: string,
    @Query('tag') tagId?: string,
  ) {
    return this.wa.getContacts(user.ownerId, this.biz(user), filter, search, tagId);
  }

  @Get('contacts/:id')
  async getContact(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    const contact = await this.prisma.whatsAppContact.findFirst({
      where: { id, userId: user.ownerId, businessId: this.biz(user) },
      include: { tags: { include: { tag: true } }, notes: { orderBy: { createdAt: 'desc' } } },
    });
    if (!contact) throw new NotFoundException();
    return contact;
  }

  @Patch('contacts/:id')
  async updateContact(
    @Param('id') id: string,
    @Body() dto: UpdateContactDto,
    @CurrentUser() user: AuthUser,
  ) {
    const contact = await this.resolveContact(id, user);
    const { aiPausedUntil, ...rest } = dto;
    const data: any = { ...rest };
    // dto.aiPausedUntil arrives as an ISO string (or null to reactivate the AI early) —
    // Prisma's DateTime column needs an actual Date.
    if ('aiPausedUntil' in dto) data.aiPausedUntil = aiPausedUntil ? new Date(aiPausedUntil) : null;
    return this.prisma.whatsAppContact.update({ where: { id: contact.id }, data });
  }

  @Delete('contacts/:id')
  async deleteContact(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    const contact = await this.resolveContact(id, user);
    await this.prisma.whatsAppContact.delete({ where: { id: contact.id } });
    return { id: contact.id };
  }

  // ── Messages ─────────────────────────────────────────────────────────────────

  @Get('contacts/:id/messages')
  getMessages(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.wa.getMessages(user.ownerId, this.biz(user), id);
  }

  @Post('contacts/:id/send')
  async sendMessage(
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
    @CurrentUser() user: AuthUser,
  ) {
    const contact = await this.resolveContact(id, user);
    if (dto.quotedMsgId) {
      await this.wa.sendReply(user.ownerId, this.biz(user), contact.phone, dto.message, contact.id, dto.quotedMsgId);
    } else {
      await this.wa.sendMessage(user.ownerId, this.biz(user), contact.phone, dto.message, contact.id, false);
    }
    // A human just took this conversation over by hand — hold the AI back for a while.
    await this.wa.pauseAiForContact(user.ownerId, this.biz(user), contact.id);
    return { ok: true };
  }

  @Post('contacts/:id/label')
  async applyLabel(
    @Param('id') id: string,
    @Body() body: { label: string },
    @CurrentUser() user: AuthUser,
  ) {
    const contact = await this.resolveContact(id, user);
    const applied = await this.wa.applyLabelToChat(user.ownerId, contact.phone, body.label);
    return { ok: applied };
  }

  @Patch('contacts/:id/read')
  async markRead(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    const contact = await this.resolveContact(id, user);
    await this.wa.markRead(user.ownerId, contact.phone);
    return { ok: true };
  }

  // ── Notes ────────────────────────────────────────────────────────────────────

  @Get('contacts/:id/notes')
  async getNotes(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    const contact = await this.resolveContact(id, user);
    return this.prisma.whatsAppNote.findMany({
      where: { contactId: contact.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post('contacts/:id/notes')
  async createNote(
    @Param('id') id: string,
    @Body() dto: CreateNoteDto,
    @CurrentUser() user: AuthUser,
  ) {
    const contact = await this.resolveContact(id, user);
    return this.prisma.whatsAppNote.create({
      data: { contactId: contact.id, userId: user.ownerId, businessId: this.biz(user), content: dto.content },
    });
  }

  @Delete('notes/:noteId')
  async deleteNote(@Param('noteId') noteId: string, @CurrentUser() user: AuthUser) {
    await this.prisma.whatsAppNote.deleteMany({ where: { id: noteId, userId: user.ownerId } });
    return { id: noteId };
  }

  // ── Réponses rapides ─────────────────────────────────────────────────────────
  // Mirrored from the WhatsApp Business app, read-only here: they are edited on the phone.

  @Get('quick-replies')
  getQuickReplies(@CurrentUser() user: AuthUser) {
    return this.prisma.waQuickReply
      .findMany({
        where: { userId: user.ownerId, businessId: this.biz(user) },
        select: { id: true, shortcut: true, message: true, keywords: true },
        orderBy: { shortcut: 'asc' },
      })
      .catch(() => []);
  }

  // ── Tags ─────────────────────────────────────────────────────────────────────

  @Get('tags')
  getTags(@CurrentUser() user: AuthUser) {
    return this.prisma.whatsAppTag.findMany({
      where: { userId: user.ownerId, businessId: this.biz(user) },
      orderBy: { name: 'asc' },
    });
  }

  @Post('tags')
  createTag(@Body() dto: CreateTagDto, @CurrentUser() user: AuthUser) {
    return this.prisma.whatsAppTag.create({
      data: { userId: user.ownerId, businessId: this.biz(user), name: dto.name, color: dto.color ?? '#6366f1' },
    });
  }

  @Delete('tags/:tagId')
  async deleteTag(@Param('tagId') tagId: string, @CurrentUser() user: AuthUser) {
    await this.prisma.whatsAppTag.deleteMany({ where: { id: tagId, userId: user.ownerId } });
    return { id: tagId };
  }

  @Post('contacts/:id/tags/:tagId')
  async addTagToContact(
    @Param('id') id: string,
    @Param('tagId') tagId: string,
    @CurrentUser() user: AuthUser,
  ) {
    const contact = await this.resolveContact(id, user);
    return this.prisma.whatsAppContactTag.upsert({
      where: { contactId_tagId: { contactId: contact.id, tagId } },
      create: { contactId: contact.id, tagId },
      update: {},
    });
  }

  @Delete('contacts/:id/tags/:tagId')
  async removeTagFromContact(
    @Param('id') id: string,
    @Param('tagId') tagId: string,
    @CurrentUser() user: AuthUser,
  ) {
    const contact = await this.resolveContact(id, user);
    await this.prisma.whatsAppContactTag.delete({
      where: { contactId_tagId: { contactId: contact.id, tagId } },
    });
    return { ok: true };
  }

  // ── Config IA ────────────────────────────────────────────────────────────────

  // businessId is nullable, so the (userId, businessId) unique can't drive an upsert.
  private async upsertAiConfig(user: AuthUser, dto: Partial<AiConfigDto> = {}) {
    const businessId = this.biz(user);
    const existing = await this.prisma.whatsAppAIConfig.findFirst({
      where: { userId: user.ownerId, businessId },
    });
    if (existing) {
      return Object.keys(dto).length === 0
        ? existing
        : this.prisma.whatsAppAIConfig.update({ where: { id: existing.id }, data: dto });
    }
    return this.prisma.whatsAppAIConfig.create({
      data: { userId: user.ownerId, businessId, ...dto },
    });
  }

  @Get('ai-config')
  getAiConfig(@CurrentUser() user: AuthUser) {
    return this.upsertAiConfig(user);
  }

  @Patch('ai-config')
  updateAiConfig(@Body() dto: AiConfigDto, @CurrentUser() user: AuthUser) {
    return this.upsertAiConfig(user, dto);
  }

  // ── Base de connaissance ──────────────────────────────────────────────────────

  @Get('kb')
  getKb(@CurrentUser() user: AuthUser) {
    return this.prisma.whatsAppKBEntry.findMany({
      where: { userId: user.ownerId, businessId: this.biz(user) },
      orderBy: [{ category: 'asc' }, { title: 'asc' }],
    });
  }

  @Post('kb')
  createKb(@Body() dto: KbEntryDto, @CurrentUser() user: AuthUser) {
    return this.prisma.whatsAppKBEntry.create({
      data: { userId: user.ownerId, businessId: this.biz(user), ...dto, tags: dto.tags ?? [] },
    });
  }

  @Patch('kb/:id')
  async updateKb(
    @Param('id') id: string,
    @Body() dto: UpdateKbEntryDto,
    @CurrentUser() user: AuthUser,
  ) {
    const entry = await this.prisma.whatsAppKBEntry.findFirst({ where: { id, userId: user.ownerId, businessId: this.biz(user) } });
    if (!entry) throw new NotFoundException();
    return this.prisma.whatsAppKBEntry.update({ where: { id }, data: dto });
  }

  @Delete('kb/:id')
  async deleteKb(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    const entry = await this.prisma.whatsAppKBEntry.findFirst({ where: { id, userId: user.ownerId, businessId: this.biz(user) } });
    if (!entry) throw new NotFoundException();
    await this.prisma.whatsAppKBEntry.delete({ where: { id } });
    return { id };
  }

  // Seeds the knowledge base from the business's own website / Facebook / Instagram
  // page — mirrors how Meta's own Business Agent learns from those same sources.
  @Post('kb/import')
  async importKb(@Body() dto: ImportKbDto, @CurrentUser() user: AuthUser) {
    return this.wa.importKbFromUrl(user.ownerId, this.biz(user), dto.url, dto.kind);
  }

  @Post('kb/generate-script')
  async generateKbScript(
    @Body() dto: { name: string; price?: string; category?: string; quantity?: number },
  ) {
    const script = await this.ai.generateClosingScript(dto);
    if (!script) throw new Error('Génération du script échouée');
    return { script };
  }

  // ── Automatisations ──────────────────────────────────────────────────────────

  @Get('automations')
  getAutomations(@CurrentUser() user: AuthUser) {
    return this.prisma.whatsAppAutomation.findMany({
      where: { userId: user.ownerId, businessId: this.biz(user) },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post('automations')
  createAutomation(@Body() dto: AutomationDto, @CurrentUser() user: AuthUser) {
    return this.prisma.whatsAppAutomation.create({
      data: { userId: user.ownerId, businessId: this.biz(user), ...dto },
    });
  }

  @Patch('automations/:id')
  async updateAutomation(
    @Param('id') id: string,
    @Body() dto: UpdateAutomationDto,
    @CurrentUser() user: AuthUser,
  ) {
    const auto = await this.prisma.whatsAppAutomation.findFirst({ where: { id, userId: user.ownerId, businessId: this.biz(user) } });
    if (!auto) throw new NotFoundException();
    return this.prisma.whatsAppAutomation.update({ where: { id }, data: dto });
  }

  @Delete('automations/:id')
  async deleteAutomation(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    const auto = await this.prisma.whatsAppAutomation.findFirst({ where: { id, userId: user.ownerId, businessId: this.biz(user) } });
    if (!auto) throw new NotFoundException();
    await this.prisma.whatsAppAutomation.delete({ where: { id } });
    return { id };
  }

  // ── Audience ─────────────────────────────────────────────────────────────────

  @Get('audience')
  async getAudience(
    @CurrentUser() user: AuthUser,
    @Query('page') page = '1',
    @Query('limit') limit = '50',
    @Query('search') search?: string,
    @Query('consentStatus') consentStatus?: string,
    @Query('contactStatus') contactStatus?: string,
    @Query('segment') segment?: string,
  ) {
    const where: any = { clientId: user.ownerId };
    if (search) {
      where.OR = [
        { phoneNumber: { contains: search } },
        { displayName: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (consentStatus) where.consentStatus = consentStatus;
    if (contactStatus) where.contactStatus = contactStatus;
    if (segment) where.segments = { has: segment };

    const [data, total] = await Promise.all([
      this.prisma.waCampaignContact.findMany({
        where,
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        orderBy: { syncedAt: 'desc' },
      }),
      this.prisma.waCampaignContact.count({ where }),
    ]);
    return { data, total, page: Number(page), limit: Number(limit) };
  }

  @Post('audience/sync')
  async triggerAudienceSync(@CurrentUser() user: AuthUser) {
    this.wa.syncContactDirectory(user.ownerId, this.biz(user)).catch(() => {});
    return { message: 'Sync démarrée' };
  }

  @Get('audience/stats')
  async getAudienceStats(@CurrentUser() user: AuthUser) {
    const [total, active, consented] = await Promise.all([
      this.prisma.waCampaignContact.count({ where: { clientId: user.ownerId } }),
      this.prisma.waCampaignContact.count({ where: { clientId: user.ownerId, contactStatus: 'active' } }),
      this.prisma.waCampaignContact.count({ where: { clientId: user.ownerId, consentStatus: 'granted' } }),
    ]);
    // Collect all unique segments
    const contacts = await this.prisma.waCampaignContact.findMany({
      where: { clientId: user.ownerId },
      select: { segments: true },
    });
    const segments = [...new Set(contacts.flatMap(c => c.segments))].sort();
    return { total, active, consented, segments };
  }

  @Patch('audience/:id')
  async updateAudienceContact(
    @Param('id') id: string,
    @Body() dto: UpdateAudienceContactDto,
    @CurrentUser() user: AuthUser,
  ) {
    const contact = await this.prisma.waCampaignContact.findFirst({ where: { id, clientId: user.ownerId } });
    if (!contact) throw new NotFoundException();
    return this.prisma.waCampaignContact.update({ where: { id }, data: dto });
  }

  // ── Profil utilisateur ────────────────────────────────────────────────────────

  // A profile belongs to the person signed in, not to the business — an invited
  // member edits their own, never the owner's.
  @Get('profile')
  getProfile(@CurrentUser() user: AuthUser) {
    return this.prisma.userProfile.upsert({
      where: { userId: user.id },
      create: { userId: user.id },
      update: {},
    });
  }

  @Patch('profile')
  updateProfile(@Body() dto: UpdateUserProfileDto, @CurrentUser() user: AuthUser) {
    return this.prisma.userProfile.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...dto },
      update: dto,
    });
  }

  // ── Statistiques produits mentionnés ─────────────────────────────────────────

  @Get('product-stats')
  async getProductStats(@CurrentUser() user: AuthUser) {
    const [allMentions, converted] = await Promise.all([
      this.prisma.whatsAppProductMention.groupBy({
        by: ['productName', 'productId'],
        where: { userId: user.ownerId },
        _count: { _all: true },
        orderBy: { _count: { productName: 'desc' } },
      }),
      this.prisma.whatsAppProductMention.groupBy({
        by: ['productName'],
        where: { userId: user.ownerId, isConverted: true },
        _count: { _all: true },
      }),
    ]);

    const convertedMap = new Map(converted.map(c => [c.productName, c._count._all]));

    return allMentions.map(m => {
      const conv = convertedMap.get(m.productName) ?? 0;
      return {
        productName: m.productName,
        productId: m.productId,
        totalMentions: m._count._all,
        conversions: conv,
        conversionRate: m._count._all > 0 ? Number(((conv / m._count._all) * 100).toFixed(1)) : 0,
      };
    });
  }

  // ── Créer un brouillon de commande depuis une conversation ────────────────────

  @Post('contacts/:id/create-draft-order')
  async createDraftOrder(
    @Param('id') contactId: string,
    @CurrentUser() user: AuthUser,
  ) {
    const businessId = this.biz(user);
    const contact = await this.prisma.whatsAppContact.findFirst({
      where: { id: contactId, userId: user.ownerId, businessId },
    });
    if (!contact) throw new NotFoundException('Contact introuvable');

    // Get conversation history from in-memory cache
    const history = this.wa.getCacheForContact(user.ownerId, businessId, contact.phone);

    // Load catalog then extract order details with AI
    const products = await this.prisma.product.findMany({
      where: { userId: user.ownerId, businessId },
      select: { id: true, name: true, sellingPrice: true },
    });

    const details = await this.ai.extractOrderDetails(history, products);

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
      const cp = products.find(p => p.id === matchedProductId);
      if (cp) unitPrice = cp.sellingPrice ?? 0;
    }

    const bizId = businessId ?? user.ownerId;
    // MAX+1, not count+1 — a deleted order would otherwise hand out a number already taken
    const agg = await this.prisma.manualOrder.aggregate({
      _max: { orderNumber: true },
      where: { userId: user.ownerId, businessId: bizId },
    });
    const nextOrderNumber = (agg._max.orderNumber ?? 0) + 1;

    const qty = details.productQuantity ?? 1;
    const totalAmount = matchedProductId ? qty * unitPrice : unitPrice;

    const order = await this.prisma.manualOrder.create({
      data: {
        userId: user.ownerId,
        businessId: bizId,
        orderNumber: nextOrderNumber,
        customerName: contact.leadName ?? contact.displayName ?? 'Client WhatsApp',
        customerPhone: contact.phone ?? null,
        city: details.city ?? contact.leadCity ?? '',
        address: details.address ?? '',
        deliveryFee: details.deliveryFeeCdf ?? 0,
        totalAmount,
        isDraft: true,
        sourceContactId: contactId,
        notes: null,
        items: matchedProductId ? {
          create: [{ productId: matchedProductId, quantity: qty, unitPrice }],
        } : undefined,
      },
      include: { items: { include: { product: true } }, partner: true, location: true },
    });

    // Mark contact mentions as converted
    await this.prisma.whatsAppProductMention.updateMany({
      where: { contactId, isConverted: false },
      data: { isConverted: true },
    }).catch(() => {});

    return order;
  }
}
