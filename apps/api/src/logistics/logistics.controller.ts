import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { WhatsAppService } from '../whatsapp/whatsapp.service';

@Controller()
export class LogisticsController {
  constructor(
    private prisma: PrismaService,
    private whatsapp: WhatsAppService,
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
    const subtotal = body.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
    const totalAmount = subtotal + (body.deliveryFee ?? 0);

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

    const today = new Date().toISOString().split('T')[0];
    for (const item of body.items) {
      await Promise.all([
        this.prisma.stockMovement.create({
          data: {
            userId: user.id,
            businessId: user.businessId ?? user.id,
            productId: item.productId,
            type: 'out',
            quantity: item.quantity,
            reason: `Commande manuelle #${orderNumber.toString().padStart(4, '0')}`,
            date: new Date(today),
          },
        }),
        this.prisma.product.update({
          where: { id: item.productId },
          data: { quantity: { decrement: item.quantity } },
        }),
      ]);
    }

    return order;
  }

  @Patch('my/logistics/orders/:id/status')
  async updateOrderStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { status: string; deliveryPersonName?: string },
  ) {
    const order = await this.prisma.manualOrder.findFirst({
      where: { id, ...this.where(user) },
      include: { items: true },
    });
    if (!order) return null;

    const updated = await this.prisma.manualOrder.update({
      where: { id },
      data: {
        status: body.status,
        ...(body.deliveryPersonName ? { deliveryPersonName: body.deliveryPersonName } : {}),
      },
    });

    if (body.status === 'delivered' && order.locationId) {
      for (const item of order.items) {
        await this.prisma.locationStock.updateMany({
          where: { locationId: order.locationId, productId: item.productId },
          data: { quantity: { decrement: item.quantity } },
        });
      }
    }

    return updated;
  }

  @Post('my/logistics/orders/:id/notify-partner')
  async notifyPartner(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const order = await this.prisma.manualOrder.findFirst({
      where: { id, ...this.where(user) },
      include: { items: { include: { product: true } }, partner: true, location: true },
    });
    if (!order || !order.partner?.phone) return { sent: false, reason: 'no_phone' };

    const num = String(order.orderNumber).padStart(4, '0');
    const lines = order.items.map(i => {
      const imgLine = i.product.imageUrl ? `\n  🖼 ${i.product.imageUrl}` : '';
      return `• ${i.product.name} × ${i.quantity} @ $${this.fmt(Number(i.unitPrice), 2)}${imgLine}`;
    }).join('\n');

    const scheduledLine = order.scheduledAt
      ? `📅 Livraison prévue : ${this.fmtDate(order.scheduledAt)}`
      : null;

    const msg = [
      `🚚 *Commande #${num}*`,
      `👤 Client : ${order.customerName}${order.customerPhone ? ` (${order.customerPhone})` : ''}`,
      `📍 Adresse : ${order.city} — ${order.address}`,
      scheduledLine,
      ``,
      `Produits :`,
      lines,
      ``,
      `💰 Total : $${this.fmt(Number(order.totalAmount), 2)}`,
      `🛵 Livraison : ${this.fmt(Number(order.deliveryFee))} FC`,
      order.location ? `📦 Stock source : ${order.location.name}` : null,
      order.notes ? `📝 Notes : ${order.notes}` : null,
    ].filter(l => l !== null).join('\n');

    const sent = await this.whatsapp.notifyOrder(user.id, order.partner.phone, msg);
    return { sent };
  }

  @Delete('my/logistics/orders/:id')
  deleteOrder(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.prisma.manualOrder.deleteMany({ where: { id, ...this.where(user) } });
  }
}
