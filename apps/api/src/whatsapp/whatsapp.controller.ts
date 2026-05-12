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
import { IsOptional, IsString, IsPhoneNumber } from 'class-validator';

class CreateNoteDto {
  @IsString() content: string;
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
  private async resolveContact(id: string, userId: string) {
    if (id.includes('@')) {
      // id is a phone number — upsert the contact record
      return this.prisma.whatsAppContact.upsert({
        where: { userId_phone: { userId, phone: id } },
        create: { userId, phone: id },
        update: {},
        include: { tags: { include: { tag: true } } },
      });
    }
    const contact = await this.prisma.whatsAppContact.findFirst({
      where: { id, userId },
      include: { tags: { include: { tag: true } } },
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
    this.wa.syncContactDirectory(userId).catch(() => {});
    return { ok: true, userId };
  }

  // ── Connexion ────────────────────────────────────────────────────────────────

  @Get('status')
  getStatus(@CurrentUser() user: AuthUser) {
    return this.wa.getStatus(user.id);
  }

  @Post('connect')
  async connect(@CurrentUser() user: AuthUser) {
    await this.wa.connect(user.id);
    return { message: 'Connexion initialisée' };
  }

  @Post('disconnect')
  async disconnect(@CurrentUser() user: AuthUser) {
    await this.wa.disconnect(user.id);
    return { message: 'Déconnecté' };
  }

  @Post('connect-pairing')
  async connectPairing(@CurrentUser() user: AuthUser, @Body() dto: ConnectPairingDto) {
    await this.wa.connectWithPairingCode(user.id, dto.phone);
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
    return this.wa.getContacts(user.id, filter, search, tagId);
  }

  @Get('contacts/:id')
  async getContact(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    const contact = await this.prisma.whatsAppContact.findFirst({
      where: { id, userId: user.id },
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
    const contact = await this.resolveContact(id, user.id);
    return this.prisma.whatsAppContact.update({ where: { id: contact.id }, data: dto });
  }

  @Delete('contacts/:id')
  async deleteContact(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    const contact = await this.resolveContact(id, user.id);
    await this.prisma.whatsAppContact.delete({ where: { id: contact.id } });
    return { id: contact.id };
  }

  // ── Messages ─────────────────────────────────────────────────────────────────

  @Get('contacts/:id/messages')
  getMessages(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.wa.getMessages(user.id, id);
  }

  @Post('contacts/:id/send')
  async sendMessage(
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
    @CurrentUser() user: AuthUser,
  ) {
    const contact = await this.resolveContact(id, user.id);
    if (dto.quotedMsgId) {
      await this.wa.sendReply(user.id, contact.phone, dto.message, contact.id, dto.quotedMsgId);
    } else {
      await this.wa.sendMessage(user.id, contact.phone, dto.message, contact.id, false);
    }
    return { ok: true };
  }

  @Post('contacts/:id/label')
  async applyLabel(
    @Param('id') id: string,
    @Body() body: { label: string },
    @CurrentUser() user: AuthUser,
  ) {
    const contact = await this.resolveContact(id, user.id);
    const applied = await this.wa.applyLabelToChat(user.id, contact.phone, body.label);
    return { ok: applied };
  }

  @Patch('contacts/:id/read')
  async markRead(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    const contact = await this.resolveContact(id, user.id);
    await this.wa.markRead(user.id, contact.phone);
    return { ok: true };
  }

  // ── Notes ────────────────────────────────────────────────────────────────────

  @Get('contacts/:id/notes')
  async getNotes(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    const contact = await this.resolveContact(id, user.id);
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
    const contact = await this.resolveContact(id, user.id);
    return this.prisma.whatsAppNote.create({
      data: { contactId: contact.id, userId: user.id, content: dto.content },
    });
  }

  @Delete('notes/:noteId')
  async deleteNote(@Param('noteId') noteId: string, @CurrentUser() user: AuthUser) {
    await this.prisma.whatsAppNote.deleteMany({ where: { id: noteId, userId: user.id } });
    return { id: noteId };
  }

  // ── Tags ─────────────────────────────────────────────────────────────────────

  @Get('tags')
  getTags(@CurrentUser() user: AuthUser) {
    return this.prisma.whatsAppTag.findMany({
      where: { userId: user.id },
      orderBy: { name: 'asc' },
    });
  }

  @Post('tags')
  createTag(@Body() dto: CreateTagDto, @CurrentUser() user: AuthUser) {
    return this.prisma.whatsAppTag.create({
      data: { userId: user.id, name: dto.name, color: dto.color ?? '#6366f1' },
    });
  }

  @Delete('tags/:tagId')
  async deleteTag(@Param('tagId') tagId: string, @CurrentUser() user: AuthUser) {
    await this.prisma.whatsAppTag.deleteMany({ where: { id: tagId, userId: user.id } });
    return { id: tagId };
  }

  @Post('contacts/:id/tags/:tagId')
  async addTagToContact(
    @Param('id') id: string,
    @Param('tagId') tagId: string,
    @CurrentUser() user: AuthUser,
  ) {
    const contact = await this.resolveContact(id, user.id);
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
    const contact = await this.resolveContact(id, user.id);
    await this.prisma.whatsAppContactTag.delete({
      where: { contactId_tagId: { contactId: contact.id, tagId } },
    });
    return { ok: true };
  }

  // ── Config IA ────────────────────────────────────────────────────────────────

  @Get('ai-config')
  getAiConfig(@CurrentUser() user: AuthUser) {
    return this.prisma.whatsAppAIConfig.upsert({
      where: { userId: user.id },
      create: { userId: user.id },
      update: {},
    });
  }

  @Patch('ai-config')
  updateAiConfig(@Body() dto: AiConfigDto, @CurrentUser() user: AuthUser) {
    return this.prisma.whatsAppAIConfig.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...dto },
      update: dto,
    });
  }

  // ── Base de connaissance ──────────────────────────────────────────────────────

  @Get('kb')
  getKb(@CurrentUser() user: AuthUser) {
    return this.prisma.whatsAppKBEntry.findMany({
      where: { userId: user.id },
      orderBy: [{ category: 'asc' }, { title: 'asc' }],
    });
  }

  @Post('kb')
  createKb(@Body() dto: KbEntryDto, @CurrentUser() user: AuthUser) {
    return this.prisma.whatsAppKBEntry.create({
      data: { userId: user.id, ...dto, tags: dto.tags ?? [] },
    });
  }

  @Patch('kb/:id')
  async updateKb(
    @Param('id') id: string,
    @Body() dto: UpdateKbEntryDto,
    @CurrentUser() user: AuthUser,
  ) {
    const entry = await this.prisma.whatsAppKBEntry.findFirst({ where: { id, userId: user.id } });
    if (!entry) throw new NotFoundException();
    return this.prisma.whatsAppKBEntry.update({ where: { id }, data: dto });
  }

  @Delete('kb/:id')
  async deleteKb(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    const entry = await this.prisma.whatsAppKBEntry.findFirst({ where: { id, userId: user.id } });
    if (!entry) throw new NotFoundException();
    await this.prisma.whatsAppKBEntry.delete({ where: { id } });
    return { id };
  }

  // ── Automatisations ──────────────────────────────────────────────────────────

  @Get('automations')
  getAutomations(@CurrentUser() user: AuthUser) {
    return this.prisma.whatsAppAutomation.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post('automations')
  createAutomation(@Body() dto: AutomationDto, @CurrentUser() user: AuthUser) {
    return this.prisma.whatsAppAutomation.create({
      data: { userId: user.id, ...dto },
    });
  }

  @Patch('automations/:id')
  async updateAutomation(
    @Param('id') id: string,
    @Body() dto: UpdateAutomationDto,
    @CurrentUser() user: AuthUser,
  ) {
    const auto = await this.prisma.whatsAppAutomation.findFirst({ where: { id, userId: user.id } });
    if (!auto) throw new NotFoundException();
    return this.prisma.whatsAppAutomation.update({ where: { id }, data: dto });
  }

  @Delete('automations/:id')
  async deleteAutomation(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    const auto = await this.prisma.whatsAppAutomation.findFirst({ where: { id, userId: user.id } });
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
    const where: any = { clientId: user.id };
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
    this.wa.syncContactDirectory(user.id).catch(() => {});
    return { message: 'Sync démarrée' };
  }

  @Get('audience/stats')
  async getAudienceStats(@CurrentUser() user: AuthUser) {
    const [total, active, consented] = await Promise.all([
      this.prisma.waCampaignContact.count({ where: { clientId: user.id } }),
      this.prisma.waCampaignContact.count({ where: { clientId: user.id, contactStatus: 'active' } }),
      this.prisma.waCampaignContact.count({ where: { clientId: user.id, consentStatus: 'granted' } }),
    ]);
    // Collect all unique segments
    const contacts = await this.prisma.waCampaignContact.findMany({
      where: { clientId: user.id },
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
    const contact = await this.prisma.waCampaignContact.findFirst({ where: { id, clientId: user.id } });
    if (!contact) throw new NotFoundException();
    return this.prisma.waCampaignContact.update({ where: { id }, data: dto });
  }

  // ── Profil utilisateur ────────────────────────────────────────────────────────

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
}
