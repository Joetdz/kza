import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Inject, forwardRef } from '@nestjs/common';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../auth/public.decorator';
import { WhatsAppService } from '../whatsapp/whatsapp.service';

@Controller('partner-portal')
export class PartnerPortalController {
  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => WhatsAppService)) private whatsapp: WhatsAppService,
  ) {}

  // ── Auth ──────────────────────────────────────────────────────────

  @Public()
  @Post(':token/auth')
  async auth(@Param('token') token: string, @Body() body: { pin: string }) {
    const partner = await this.prisma.deliveryPartner.findUnique({ where: { token } });
    if (!partner) return { ok: false, error: 'invalid_token' };

    if (!partner.pin) {
      await this.prisma.deliveryPartner.update({ where: { token }, data: { pin: body.pin } });
      return { ok: true, setup: true };
    }

    if (partner.pin !== body.pin) return { ok: false, error: 'wrong_pin' };
    return { ok: true, setup: false };
  }

  // ── Data ──────────────────────────────────────────────────────────

  @Public()
  @Get(':token')
  async getPartnerOrders(@Param('token') token: string) {
    const partner = await this.prisma.deliveryPartner.findUnique({
      where: { token },
      include: {
        location: { include: { stocks: { include: { product: true } } } },
        agents: { orderBy: { createdAt: 'asc' } },
        orders: {
          include: {
            items: { include: { product: true } },
            location: true,
            agent: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!partner) return null;
    const { pin: _pin, ...safe } = partner as any;

    // Fetch business name from the first order so the portal can use it in client messages
    let businessName: string | null = null;
    const firstOrderWithBiz = (partner as any).orders?.find((o: any) => o.businessId);
    if (firstOrderWithBiz?.businessId) {
      const biz = await this.prisma.business.findUnique({
        where: { id: firstOrderWithBiz.businessId },
        select: { name: true },
      });
      businessName = biz?.name ?? null;
    }

    return { ...safe, hasPin: !!partner.pin, businessName };
  }

  // ── Orders — reschedule ───────────────────────────────────────────

  @Public()
  @Patch(':token/orders/:orderId/reschedule')
  async rescheduleOrder(
    @Param('token') token: string,
    @Param('orderId') orderId: string,
    @Body() body: { scheduledAt: string | null },
  ) {
    const partner = await this.prisma.deliveryPartner.findUnique({ where: { token } });
    if (!partner) return null;
    const order = await this.prisma.manualOrder.findFirst({ where: { id: orderId, partnerId: partner.id } });
    if (!order) return null;
    return this.prisma.manualOrder.update({
      where: { id: orderId },
      data: { scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null },
    });
  }

  // ── Orders — status ───────────────────────────────────────────────

  @Public()
  @Patch(':token/orders/:orderId')
  async updateOrderStatus(
    @Param('token') token: string,
    @Param('orderId') orderId: string,
    @Body() body: { status: string; deliveryPersonName?: string; collectedUsd?: number; collectedCdf?: number },
  ) {
    const partner = await this.prisma.deliveryPartner.findUnique({
      where: { token },
      include: { location: true },
    });
    if (!partner) return null;

    const order = await this.prisma.manualOrder.findFirst({
      where: { id: orderId, partnerId: partner.id },
      include: { items: true },
    });
    if (!order) return null;

    const updated = await this.prisma.manualOrder.update({
      where: { id: orderId },
      data: {
        status: body.status,
        ...(body.deliveryPersonName ? { deliveryPersonName: body.deliveryPersonName } : {}),
        ...(body.status === 'delivered' && body.collectedUsd != null ? { collectedUsd: body.collectedUsd } : {}),
        ...(body.status === 'delivered' && body.collectedCdf != null ? { collectedCdf: body.collectedCdf } : {}),
      },
    });

    if (body.status === 'delivered' && order.status !== 'delivered') {
      const locationId = order.locationId ?? partner.location?.id ?? null;
      if (locationId) {
        for (const item of order.items) {
          await this.prisma.locationStock.updateMany({
            where: { locationId, productId: item.productId },
            data: { quantity: { decrement: item.quantity } },
          });
        }
      }

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

  // ── Orders — assign agent ─────────────────────────────────────────

  @Public()
  @Patch(':token/orders/:orderId/assign-agent')
  async assignAgent(
    @Param('token') token: string,
    @Param('orderId') orderId: string,
    @Body() body: { agentId: string | null },
  ) {
    const partner = await this.prisma.deliveryPartner.findUnique({ where: { token } });
    if (!partner) return null;

    const order = await this.prisma.manualOrder.findFirst({
      where: { id: orderId, partnerId: partner.id },
      include: { items: { include: { product: true } } },
    });
    if (!order) return null;

    const updated = await this.prisma.manualOrder.update({
      where: { id: orderId },
      data: { agentId: body.agentId ?? null },
      include: { items: { include: { product: true } }, agent: true },
    });

    // Send WhatsApp notifications when an agent is assigned
    if (body.agentId) {
      const agent = await this.prisma.deliveryAgent.findUnique({ where: { id: body.agentId } });

      const num = String(order.orderNumber).padStart(4, '0');
      const lines = order.items.map(i =>
        `• ${(i as any).product.name} × ${i.quantity}`
      ).join('\n');

      const scheduledLine = order.scheduledAt
        ? `📅 Livraison prévue : ${new Date(order.scheduledAt).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
        : null;

      const deliveryDate = order.scheduledAt ? new Date(order.scheduledAt) : new Date();
      const dayOfWeek = deliveryDate.toLocaleDateString('fr-FR', { weekday: 'long' });

      const uploadsRoot = join(process.cwd(), 'uploads');
      const firstWithImage = (order.items as any[]).find((i: any) => i.product?.imageUrl);
      const imagePath = firstWithImage
        ? join(uploadsRoot, (firstWithImage.product.imageUrl as string).replace(/^\/uploads\//, ''))
        : undefined;

      // ── 1. Message groupe (format inchangé) ──────────────────────────
      const groupMsg = [
        `🚚 *Course assignée — #${num}*`,
        ``,
        `👤 Client : ${order.customerName}${order.customerPhone ? ` (${order.customerPhone})` : ''}`,
        `📍 Adresse : ${order.city} — ${order.address}`,
        scheduledLine,
        ``,
        `📦 Produits :`,
        lines,
        ``,
        `💰 Montant produits : $${Number(order.totalAmount).toLocaleString('fr-FR')}`,
        `🛵 Livraison : ${Number(order.deliveryFee).toLocaleString('fr-FR')} FC`,
        order.notes ? `📝 Notes : ${order.notes}` : null,
      ].filter(l => l !== null).join('\n');

      if ((partner as any).whatsappGroupId) {
        await this.whatsapp.notifyOrder(order.userId, (partner as any).whatsappGroupId, groupMsg, imagePath);
      }

      // ── 2. Message personnel au livreur ──────────────────────────────
      if (agent?.phone) {
        const agentTag = `@${agent.phone.replace(/\D/g, '')}`;
        const agentMsg = [
          `Bonjour *${agent.name}* 👋 ${agentTag}`,
          ``,
          `La course *#${num}* du *${dayOfWeek}* vous est assignée.`,
          ``,
          `👤 Client : ${order.customerName}${order.customerPhone ? ` (${order.customerPhone})` : ''}`,
          `📍 Adresse : ${order.city} — ${order.address}`,
          scheduledLine,
          ``,
          `📦 Produits :`,
          lines,
          ``,
          `💰 Montant : $${Number(order.totalAmount).toLocaleString('fr-FR')}`,
          `🛵 Livraison : ${Number(order.deliveryFee).toLocaleString('fr-FR')} FC`,
          order.notes ? `📝 Notes : ${order.notes}` : null,
        ].filter(l => l !== null).join('\n');

        await this.whatsapp.notifyOrder(order.userId, agent.phone, agentMsg, imagePath);
      }
    }

    return updated;
  }

  // ── Agents ────────────────────────────────────────────────────────

  @Public()
  @Get(':token/agents')
  async getAgents(@Param('token') token: string) {
    const partner = await this.prisma.deliveryPartner.findUnique({ where: { token } });
    if (!partner) return [];
    return this.prisma.deliveryAgent.findMany({
      where: { partnerId: partner.id },
      orderBy: { createdAt: 'asc' },
    });
  }

  @Public()
  @Post(':token/agents')
  async addAgent(@Param('token') token: string, @Body() body: { name: string; phone?: string }) {
    const partner = await this.prisma.deliveryPartner.findUnique({ where: { token } });
    if (!partner) return null;
    return this.prisma.deliveryAgent.create({
      data: { partnerId: partner.id, name: body.name, phone: body.phone ?? null },
    });
  }

  @Public()
  @Delete(':token/agents/:agentId')
  async removeAgent(@Param('token') token: string, @Param('agentId') agentId: string) {
    const partner = await this.prisma.deliveryPartner.findUnique({ where: { token } });
    if (!partner) return null;
    return this.prisma.deliveryAgent.deleteMany({ where: { id: agentId, partnerId: partner.id } });
  }

  // ── Finances ──────────────────────────────────────────────────────

  @Public()
  @Get(':token/finances')
  async getFinances(@Param('token') token: string) {
    const partner = await this.prisma.deliveryPartner.findUnique({ where: { token } });
    if (!partner) return null;

    // Amounts collected from customers by the partner
    const deliveredOrders = await this.prisma.manualOrder.findMany({
      where: { partnerId: partner.id, status: 'delivered' },
      select: { id: true, orderNumber: true, customerName: true, totalAmount: true, deliveryFee: true, collectedUsd: true, collectedCdf: true, createdAt: true },
    });
    // USD = produits encaissés en $
    // FC  = montant FC encaissé MOINS frais de livraison (frais restent au partenaire)
    const owedUsd = deliveredOrders.reduce((s, o) => s + Number((o as any).collectedUsd ?? o.totalAmount), 0);
    const owedCdf = deliveredOrders.reduce((s, o) => s + Number((o as any).collectedCdf ?? 0) - Number(o.deliveryFee ?? 0), 0);

    // Confirmed payments, strictly split by currency stored in DB
    const payments = await this.prisma.partnerPayment.findMany({
      where: { partnerId: partner.id },
      orderBy: { createdAt: 'desc' },
    });
    const confirmed = payments.filter(p => p.status === 'confirmed');
    const paidUsd = confirmed
      .filter(p => (p.currency ?? '').toUpperCase() === 'USD')
      .reduce((s, p) => s + Number(p.amount), 0);
    const paidCdf = confirmed
      .filter(p => (p.currency ?? '').toUpperCase() !== 'USD')
      .reduce((s, p) => s + Number(p.amount), 0);

    return {
      owedUsd,
      owedCdf,
      paidUsd,
      paidCdf,
      balanceUsd: owedUsd - paidUsd,
      balanceCdf: owedCdf - paidCdf,
      // legacy
      totalOwed: owedUsd,
      totalPaid: paidUsd,
      balance: owedUsd - paidUsd,
      deliveredOrders,
      payments,
    };
  }

  // ── Daily report ──────────────────────────────────────────────────

  @Public()
  @Get(':token/daily-report')
  async getDailyReport(@Param('token') token: string, @Query('date') dateStr: string) {
    const partner = await this.prisma.deliveryPartner.findUnique({
      where: { token },
      include: { location: { include: { stocks: { include: { product: true } } } } },
    });
    if (!partner) return null;

    const date = dateStr ? new Date(dateStr) : new Date();
    const start = new Date(date); start.setHours(0, 0, 0, 0);
    const end   = new Date(date); end.setHours(23, 59, 59, 999);

    const orders = await this.prisma.manualOrder.findMany({
      where: {
        partnerId: partner.id,
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

    const totalCollectedUsd = delivered.reduce((s, o) => s + Number((o as any).collectedUsd ?? o.totalAmount), 0);
    const totalCollectedCdf = delivered.reduce((s, o) => s + Number((o as any).collectedCdf ?? 0), 0);
    const totalDeliveryFees = delivered.reduce((s, o) => s + Number(o.deliveryFee), 0);

    const allDelivered = await this.prisma.manualOrder.findMany({
      where: {
        partnerId: partner.id,
        status: 'delivered',
        OR: [
          { dispatchedAt: { lte: end } },
          { dispatchedAt: null, createdAt: { lte: end } },
        ],
      },
      select: { totalAmount: true, deliveryFee: true, collectedUsd: true, collectedCdf: true },
    });
    const grossUsd = allDelivered.reduce((s, o) => s + Number((o as any).collectedUsd ?? o.totalAmount), 0);
    const grossCdf = allDelivered.reduce((s, o) => s + Number((o as any).collectedCdf ?? 0) - Number(o.deliveryFee), 0);

    const confirmedPayments = await (this.prisma as any).partnerPayment.findMany({
      where: { partnerId: partner.id, status: 'confirmed', createdAt: { lte: end } },
      select: { amount: true, currency: true },
    });
    const paidUsd = confirmedPayments.filter((p: any) => p.currency?.toUpperCase() === 'USD').reduce((s: number, p: any) => s + Number(p.amount), 0);
    const paidCdf = confirmedPayments.filter((p: any) => p.currency?.toUpperCase() !== 'USD').reduce((s: number, p: any) => s + Number(p.amount), 0);

    const cumulUsd = grossUsd - paidUsd;
    const cumulCdf = grossCdf - paidCdf;

    const locationStocks = (partner as any).location?.stocks ?? [];
    const deliveredItemsMap: Record<string, number> = {};
    for (const o of delivered) {
      for (const item of (o as any).items) {
        deliveredItemsMap[item.productId] = (deliveredItemsMap[item.productId] ?? 0) + item.quantity;
      }
    }
    const stock = locationStocks.map((s: any) => ({
      productName:  s.product.name,
      stockStart:   s.quantity + (deliveredItemsMap[s.productId] ?? 0),
      delivered:    deliveredItemsMap[s.productId] ?? 0,
      entries:      0,
      stockCurrent: s.quantity,
    }));

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
        totalAmount:  Number(o.totalAmount),
        deliveryFee:  Number(o.deliveryFee),
        notes:        o.notes,
        items:        (o as any).items.map((i: any) => ({ name: i.product.name, quantity: i.quantity })),
        status:       o.status,
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

  // ── Reports history ───────────────────────────────────────────────

  @Public()
  @Get(':token/reports-history')
  async getReportsHistory(
    @Param('token') token: string,
    @Query('from') fromStr?: string,
    @Query('to') toStr?: string,
  ) {
    const partner = await this.prisma.deliveryPartner.findUnique({ where: { token } });
    if (!partner) return null;

    const from = new Date(fromStr ?? new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
    from.setHours(0, 0, 0, 0);
    const to = new Date(toStr ?? new Date().toISOString().slice(0, 10));
    to.setHours(23, 59, 59, 999);

    const orders = await this.prisma.manualOrder.findMany({
      where: {
        partnerId: partner.id,
        OR: [
          { dispatchedAt: { gte: from, lte: to } },
          { dispatchedAt: null, createdAt: { gte: from, lte: to } },
        ],
      },
      select: {
        status: true, totalAmount: true, deliveryFee: true,
        collectedUsd: true, collectedCdf: true,
        dispatchedAt: true, createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    // Group by calendar day
    const dayMap = new Map<string, typeof orders>();
    for (const o of orders) {
      const d = ((o.dispatchedAt ?? o.createdAt) as Date).toISOString().slice(0, 10);
      if (!dayMap.has(d)) dayMap.set(d, []);
      dayMap.get(d)!.push(o);
    }

    return Array.from(dayMap.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, dayOrders]) => {
        const delivered = dayOrders.filter(o => o.status === 'delivered');
        const failed    = dayOrders.filter(o => ['returned', 'fake'].includes(o.status));
        const totalUsd  = delivered.reduce((s, o) => s + Number((o as any).collectedUsd ?? o.totalAmount), 0);
        const totalCdf  = delivered.reduce((s, o) => s + Number((o as any).collectedCdf ?? 0), 0);
        const totalFees = delivered.reduce((s, o) => s + Number(o.deliveryFee), 0);
        return {
          date,
          total:     dayOrders.length,
          delivered: delivered.length,
          failed:    failed.length,
          cancelled: dayOrders.filter(o => o.status === 'cancelled').length,
          totalCollectedUsd: totalUsd,
          totalCollectedCdf: totalCdf,
          totalDeliveryFees: totalFees,
          soldeUsd: totalUsd,
          soldeCdf: totalCdf - totalFees,
        };
      });
  }

  // ── Finances ──────────────────────────────────────────────────────

  @Public()
  @Post(':token/payments')
  async createPayment(
    @Param('token') token: string,
    @Body() body: { amount: number; currency?: string; proofUrl?: string; notes?: string },
  ) {
    const partner = await this.prisma.deliveryPartner.findUnique({ where: { token } });
    if (!partner) return null;
    return this.prisma.partnerPayment.create({
      data: {
        partnerId: partner.id,
        amount: body.amount,
        currency: body.currency ?? 'FC',
        proofUrl: body.proofUrl ?? null,
        notes: body.notes ?? null,
        status: 'pending',
      },
    });
  }
}
