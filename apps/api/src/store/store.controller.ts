import { Controller, Get, Put, Post, Body, Param, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { Public } from '../auth/public.decorator';

interface StoreConfigDto {
  name: string;
  description?: string;
  whatsappPhone: string;
  primaryColor?: string;
  active?: boolean;
}

interface OrderDto {
  customerName: string;
  customerPhone: string;
  deliveryZone: string;
  items: { productId: string; name: string; qty: number; unitPrice: number }[];
  notes?: string;
}

function buildSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 28) + '-' + Math.random().toString(36).slice(2, 6);
}

@Controller('store')
export class StoreController {
  constructor(
    private prisma: PrismaService,
    private whatsapp: WhatsAppService,
  ) {}

  // ── GET my store config (auth) ────────────────────────────────────────────

  @Get('my')
  async getMyStore(@CurrentUser() user: AuthUser) {
    const store = await this.prisma.onlineStore.findUnique({
      where: { userId: user.id },
      include: { products: { select: { productId: true } } },
    });

    if (!store) return null;

    // Fetch WhatsApp phone as fallback suggestion
    const waSession = await this.prisma.whatsAppSession.findUnique({ where: { userId: user.id } });

    return {
      ...store,
      visibleProductIds: store.products.map(p => p.productId),
      suggestedPhone: waSession?.phone ?? null,
    };
  }

  // ── CREATE / UPDATE store config (auth) ───────────────────────────────────

  @Put('my')
  async upsertStore(@CurrentUser() user: AuthUser, @Body() dto: StoreConfigDto) {
    if (!dto.name?.trim()) throw new BadRequestException('Le nom est requis');
    if (!dto.whatsappPhone?.trim()) throw new BadRequestException('Le numéro WhatsApp est requis');

    const existing = await this.prisma.onlineStore.findUnique({ where: { userId: user.id } });

    if (existing) {
      return this.prisma.onlineStore.update({
        where: { userId: user.id },
        data: {
          name: dto.name.trim(),
          description: dto.description ?? null,
          whatsappPhone: dto.whatsappPhone.trim(),
          primaryColor: dto.primaryColor ?? existing.primaryColor,
          active: dto.active ?? existing.active,
        },
      });
    }

    const slug = buildSlug(dto.name);
    return this.prisma.onlineStore.create({
      data: {
        userId: user.id,
        slug,
        name: dto.name.trim(),
        description: dto.description ?? null,
        whatsappPhone: dto.whatsappPhone.trim(),
        primaryColor: dto.primaryColor ?? '#6366f1',
        active: dto.active ?? true,
      },
    });
  }

  // ── SET visible products (auth) ───────────────────────────────────────────

  @Put('my/products')
  async setStoreProducts(@CurrentUser() user: AuthUser, @Body() body: { productIds: string[] }) {
    const store = await this.prisma.onlineStore.findUnique({ where: { userId: user.id } });
    if (!store) throw new NotFoundException('Créez votre boutique d\'abord');

    // Replace all visible products
    await this.prisma.storeProduct.deleteMany({ where: { storeId: store.id } });

    if (body.productIds?.length) {
      await this.prisma.storeProduct.createMany({
        data: body.productIds.map(productId => ({ storeId: store.id, productId })),
        skipDuplicates: true,
      });
    }

    return { ok: true };
  }

  // ── GET store orders (auth) ───────────────────────────────────────────────

  @Get('my/orders')
  async getOrders(@CurrentUser() user: AuthUser) {
    const store = await this.prisma.onlineStore.findUnique({ where: { userId: user.id } });
    if (!store) return { orders: [] };

    const orders = await this.prisma.storeOrder.findMany({
      where: { storeId: store.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return { orders };
  }

  // ── UPDATE order status (auth) ────────────────────────────────────────────

  @Put('my/orders/:orderId')
  async updateOrderStatus(
    @CurrentUser() user: AuthUser,
    @Param('orderId') orderId: string,
    @Body() body: { status: string },
  ) {
    const store = await this.prisma.onlineStore.findUnique({ where: { userId: user.id } });
    if (!store) throw new NotFoundException('Boutique introuvable');

    await this.prisma.storeOrder.updateMany({
      where: { id: orderId, storeId: store.id },
      data: { status: body.status },
    });
    return { ok: true };
  }

  // ── GET public store (no auth) ─────────────────────────────────────────────

  @Public()
  @Get(':slug')
  async getPublicStore(@Param('slug') slug: string) {
    const store = await this.prisma.onlineStore.findUnique({
      where: { slug },
      include: {
        products: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                category: true,
                sellingPrice: true,
                quantity: true,
                imageUrl: true,
                trackStock: true,
              },
            },
          },
        },
      },
    });

    if (!store || !store.active) throw new NotFoundException('Boutique introuvable');

    return {
      id: store.id,
      slug: store.slug,
      name: store.name,
      description: store.description,
      logoUrl: store.logoUrl,
      primaryColor: store.primaryColor,
      products: store.products
        .map(sp => sp.product)
        .filter(p => !p.trackStock || p.quantity > 0)
        .map(({ trackStock: _, ...pub }) => pub),
    };
  }

  // ── POST public order (no auth) ────────────────────────────────────────────

  @Public()
  @Post(':slug/order')
  async submitOrder(@Param('slug') slug: string, @Body() dto: OrderDto) {
    const store = await this.prisma.onlineStore.findUnique({ where: { slug } });
    if (!store || !store.active) throw new NotFoundException('Boutique introuvable');

    if (!dto.customerName?.trim()) throw new BadRequestException('Nom requis');
    if (!dto.customerPhone?.trim()) throw new BadRequestException('Téléphone requis');
    if (!dto.deliveryZone?.trim()) throw new BadRequestException('Zone de livraison requise');
    if (!dto.items?.length) throw new BadRequestException('Panier vide');

    const total = dto.items.reduce((sum, i) => sum + i.qty * i.unitPrice, 0);

    const order = await this.prisma.storeOrder.create({
      data: {
        storeId: store.id,
        customerName: dto.customerName.trim(),
        customerPhone: dto.customerPhone.trim(),
        deliveryZone: dto.deliveryZone,
        items: dto.items as any,
        totalAmount: total,
        notes: dto.notes ?? null,
        status: 'pending',
      },
    });

    // Build order message text
    const ref = order.id.slice(0, 8).toUpperCase();
    const lines = [
      `*Nouvelle commande — ${store.name}*`,
      '',
      '*Produits :*',
      ...dto.items.map(i => `  • ${i.name}  x${i.qty}  —  ${i.unitPrice.toLocaleString('fr-FR')} FC`),
      '',
      `*Total : ${total.toLocaleString('fr-FR')} FC*`,
      `Paiement : A la livraison`,
      '',
      `*Client :* ${dto.customerName}`,
      `*Telephone :* ${dto.customerPhone}`,
      `*Livraison :* ${dto.deliveryZone}`,
      ...(dto.notes ? [`*Notes :* ${dto.notes}`] : []),
      '',
      `Ref : ${ref}`,
    ];

    const messageText = lines.join('\n');
    const phone = store.whatsappPhone.replace(/\D/g, '');
    const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(messageText)}`;

    // Try direct send via connected WhatsApp session
    const directSent = await this.whatsapp.notifyOrder(store.userId, store.whatsappPhone, messageText);

    return { orderId: order.id, ref, waUrl, directSent };
  }
}
