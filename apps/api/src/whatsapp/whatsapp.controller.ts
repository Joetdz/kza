import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
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
import { IsOptional, IsString } from 'class-validator';

class CreateNoteDto {
  @IsString() content: string;
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

  // ── Contacts ─────────────────────────────────────────────────────────────────

  @Get('contacts')
  async getContacts(
    @CurrentUser() user: AuthUser,
    @Query('filter') filter?: string,
    @Query('search') search?: string,
    @Query('tag') tagId?: string,
  ) {
    const where: any = { userId: user.id };

    if (filter === 'unread') where.isRead = false;
    else if (filter === 'assigned') where.assignedAgent = { not: null };
    else if (filter === 'unassigned') where.assignedAgent = null;
    else if (filter === 'hot') where.leadStatus = 'hot';
    else if (filter === 'archived') where.isArchived = true;
    else where.isArchived = false;

    if (search) {
      where.OR = [
        { displayName: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
        { leadName: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (tagId) {
      where.tags = { some: { tagId } };
    }

    return this.prisma.whatsAppContact.findMany({
      where,
      include: { tags: { include: { tag: true } } },
      orderBy: { lastMessageAt: 'desc' },
    });
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
    const contact = await this.prisma.whatsAppContact.findFirst({ where: { id, userId: user.id } });
    if (!contact) throw new NotFoundException();
    return this.prisma.whatsAppContact.update({ where: { id }, data: dto });
  }

  @Delete('contacts/:id')
  async deleteContact(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    const contact = await this.prisma.whatsAppContact.findFirst({ where: { id, userId: user.id } });
    if (!contact) throw new NotFoundException();
    await this.prisma.whatsAppContact.delete({ where: { id } });
    return { id };
  }

  // ── Messages ─────────────────────────────────────────────────────────────────

  @Get('contacts/:id/messages')
  async getMessages(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    const contact = await this.prisma.whatsAppContact.findFirst({ where: { id, userId: user.id } });
    if (!contact) throw new NotFoundException();
    return this.prisma.whatsAppMessage.findMany({
      where: { contactId: id },
      orderBy: { sentAt: 'asc' },
    });
  }

  @Post('contacts/:id/send')
  async sendMessage(
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
    @CurrentUser() user: AuthUser,
  ) {
    const contact = await this.prisma.whatsAppContact.findFirst({ where: { id, userId: user.id } });
    if (!contact) throw new NotFoundException();
    if (dto.quotedMsgId) {
      await this.wa.sendReply(user.id, contact.phone, dto.message, contact.id, dto.quotedMsgId);
    } else {
      await this.wa.sendMessage(user.id, contact.phone, dto.message, contact.id, false);
    }
    return { ok: true };
  }

  @Patch('contacts/:id/read')
  async markRead(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    const contact = await this.prisma.whatsAppContact.findFirst({ where: { id, userId: user.id } });
    if (!contact) throw new NotFoundException();
    return this.prisma.whatsAppContact.update({ where: { id }, data: { isRead: true } });
  }

  // ── Notes ────────────────────────────────────────────────────────────────────

  @Get('contacts/:id/notes')
  async getNotes(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    const contact = await this.prisma.whatsAppContact.findFirst({ where: { id, userId: user.id } });
    if (!contact) throw new NotFoundException();
    return this.prisma.whatsAppNote.findMany({
      where: { contactId: id },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post('contacts/:id/notes')
  async createNote(
    @Param('id') id: string,
    @Body() dto: CreateNoteDto,
    @CurrentUser() user: AuthUser,
  ) {
    const contact = await this.prisma.whatsAppContact.findFirst({ where: { id, userId: user.id } });
    if (!contact) throw new NotFoundException();
    return this.prisma.whatsAppNote.create({
      data: { contactId: id, userId: user.id, content: dto.content },
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
    const contact = await this.prisma.whatsAppContact.findFirst({ where: { id, userId: user.id } });
    if (!contact) throw new NotFoundException();
    return this.prisma.whatsAppContactTag.upsert({
      where: { contactId_tagId: { contactId: id, tagId } },
      create: { contactId: id, tagId },
      update: {},
    });
  }

  @Delete('contacts/:id/tags/:tagId')
  async removeTagFromContact(
    @Param('id') id: string,
    @Param('tagId') tagId: string,
    @CurrentUser() user: AuthUser,
  ) {
    const contact = await this.prisma.whatsAppContact.findFirst({ where: { id, userId: user.id } });
    if (!contact) throw new NotFoundException();
    await this.prisma.whatsAppContactTag.delete({
      where: { contactId_tagId: { contactId: id, tagId } },
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
}
