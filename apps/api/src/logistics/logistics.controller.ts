import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { FollowUpService } from './followup.service';
import { join } from 'path';

@Controller()
export class LogisticsController {
  private readonly logger = new Logger(LogisticsController.name);

  constructor(
    private prisma: PrismaService,
    private whatsapp: WhatsAppService,
    private followUp: FollowUpService,
  ) {}

  private where(user: AuthUser) {
    return user.businessId ? { businessId: user.businessId } : { userId: user.id };
  }

  private fmt(n: number, decimals = 0) {
    return Number(n).toLocaleString('fr-FR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }

  private fmtDate(d: Date | string | null | undefined) {
    if (!d) return null;
    const dt = new Date(d);
    return dt.toLocaleDateString('fr-FR', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })
      + ' à ' + dt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  // ── Emplacements ──────────────────────────────────────────────

  @Get('my/logistics/locations')
  getLocations(@CurrentUser() user: AuthUser) {
    return this.prisma.stockLocation.findMany({
      where: this.where(user),
      include: { partner: true, stocks: { include: { product: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  @Post('my/logistics/locations')
  createLocation(@CurrentUser() user: AuthUser, @Body() body: { name: string; city: string; address?: string; type?: string }) {
    return this.prisma.stockLocation.create({
      data: {
        userId: user.id,
        businessId: user.businessId ?? user.id,
        name: body.name,
        city: body.city,
        address: body.address,
        type: body.type ?? 'OWN',
      },
    });
  }

  @Patch('my/logistics/locations/:id')
  updateLocation(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { name?: string; city?: string; address?: string }) {
    return this.prisma.stockLocation.updateMany({
      where: { id, ...this.where(user) },
      data: body,
    });
  }

  @Delete('my/logistics/locations/:id')
  deleteLocation(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.prisma.stockLocation.deleteMany({ where: { id, ...this.where(user) } });
  }

  // ── Stock par emplacement ─────────────────────────────────────

  @Get('my/logistics/locations/:id/stock')
  getLocationStock(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.prisma.locationStock.findMany({
      where: { locationId: id },
      include: { product: true },
    });
  }

  @Post('my/logistics/locations/:id/stock')
  async setLocationStock(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { productId: string; quantity: number },
  ) {
    return this.prisma.locationStock.upsert({
      where: { locationId_productId: { locationId: id, productId: body.productId } },
      create: { locationId: id, productId: body.productId, quantity: body.quantity },
      update: { quantity: body.quantity },
      include: { product: true },
    });
  }

  @Get('my/logistics/products/:productId/allocations')
  getProductAllocations(@CurrentUser() user: AuthUser, @Param('productId') productId: string) {
    return this.prisma.locationStock.findMany({
      where: { productId },
      include: { location: true, product: true },
    });
  }

  // ── Partenaires ───────────────────────────────────────────────

  @Get('my/logistics/partners')
  getPartners(@CurrentUser() user: AuthUser) {
    return this.prisma.deliveryPartner.findMany({
      where: this.where(user),
      include: { location: { include: { stocks: { include: { product: true } } } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  @Post('my/logistics/partners')
  async createPartner(
    @CurrentUser() user: AuthUser,
    @Body() body: { name: string; phone?: string; city?: string; type?: string },
  ) {
    const partner = await this.prisma.deliveryPartner.create({
      data: {
        userId: user.id,
        businessId: user.businessId ?? user.id,
        name: body.name,
        phone: body.phone,
        city: body.city,
        type: body.type ?? 'COMPANY',
      },
    });
    await this.prisma.stockLocation.create({
      data: {
        userId: user.id,
        businessId: user.businessId ?? user.id,
        name: body.name,
        city: body.city ?? '',
        type: 'PARTNER',
        partnerId: partner.id,
      },
    });
    return this.prisma.deliveryPartner.findUnique({
      where: { id: partner.id },
      include: { location: { include: { stocks: { include: { product: true } } } } },
    });
  }

  @Patch('my/logistics/partners/:id')
  updatePartner(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { name?: string; phone?: string; city?: string; type?: string }) {
    return this.prisma.deliveryPartner.updateMany({
      where: { id, ...this.where(user) },
      data: body,
    });
  }

  @Patch('my/logistics/partners/:id/reset-pin')
  resetPartnerPin(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.prisma.deliveryPartner.updateMany({
      where: { id, ...this.where(user) },
      data: { pin: null },
    });
  }

  @Delete('my/logistics/partners/:id')
  async deletePartner(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.prisma.stockLocation.deleteMany({ where: { partnerId: id, ...this.where(user) } });
    return this.prisma.deliveryPartner.deleteMany({ where: { id, ...this.where(user) } });
  }

  // ── Rapport partenaire ────────────────────────────────────────

  @Get('my/logistics/partners/:id/report')
  async getPartnerReport(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('period') period: 'daily' | 'weekly' | 'monthly' = 'monthly',
  ) {
    const partner = await this.prisma.deliveryPartner.findFirst({
      where: { id, ...this.where(user) },
      include: { location: { include: { stocks: { include: { product: true } } } } },
    });
    if (!partner) return null;

    const now = new Date();
    const from = new Date(now);
    if (period === 'daily') from.setHours(0, 0, 0, 0);
    else if (period === 'weekly') from.setDate(from.getDate() - 7);
    else from.setDate(from.getDate() - 30);

    const orders = await this.prisma.manualOrder.findMany({
      where: { partnerId: id, ...this.where(user), createdAt: { gte: from } },
      include: { items: { include: { product: true } }, location: true },
      orderBy: { createdAt: 'desc' },
    });

    const ordersByStatus: Record<string, number> = {};
    for (const o of orders) {
      ordersByStatus[o.status] = (ordersByStatus[o.status] ?? 0) + 1;
    }

    return { partner, locationStock: partner.location?.stocks ?? [], ordersByStatus, totalOrders: orders.length, orders, period, from: from.toISOString(), to: now.toISOString() };
  }

  // ── Commandes manuelles ───────────────────────────────────────

  @Get('my/logistics/orders')
  getOrders(@CurrentUser() user: AuthUser) {
    return this.prisma.manualOrder.findMany({
      where: this.where(user),
      include: { items: { include: { product: true } }, partner: true, location: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post('my/logistics/orders')
  async createOrder(
    @CurrentUser() user: AuthUser,
    @Body() body: {
      customerName: string;
      customerPhone?: string;
      city: string;
      address: string;
      deliveryFee: number;
      notes?: string;
      partnerId?: string;
      locationId?: string;
      scheduledAt?: string;
      items: { productId: string; quantity: number; unitPrice: number }[];
    },
  ) {
    // totalAmount = produits en $ uniquement — les frais de livraison (FC) appartiennent au partenaire
    const totalAmount = body.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);

    const bizWhere = this.where(user);
    const orderCount = await this.prisma.manualOrder.count({ where: bizWhere });
    const orderNumber = orderCount + 1;

    const order = await this.prisma.manualOrder.create({
      data: {
        userId: user.id,
        businessId: user.businessId ?? user.id,
        orderNumber,
        customerName: body.customerName,
        customerPhone: body.customerPhone,
        city: body.city,
        address: body.address,
        deliveryFee: body.deliveryFee ?? 0,
        totalAmount,
        notes: body.notes,
        partnerId: body.partnerId || null,
        locationId: body.locationId || null,
        scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
        items: {
          create: body.items.map(i => ({ productId: i.productId, quantity: i.quantity, unitPrice: i.unitPrice })),
        },
      },
      include: { items: { include: { product: true } }, partner: true, location: true },
    });

    // Stock is decremented only when the order is marked "delivered" — not at creation.
    return order;
  }

  @Patch('my/logistics/orders/:id/reschedule')
  async rescheduleOrder(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { scheduledAt: string | null },
  ) {
    return this.prisma.manualOrder.updateMany({
      where: { id, ...this.where(user) },
      data: { scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null },
    });
  }

  @Patch('my/logistics/orders/:id/status')
  async updateOrderStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { status: string; deliveryPersonName?: string; partnerId?: string; collectedUsd?: number; collectedCdf?: number },
  ) {
    const order = await this.prisma.manualOrder.findFirst({
      where: { id, ...this.where(user) },
      include: { items: { include: { product: true } }, partner: { include: { location: true } } },
    });
    if (!order) return null;

    // Count today's dispatches for this partner using dispatchedAt (reliable, set once at dispatch)
    let deliveryNum: number | null = null;
    // Effective partnerId: from body (new assignment) or existing on order
    const effectivePartnerId = body.partnerId ?? order.partnerId;
    const isNewDispatch = body.status === 'dispatched' && order.status !== 'dispatched' && effectivePartnerId;
    const isUnassign = body.status === 'pending' && order.status === 'dispatched';

    if (isNewDispatch) {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayCount = await this.prisma.manualOrder.count({
        where: {
          id: { not: id },
          partnerId: effectivePartnerId!,
          dispatchedAt: { gte: todayStart },
        },
      });
      deliveryNum = todayCount + 1;
    }

    const updated = await this.prisma.manualOrder.update({
      where: { id },
      data: {
        status: body.status,
        ...(body.partnerId ? { partnerId: body.partnerId } : {}),
        ...(isNewDispatch ? { dispatchedAt: new Date() } : {}),
        ...(isUnassign ? { dispatchedAt: null, partnerId: null } : {}),
        ...(body.deliveryPersonName ? { deliveryPersonName: body.deliveryPersonName } : {}),
        ...(body.status === 'delivered' && body.collectedUsd != null ? { collectedUsd: body.collectedUsd } : {}),
        ...(body.status === 'delivered' && body.collectedCdf != null ? { collectedCdf: body.collectedCdf } : {}),
      },
    });

    // Auto-send WA when dispatched to a partner
    if (isNewDispatch && deliveryNum !== null) {
      // If partnerId changed, reload partner from DB
      const partner = body.partnerId
        ? await this.prisma.deliveryPartner.findUnique({ where: { id: body.partnerId } })
        : (order.partner as any);
      const destination = (partner as any)?.whatsappGroupId ?? (partner as any)?.phone ?? null;

      this.logger.log(`[dispatch] order=${id} partner=${effectivePartnerId} destination=${destination ?? 'NONE'} deliveryNum=${deliveryNum}`);

      if (!destination) {
        this.logger.warn(`[dispatch] partner has no whatsappGroupId and no phone — skipping WA`);
      } else {
        const numStr = String(deliveryNum).padStart(2, '0');
        const now = new Date();
        const dayLabel = now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
        const num = String(order.orderNumber).padStart(4, '0');

        // Text lines without image URLs (images sent separately as files)
        const lines = (order.items as any[]).map((i: any) => {
          const price = `$${Number(i.unitPrice).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          return `• ${i.product?.name ?? 'Produit'} × ${i.quantity} — ${price}`;
        }).join('\n');

        const portalBase = (process.env.FRONTEND_URL ?? 'http://localhost:5173').replace(/\/$/, '');
        const portalLink = `${portalBase}/#/partenaire/${partner.token}`;

        const scheduledLine = order.scheduledAt
          ? `📅 Livraison prévue : ${new Date(order.scheduledAt).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
          : null;

        const msg = [
          `🚚 *Livraison ${numStr} du ${dayLabel}* (Cmd #${num})`,
          ``,
          `👤 Client : ${order.customerName}${order.customerPhone ? ` (${order.customerPhone})` : ''}`,
          `📍 Adresse : ${order.city} — ${order.address}`,
          scheduledLine,
          ``,
          `📦 Produits :`,
          lines,
          ``,
          `💰 Total : $${Number(order.totalAmount).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          `🛵 Livraison : ${Number(order.deliveryFee).toLocaleString('fr-FR')} FC`,
          order.notes ? `📝 Notes : ${order.notes}` : null,
          ``,
          `👉 Gérer cette commande :`,
          portalLink,
        ].filter(l => l !== null).join('\n');

        // First product image as the WA image (single message = image + caption)
        const uploadsRoot = join(process.cwd(), 'uploads');
        const firstWithImage = (order.items as any[]).find((i: any) => i.product?.imageUrl);
        const imagePath = firstWithImage
          ? join(uploadsRoot, (firstWithImage.product.imageUrl as string).replace(/^\/uploads\//, ''))
          : undefined;

        this.whatsapp.notifyOrder(order.userId, destination, msg, imagePath)
          .then(sent => this.logger.log(`[dispatch] WA sent=${sent} for order=${id}`))
          .catch(err => this.logger.warn(`[dispatch] WA error: ${err?.message}`));
      }
    }

    if (body.status === 'delivered' && order.status !== 'delivered') {
      // Decrement product stock + create movement when delivered (not at order creation)
      const today = new Date().toISOString().split('T')[0];
      for (const item of order.items) {
        await Promise.all([
          this.prisma.stockMovement.create({
            data: {
              userId: order.userId,
              businessId: order.businessId ?? null,
              productId: item.productId,
              type: 'out',
              quantity: item.quantity,
              reason: `Commande #${order.orderNumber.toString().padStart(4, '0')} livrée`,
              date: new Date(today),
            },
          }),
          this.prisma.product.update({
            where: { id: item.productId },
            data: { quantity: { decrement: item.quantity } },
          }),
        ]).catch(() => {});
      }

      // Decrement location stock — use order's locationId or fall back to partner's location
      const locationId = order.locationId ?? (order.partner as any)?.location?.id ?? null;
      if (locationId) {
        for (const item of order.items) {
          await this.prisma.locationStock.updateMany({
            where: { locationId, productId: item.productId },
            data: { quantity: { decrement: item.quantity } },
          });
        }
      }

      // Auto-create sale
      await this.prisma.sale.create({
        data: {
          channel: 'logistics',
          date: new Date(),
          note: `Logistique #${String(order.orderNumber).padStart(4, '0')} — ${order.customerName} | Livraison: ${Number(order.deliveryFee).toLocaleString('fr-FR')} FC (partenaire)`,
          status: 'paid',
          customerName: order.customerName,
          customerPhone: order.customerPhone ?? null,
          userId: order.userId,
          businessId: order.businessId ?? null,
          items: {
            create: order.items.map(i => ({
              productId: i.productId,
              quantity: i.quantity,
              unitPrice: Number(i.unitPrice),
            })),
          },
        },
      });
    }

    return updated;
  }

  @Post('my/logistics/orders/:id/notify-partner')
  async notifyPartner(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const order = await this.prisma.manualOrder.findFirst({
      where: { id, ...this.where(user) },
      include: { items: { include: { product: true } }, partner: true, location: true },
    });
    if (!order || (!order.partner?.phone && !order.partner?.whatsappGroupId)) return { sent: false, reason: 'no_destination' };
    // Send to group if configured, otherwise to individual phone
    const destination = (order.partner as any).whatsappGroupId ?? order.partner!.phone;

    const num = String(order.orderNumber).padStart(4, '0');
    const lines = order.items.map(i =>
      `• ${i.product.name} × ${i.quantity} — $${this.fmt(Number(i.unitPrice), 2)}`
    ).join('\n');

    const scheduledLine = order.scheduledAt
      ? `📅 Livraison prévue : ${this.fmtDate(order.scheduledAt)}`
      : null;

    const msg = [
      `🚚 *Commande #${num}*`,
      `👤 Client : ${order.customerName}${order.customerPhone ? ` (${order.customerPhone})` : ''}`,
      `📍 Adresse : ${order.city} — ${order.address}`,
      scheduledLine,
      ``,
      `📦 Produits :`,
      lines,
      ``,
      `💰 Total : $${this.fmt(Number(order.totalAmount), 2)}`,
      `🛵 Livraison : ${this.fmt(Number(order.deliveryFee))} FC`,
      order.location ? `📦 Stock source : ${order.location.name}` : null,
      order.notes ? `📝 Notes : ${order.notes}` : null,
    ].filter(l => l !== null).join('\n');

    const uploadsRoot = join(process.cwd(), 'uploads');
    const firstWithImage = (order.items as any[]).find((i: any) => i.product?.imageUrl);
    const imagePath = firstWithImage
      ? join(uploadsRoot, (firstWithImage.product.imageUrl as string).replace(/^\/uploads\//, ''))
      : undefined;

    const sent = await this.whatsapp.notifyOrder(user.id, destination, msg, imagePath);
    return { sent };
  }

  @Delete('my/logistics/orders/:id')
  deleteOrder(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.prisma.manualOrder.deleteMany({ where: { id, ...this.where(user) } });
  }

  // ── Follow-up automatique ──────────────────────────────────────────────────

  @Get('my/logistics/followup/config')
  getFollowUpConfig(@CurrentUser() user: AuthUser) {
    return this.followUp.getConfig(user.id);
  }

  @Patch('my/logistics/followup/config')
  updateFollowUpConfig(@CurrentUser() user: AuthUser, @Body() body: {
    relanceEnabled?: boolean;
    relanceDelayH?: number;
    relanceTemplate?: string;
    loyaltyEnabled?: boolean;
    loyaltyDelayH?: number;
    loyaltyTemplate?: string;
  }) {
    return this.followUp.updateConfig(user.id, body);
  }

  @Get('my/logistics/followup/history')
  getFollowUpHistory(@CurrentUser() user: AuthUser, @Query('limit') limit?: string) {
    return this.followUp.getHistory(user.id, limit ? parseInt(limit, 10) : 50);
  }

  @Get('my/logistics/followup/preview-relance')
  previewRelance(@CurrentUser() user: AuthUser) {
    return this.followUp.previewRelance(user.id);
  }

  @Get('my/logistics/followup/preview-loyalty')
  previewLoyalty(@CurrentUser() user: AuthUser) {
    return this.followUp.previewLoyalty(user.id);
  }

  @Post('my/logistics/followup/trigger-relance')
  async triggerRelance(@CurrentUser() user: AuthUser) {
    const sent = await this.followUp.triggerRelance(user.id);
    return { sent };
  }

  @Post('my/logistics/followup/trigger-loyalty')
  async triggerLoyalty(@CurrentUser() user: AuthUser) {
    const sent = await this.followUp.triggerLoyalty(user.id);
    return { sent };
  }

  // ── Brouillons (drafts) ────────────────────────────────────────────────────────

  @Patch('my/logistics/orders/:id/edit-draft')
  async editDraft(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: {
      customerName?: string;
      customerPhone?: string;
      city?: string;
      address?: string;
      deliveryFee?: number;
      notes?: string;
      partnerId?: string;
      items?: { productId: string; quantity: number; unitPrice: number }[];
    },
  ) {
    const order = await this.prisma.manualOrder.findFirst({ where: { id, ...this.where(user), isDraft: true } });
    if (!order) throw new Error('Brouillon introuvable');

    const totalAmount = body.items
      ? body.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
      : Number(order.totalAmount);

    const updated = await this.prisma.manualOrder.update({
      where: { id },
      data: {
        ...(body.customerName !== undefined && { customerName: body.customerName }),
        ...(body.customerPhone !== undefined && { customerPhone: body.customerPhone }),
        ...(body.city !== undefined && { city: body.city }),
        ...(body.address !== undefined && { address: body.address }),
        ...(body.deliveryFee !== undefined && { deliveryFee: body.deliveryFee }),
        ...(body.notes !== undefined && { notes: body.notes }),
        ...(body.partnerId !== undefined && { partnerId: body.partnerId || null }),
        totalAmount,
        ...(body.items && {
          items: {
            deleteMany: {},
            create: body.items.map(i => ({ productId: i.productId, quantity: i.quantity, unitPrice: i.unitPrice })),
          },
        }),
      },
      include: { items: { include: { product: true } }, partner: true, location: true },
    });

    return updated;
  }

  @Post('my/logistics/orders/:id/confirm-draft')
  async confirmDraft(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const order = await this.prisma.manualOrder.findFirst({
      where: { id, ...this.where(user), isDraft: true },
      include: { items: true },
    });
    if (!order) throw new Error('Brouillon introuvable');

    // Stock is decremented only when the order is marked "delivered" — not at confirmation.
    const confirmed = await this.prisma.manualOrder.update({
      where: { id },
      data: { isDraft: false, status: 'pending' },
      include: { items: { include: { product: true } }, partner: true, location: true },
    });

    return confirmed;
  }

  // ── Versements (admin) ────────────────────────────────────────────

  @Get('my/logistics/payments')
  async getPayments(@CurrentUser() user: AuthUser, @Query('status') status?: string) {
    return this.prisma.partnerPayment.findMany({
      where: {
        partner: { userId: user.id },
        ...(status ? { status } : {}),
      },
      include: { partner: { select: { id: true, name: true, city: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Patch('my/logistics/payments/:id/confirm')
  async confirmPayment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { notes?: string },
  ) {
    const payment = await this.prisma.partnerPayment.findFirst({
      where: { id, partner: { userId: user.id } },
    });
    if (!payment) return null;
    return this.prisma.partnerPayment.update({
      where: { id },
      data: { status: 'confirmed', confirmedAt: new Date(), notes: body.notes ?? payment.notes },
    });
  }

  @Patch('my/logistics/payments/:id/reject')
  async rejectPayment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { notes?: string },
  ) {
    const payment = await this.prisma.partnerPayment.findFirst({
      where: { id, partner: { userId: user.id } },
    });
    if (!payment) return null;
    return this.prisma.partnerPayment.update({
      where: { id },
      data: { status: 'rejected', notes: body.notes ?? payment.notes },
    });
  }

  // ── Rapport journalier ────────────────────────────────────────────

  @Get('my/logistics/partners/:id/daily-report')
  async getDailyReport(
    @CurrentUser() user: AuthUser,
    @Param('id') partnerId: string,
    @Query('date') dateStr: string,
  ) {
    const date = dateStr ? new Date(dateStr) : new Date();
    const start = new Date(date); start.setHours(0, 0, 0, 0);
    const end   = new Date(date); end.setHours(23, 59, 59, 999);

    const partner = await this.prisma.deliveryPartner.findFirst({
      where: { id: partnerId, userId: user.id },
      include: { location: { include: { stocks: { include: { product: true } } } } },
    });
    if (!partner) return null;

    // Orders dispatched (or created) on this day for this partner
    const orders = await this.prisma.manualOrder.findMany({
      where: {
        partnerId,
        ...this.where(user),
        OR: [
          { dispatchedAt: { gte: start, lte: end } },
          { dispatchedAt: null, createdAt: { gte: start, lte: end } },
        ],
      },
      include: { items: { include: { product: true } }, agent: true },
      orderBy: { dispatchedAt: 'asc' },
    });

    const delivered = orders.filter(o => o.status === 'delivered');
    const failed    = orders.filter(o => ['returned', 'fake'].includes(o.status));
    const cancelled = orders.filter(o => o.status === 'cancelled');
    const pending   = orders.filter(o => !['delivered','returned','fake','cancelled'].includes(o.status));

    const totalCollectedUsd  = delivered.reduce((s, o) => s + Number((o as any).collectedUsd ?? o.totalAmount), 0);
    const totalCollectedCdf  = delivered.reduce((s, o) => s + Number((o as any).collectedCdf ?? 0), 0);
    const totalDeliveryFees  = delivered.reduce((s, o) => s + Number(o.deliveryFee), 0);

    // Cumulative solde (all delivered orders up to end of this day for this partner)
    const allDelivered = await this.prisma.manualOrder.findMany({
      where: {
        partnerId,
        ...this.where(user),
        status: 'delivered',
        OR: [
          { dispatchedAt: { lte: end } },
          { dispatchedAt: null, createdAt: { lte: end } },
        ],
      },
      select: { totalAmount: true, deliveryFee: true, collectedUsd: true, collectedCdf: true },
    });
    const cumulUsd = allDelivered.reduce((s, o) => s + Number((o as any).collectedUsd ?? o.totalAmount), 0);
    const cumulCdf = allDelivered.reduce((s, o) => s + Number((o as any).collectedCdf ?? 0) - Number(o.deliveryFee), 0);

    // Stock report
    const locationStocks = (partner as any).location?.stocks ?? [];
    const deliveredItemsMap: Record<string, number> = {};
    for (const o of delivered) {
      for (const item of (o as any).items) {
        deliveredItemsMap[item.productId] = (deliveredItemsMap[item.productId] ?? 0) + item.quantity;
      }
    }
    const stock = locationStocks.map((s: any) => {
      const deliveredQty = deliveredItemsMap[s.productId] ?? 0;
      return {
        productName: s.product.name,
        stockStart:  s.quantity + deliveredQty,
        delivered:   deliveredQty,
        entries:     0,
        stockCurrent: s.quantity,
      };
    });

    return {
      date: dateStr,
      partner: { id: partner.id, name: partner.name, city: partner.city },
      orders: orders.map((o, idx) => ({
        num: idx + 1,
        id: o.id,
        orderNumber: o.orderNumber,
        city: o.city,
        address: o.address,
        customerName: o.customerName,
        customerPhone: (o as any).customerPhone,
        agentName: (o as any).agent?.name ?? o.deliveryPersonName ?? null,
        collectedUsd: Number((o as any).collectedUsd ?? 0),
        collectedCdf: Number((o as any).collectedCdf ?? 0),
        totalAmount: Number(o.totalAmount),
        deliveryFee: Number(o.deliveryFee),
        notes: o.notes,
        items: (o as any).items.map((i: any) => ({ name: i.product.name, quantity: i.quantity })),
        status: o.status,
      })),
      summary: {
        total: orders.length,
        delivered: delivered.length,
        failed: failed.length,
        cancelled: cancelled.length,
        pending: pending.length,
        successRate: orders.length > 0 ? Math.round((delivered.length / orders.length) * 100) : 0,
        totalCollectedUsd,
        totalCollectedCdf,
        totalDeliveryFees,
        soldeUsd: totalCollectedUsd,
        soldeCdf: totalCollectedCdf - totalDeliveryFees,
      },
      cumulativeSolde: { soldeUsd: cumulUsd, soldeCdf: cumulCdf },
      stock,
    };
  }
}
