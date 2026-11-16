import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AdminGuard } from './admin.guard';
import { invalidateBusinessAccessCache } from '../auth/jwt-auth.guard';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : undefined);

/**
 * The platform admin's control over every business and every Ikele store: edit them,
 * suspend a business (nothing is deleted, it can be reactivated), take a store off Ikele
 * or offline, remove a video or photo.
 */
@Controller('admin')
@UseGuards(AdminGuard)
export class AdminModerationController {
  constructor(private prisma: PrismaService) {}

  private async findBusiness(id: string) {
    const b = UUID.test(id) ? await this.prisma.business.findUnique({ where: { id } }) : null;
    if (!b) throw new NotFoundException('Business introuvable');
    return b;
  }

  private async findStore(id: string) {
    const s = UUID.test(id) ? await this.prisma.onlineStore.findUnique({ where: { id } }) : null;
    if (!s) throw new NotFoundException('Boutique introuvable');
    return s;
  }

  // ── Businesses ─────────────────────────────────────────────────────────────

  @Patch('businesses/:id')
  async updateBusiness(
    @Param('id') id: string,
    @Body() body: { name?: string; sector?: string | null; city?: string | null; phone?: string | null; whatsappPhone?: string; logoUrl?: string | null },
  ) {
    await this.findBusiness(id);
    const name = text(body.name, 120);
    if (body.name !== undefined && !name) throw new BadRequestException('Le nom est obligatoire.');
    const whatsappPhone = text(body.whatsappPhone, 30);
    if (body.whatsappPhone !== undefined && !whatsappPhone) throw new BadRequestException('Le numéro WhatsApp est obligatoire.');
    return this.prisma.business.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(body.sector !== undefined && { sector: text(body.sector, 60) || null }),
        ...(body.city !== undefined && { city: text(body.city, 80) || null }),
        ...(body.phone !== undefined && { phone: text(body.phone, 30) || null }),
        ...(whatsappPhone !== undefined && { whatsappPhone }),
        ...(body.logoUrl !== undefined && { logoUrl: text(body.logoUrl, 500) || null }),
      },
    });
  }

  /** Closed to its members, its store offline. Nothing is deleted. */
  @Post('businesses/:id/suspend')
  async suspendBusiness(@Param('id') id: string, @Body() body: { reason?: string }) {
    await this.findBusiness(id);
    const reason = text(body.reason, 300) || null;
    const [business] = await this.prisma.$transaction([
      this.prisma.business.update({ where: { id }, data: { suspendedAt: new Date(), suspendedReason: reason } }),
      this.prisma.onlineStore.updateMany({ where: { businessId: id }, data: { active: false } }),
    ]);
    invalidateBusinessAccessCache(id);
    return business;
  }

  /** Open again. Its store stays offline until put back online (by the admin or its owner). */
  @Post('businesses/:id/reactivate')
  async reactivateBusiness(@Param('id') id: string) {
    await this.findBusiness(id);
    const business = await this.prisma.business.update({ where: { id }, data: { suspendedAt: null, suspendedReason: null } });
    invalidateBusinessAccessCache(id);
    return business;
  }

  // ── Ikele stores ───────────────────────────────────────────────────────────

  @Get('stores')
  async stores(@Query('q') q?: string) {
    const query = q?.trim();
    const stores = await this.prisma.onlineStore.findMany({
      where: query ? {
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { slug: { contains: query, mode: 'insensitive' } },
        ],
      } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: {
        id: true, slug: true, name: true, description: true, logoUrl: true, primaryColor: true,
        active: true, ikeleListed: true, businessId: true, userId: true, createdAt: true,
        _count: { select: { products: true, followers: true, orders: true } },
      },
    });
    const businessIds = stores.map(s => s.businessId).filter((v): v is string => !!v);
    const [businesses, mediaCounts, owners] = await Promise.all([
      this.prisma.business.findMany({ where: { id: { in: businessIds } }, select: { id: true, name: true, suspendedAt: true } }),
      this.prisma.$queryRaw<{ store_id: string; n: bigint }[]>`
        SELECT sp.store_id::text, count(DISTINCT pm.id) AS n
        FROM store_products sp JOIN product_media pm ON pm.product_id = sp.product_id
        GROUP BY sp.store_id`,
      this.prisma.$queryRaw<{ id: string; email: string }[]>`SELECT id::text, email FROM auth.users`,
    ]);
    const bizMap = new Map(businesses.map(b => [b.id, b]));
    const mediaMap = new Map(mediaCounts.map(m => [m.store_id, Number(m.n)]));
    const emailMap = new Map(owners.map(o => [o.id, o.email]));
    return stores.map(({ _count, ...s }) => ({
      ...s,
      business: s.businessId ? bizMap.get(s.businessId) ?? null : null,
      ownerEmail: emailMap.get(s.userId) ?? null,
      products: _count.products,
      followers: _count.followers,
      orders: _count.orders,
      media: mediaMap.get(s.id) ?? 0,
    }));
  }

  @Patch('stores/:id')
  async updateStore(
    @Param('id') id: string,
    @Body() body: { name?: string; description?: string | null; logoUrl?: string | null; active?: boolean; ikeleListed?: boolean },
  ) {
    await this.findStore(id);
    const name = text(body.name, 120);
    if (body.name !== undefined && !name) throw new BadRequestException('Le nom est obligatoire.');
    return this.prisma.onlineStore.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(body.description !== undefined && { description: text(body.description, 1000) || null }),
        ...(body.logoUrl !== undefined && { logoUrl: text(body.logoUrl, 500) || null }),
        ...(typeof body.active === 'boolean' && { active: body.active }),
        ...(typeof body.ikeleListed === 'boolean' && { ikeleListed: body.ikeleListed }),
      },
    });
  }

  /** Every video and photo the store shows, the most recent first. */
  @Get('stores/:id/media')
  async storeMedia(@Param('id') id: string) {
    await this.findStore(id);
    const rows = await this.prisma.productMedia.findMany({
      where: { product: { storeItems: { some: { storeId: id } } } },
      orderBy: { createdAt: 'desc' },
      take: 300,
      select: {
        id: true, url: true, type: true, thumbnailUrl: true, caption: true, viewCount: true, likeCount: true, createdAt: true,
        product: { select: { id: true, name: true } },
      },
    });
    return rows;
  }

  /** Removes a video or photo from the platform (its likes go with it). */
  @Delete('media/:id')
  async deleteMedia(@Param('id') id: string) {
    const media = UUID.test(id) ? await this.prisma.productMedia.findUnique({ where: { id }, select: { id: true } }) : null;
    if (!media) throw new NotFoundException('Média introuvable');
    await this.prisma.productMedia.delete({ where: { id } });
    return { id };
  }
}
