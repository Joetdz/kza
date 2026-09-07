import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { IsIn } from 'class-validator';
import { SalesService } from './sales.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { SALE_STATUSES } from '@kza/shared';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.guard';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';

class UpdateSaleStatusDto {
  @IsIn(SALE_STATUSES)
  status: string;
}

@Controller('sales')
@Roles('owner', 'manager')
export class SalesController {
  constructor(
    private readonly service: SalesService,
    private readonly prisma: PrismaService,
    private readonly whatsappService: WhatsAppService,
  ) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser) {
    return this.service.findAll(user.ownerId, user.businessId || undefined);
  }

  @Get('customers/suggest')
  async suggestCustomers(@CurrentUser() user: AuthUser, @Query('q') q: string) {
    if (!q || q.trim().length < 2) return [];
    const bizWhere = user.businessId ? { businessId: user.businessId } : { userId: user.ownerId };
    const waWhere = user.businessId ? { businessId: user.businessId } : { userId: user.ownerId };

    const fromSales = await this.prisma.sale.findMany({
      where: { ...bizWhere, OR: [{ customerName: { contains: q, mode: 'insensitive' } }, { customerPhone: { contains: q } }], NOT: { customerPhone: null } },
      select: { customerName: true, customerPhone: true },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    const fromWa = await this.prisma.whatsAppContact.findMany({
      where: { ...waWhere, OR: [{ displayName: { contains: q, mode: 'insensitive' } }, { leadName: { contains: q, mode: 'insensitive' } }, { phone: { contains: q } }] },
      select: { displayName: true, leadName: true, phone: true },
      take: 10,
    });

    const merged = [
      ...fromSales.map(s => ({ name: s.customerName ?? '', phone: s.customerPhone ?? '' })),
      ...fromWa.map(c => ({ name: c.leadName ?? c.displayName ?? '', phone: c.phone })),
    ];
    const seen = new Set<string>();
    return merged.filter(r => r.phone && !seen.has(r.phone) && seen.add(r.phone)).slice(0, 8);
  }

  @Post()
  create(@Body() dto: CreateSaleDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user.ownerId, user.businessId || undefined);
  }

  @Post(':id/send-invoice')
  async sendInvoice(
    @Param('id') saleId: string,
    @CurrentUser() user: AuthUser,
    @Body() body: { phone: string; pdfBase64: string },
  ) {
    const buffer = Buffer.from(body.pdfBase64, 'base64');
    const shortId = saleId.slice(0, 8).toUpperCase();
    await this.whatsappService.sendDocument(
      user.ownerId,
      user.businessId || null,
      body.phone,
      buffer,
      `Facture-${shortId}.pdf`,
      'application/pdf',
    );
    return { success: true };
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateSaleStatusDto, @CurrentUser() user: AuthUser) {
    return this.service.updateStatus(id, dto.status, user.ownerId, user.businessId || undefined);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.remove(id, user.ownerId, user.businessId || undefined);
  }
}
