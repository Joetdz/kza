import { Controller, Get, Post, Patch, Delete, Body, Param, Inject, forwardRef } from '@nestjs/common';
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
    return { ...safe, hasPin: !!partner.pin };
  }

  // ── Orders — status ───────────────────────────────────────────────

  @Public()
  @Patch(':token/orders/:orderId')
  async updateOrderStatus(
    @Param('token') token: string,
    @Param('orderId') orderId: string,
    @Body() body: { status: string; deliveryPersonName?: string },
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

    // Send WhatsApp notification — to group if configured, else to agent's phone
    if (body.agentId) {
      const agent = await this.prisma.deliveryAgent.findUnique({ where: { id: body.agentId } });
      const destination = (partner as any).whatsappGroupId ?? agent?.phone ?? null;
      if (destination) {
        const num = String(order.orderNumber).padStart(4, '0');
        const lines = order.items.map(i =>
          `• ${(i as any).product.name} × ${i.quantity}`
        ).join('\n');

        const scheduledLine = order.scheduledAt
          ? `📅 Livraison prévue : ${new Date(order.scheduledAt).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
          : null;

        const msg = [
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

        const uploadsRoot = join(process.cwd(), 'uploads');
        const firstWithImage = (order.items as any[]).find((i: any) => i.product?.imageUrl);
        const imagePath = firstWithImage
          ? join(uploadsRoot, (firstWithImage.product.imageUrl as string).replace(/^\/uploads\//, ''))
          : undefined;

        await this.whatsapp.notifyOrder(order.userId, destination, msg, imagePath);
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
}
