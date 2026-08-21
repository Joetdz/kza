import { Controller, Get, Put, Post, Patch, Delete, Body, Param, NotFoundException, BadRequestException, Res } from '@nestjs/common';
import { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { PushService } from '../push/push.service';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { Public } from '../auth/public.decorator';
import OpenAI from 'openai';

interface StoreConfigDto {
  name: string;
  description?: string;
  whatsappPhone: string;
  primaryColor?: string;
  currency?: string;
  metaPixelId?: string;
  deliveryZones?: Array<{ city: string; fee: number }>;
  active?: boolean;
}

interface OrderDto {
  customerName: string;
  customerPhone: string;
  deliveryZone: string;
  commune?: string;
  avenue?: string;
  reference?: string;
  deliveryFee?: number;
  items: { productId: string; name: string; qty: number; unitPrice: number }[];
  notes?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
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

const JINGLE_STYLES: Record<string, string> = {
  energique:    'dynamique, excitant, accrocheur — donne envie d\'agir maintenant',
  elegant:      'raffiné, premium, sophistiqué — inspire confiance et prestige',
  friendly:     'chaleureux, proche, convivial — comme un ami qui recommande',
  urgent:       'promotionnel, urgence, offre limitée — crée le sentiment de rareté',
  storytelling: 'narratif, émotionnel — raconte une petite histoire autour du produit',
};

const VALID_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'] as const;

@Controller('store')
export class StoreController {
  private openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  constructor(
    private prisma: PrismaService,
    private whatsapp: WhatsAppService,
    private push: PushService,
  ) {}

  // ── GET my store config (auth) ────────────────────────────────────────────

  @Get('my')
  async getMyStore(@CurrentUser() user: AuthUser) {
    const store = await this.prisma.onlineStore.findUnique({
      where: { userId: user.id },
      include: { products: { select: { productId: true, storePrice: true, comparePrice: true, bundleQty: true, bundlePrice: true, storeDescription: true } } },
    });

    if (!store) return null;

    // Fetch WhatsApp phone as fallback suggestion
    const waSession = await this.prisma.whatsAppSession.findUnique({ where: { userId: user.id } });

    return {
      ...store,
      currency: store.currency ?? 'CDF',
      visibleProductIds: store.products.map(p => p.productId),
      storePrices: Object.fromEntries(
        store.products
          .filter(p => p.storePrice != null)
          .map(p => [p.productId, Number(p.storePrice)])
      ),
      storeDescriptions: Object.fromEntries(
        store.products
          .filter(p => p.storeDescription != null)
          .map(p => [p.productId, p.storeDescription!])
      ),
      storeBundles: Object.fromEntries(
        store.products
          .filter(p => p.bundleQty != null && p.bundlePrice != null)
          .map(p => [p.productId, { qty: p.bundleQty!, price: Number(p.bundlePrice!) }])
      ),
      storeComparePrices: Object.fromEntries(
        store.products
          .filter(p => p.comparePrice != null)
          .map(p => [p.productId, Number(p.comparePrice!)])
      ),
      deliveryZones: store.deliveryZones ?? [],
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
          currency: dto.currency ?? existing.currency,
          metaPixelId: dto.metaPixelId !== undefined ? (dto.metaPixelId.trim() || null) : existing.metaPixelId,
          deliveryZones: dto.deliveryZones !== undefined ? dto.deliveryZones : existing.deliveryZones ?? undefined,
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
        currency: dto.currency ?? 'CDF',
        metaPixelId: dto.metaPixelId?.trim() || null,
        deliveryZones: dto.deliveryZones ?? [
          { city: 'Kinshasa', fee: 8000 },
          { city: 'Lubumbashi', fee: 7500 },
          { city: 'Kolwezi', fee: 7000 },
          { city: 'Matadi', fee: 5500 },
          { city: 'Boma', fee: 7000 },
          { city: 'Muanda', fee: 7500 },
        ],
        active: dto.active ?? true,
      },
    });
  }

  // ── SET visible products (auth) ───────────────────────────────────────────

  @Put('my/products')
  async setStoreProducts(@CurrentUser() user: AuthUser, @Body() body: { productIds: string[] }) {
    const store = await this.prisma.onlineStore.findUnique({ where: { userId: user.id } });
    if (!store) throw new NotFoundException('Créez votre boutique d\'abord');

    // Preserve existing store prices before replacing
    const existing = await this.prisma.storeProduct.findMany({
      where: { storeId: store.id },
      select: { productId: true, storePrice: true, comparePrice: true, bundleQty: true, bundlePrice: true, storeDescription: true },
    });
    const configMap = Object.fromEntries(existing.map(p => [p.productId, p]));

    await this.prisma.storeProduct.deleteMany({ where: { storeId: store.id } });

    if (body.productIds?.length) {
      await this.prisma.storeProduct.createMany({
        data: body.productIds.map(productId => ({
          storeId: store.id,
          productId,
          storePrice: configMap[productId]?.storePrice ?? null,
          comparePrice: configMap[productId]?.comparePrice ?? null,
          bundleQty: configMap[productId]?.bundleQty ?? null,
          bundlePrice: configMap[productId]?.bundlePrice ?? null,
          storeDescription: configMap[productId]?.storeDescription ?? null,
        })),
        skipDuplicates: true,
      });
    }

    return { ok: true };
  }

  // ── SET store price / description per product (auth) ────────────────────────

  @Patch('my/products/:productId')
  async setProductStoreConfig(
    @CurrentUser() user: AuthUser,
    @Param('productId') productId: string,
    @Body() body: { storePrice?: number | null; comparePrice?: number | null; bundleQty?: number | null; bundlePrice?: number | null; storeDescription?: string | null },
  ) {
    const store = await this.prisma.onlineStore.findUnique({ where: { userId: user.id } });
    if (!store) throw new NotFoundException('Boutique introuvable');
    const data: any = {};
    if ('storePrice' in body) data.storePrice = body.storePrice ?? null;
    if ('comparePrice' in body) data.comparePrice = body.comparePrice ?? null;
    if ('bundleQty' in body) data.bundleQty = body.bundleQty ?? null;
    if ('bundlePrice' in body) data.bundlePrice = body.bundlePrice ?? null;
    if ('storeDescription' in body) data.storeDescription = body.storeDescription?.trim() || null;
    await this.prisma.storeProduct.updateMany({ where: { storeId: store.id, productId }, data });
    return { ok: true };
  }

  // ── GENERATE product description via AI (auth) ───────────────────────────

  @Post('my/products/:productId/description')
  async generateProductDescription(
    @CurrentUser() user: AuthUser,
    @Param('productId') productId: string,
    @Body() body: { productName: string; category?: string },
  ) {
    if (!body.productName?.trim()) throw new BadRequestException('Nom requis');

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{
        role: 'user',
        content: `Rédige une description produit courte (2-3 phrases maximum, 40 mots max) pour une boutique en ligne ciblant le marché congolais (RDC/Congo).

Produit : ${body.productName.trim()}${body.category ? ` (catégorie : ${body.category})` : ''}

Règles :
- Commence directement par un bénéfice client ou une douleur résolue
- Mets en avant ce que le client GAGNE (résultat, transformation, sentiment)
- Réponds à une douleur ou frustration réelle du client
- Ton direct, chaleureux, vendeur — pas de jargon
- Pas de titre, pas de bullet points, texte continu uniquement
- Maximum 40 mots`,
      }],
      max_tokens: 100,
      temperature: 0.8,
    });

    const description = completion.choices[0]?.message?.content?.trim() ?? '';
    return { description };
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

  // ── JINGLE : generate script with GPT (auth) ─────────────────────────────

  @Post('my/jingle/script')
  async generateJingleScript(
    @CurrentUser() _user: AuthUser,
    @Body() body: { productName: string; description?: string; price?: number; style?: string },
  ) {
    if (!body.productName?.trim()) throw new BadRequestException('Nom du produit requis');
    const styleDesc = JINGLE_STYLES[body.style ?? 'energique'] ?? JINGLE_STYLES.energique;

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{
        role: 'user',
        content: `Génère un script publicitaire vocal de 10 à 15 secondes (30 à 40 mots maximum) pour ce produit.

Style: ${styleDesc}.
Produit: ${body.productName.trim()}${body.price ? `\nPrix: ${body.price.toLocaleString('fr-FR')} FC` : ''}${body.description ? `\nDescription: ${body.description}` : ''}

Règles:
- Texte uniquement, aucun titre, aucune indication de mise en scène
- Adapté au marché africain francophone (Congo, RDC)
- Accrocheur, mémorable, donne envie d'acheter
- Maximum 40 mots`,
      }],
      max_tokens: 120,
      temperature: 0.9,
    });

    const script = completion.choices[0]?.message?.content?.trim() ?? '';
    return { script };
  }

  // ── JINGLE : synthesize voice with OpenAI TTS (auth) ──────────────────────

  @Post('my/jingle/voice')
  async generateJingleVoice(
    @CurrentUser() _user: AuthUser,
    @Body() body: { script: string; voice?: string },
    @Res() res: Response,
  ) {
    if (!body.script?.trim()) throw new BadRequestException('Script requis');
    const voice = (VALID_VOICES as readonly string[]).includes(body.voice ?? '') ? body.voice! : 'nova';

    const mp3 = await this.openai.audio.speech.create({
      model: 'tts-1-hd',
      voice: voice as typeof VALID_VOICES[number],
      input: body.script.trim().slice(0, 300),
      speed: 1.0,
    });

    const buffer = Buffer.from(await mp3.arrayBuffer());
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  }

  // ── GET my media (auth) ───────────────────────────────────────────────────

  @Get('my/media')
  async getMyMedia(@CurrentUser() user: AuthUser) {
    const where = user.businessId ? { businessId: user.businessId } : { userId: user.id };
    return this.prisma.productMedia.findMany({
      where: { product: where },
      include: { product: { select: { id: true, name: true, imageUrl: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ── ADD media to product (auth) ───────────────────────────────────────────

  @Post('my/media')
  async addMedia(
    @CurrentUser() user: AuthUser,
    @Body() body: { productId: string; url: string; type: string; caption?: string; audioUrl?: string },
  ) {
    const where = user.businessId ? { businessId: user.businessId } : { userId: user.id };
    const product = await this.prisma.product.findFirst({ where: { id: body.productId, ...where } });
    if (!product) throw new NotFoundException('Produit introuvable');
    return this.prisma.productMedia.create({
      data: {
        productId: body.productId,
        url: body.url,
        type: body.type ?? 'image',
        caption: body.caption ?? null,
        audioUrl: body.audioUrl ?? null,
      },
    });
  }

  // ── PATCH media audio (auth) ───────────────────────────────────────────────

  @Patch('my/media/:id')
  async updateMedia(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { audioUrl?: string | null; caption?: string },
  ) {
    const media = await this.prisma.productMedia.findUnique({
      where: { id },
      include: { product: { select: { userId: true, businessId: true } } },
    });
    if (!media) throw new NotFoundException('Média introuvable');
    const p = media.product;
    const owns = user.businessId ? p.businessId === user.businessId : p.userId === user.id;
    if (!owns) throw new NotFoundException('Média introuvable');
    return this.prisma.productMedia.update({
      where: { id },
      data: {
        ...(body.audioUrl !== undefined && { audioUrl: body.audioUrl }),
        ...(body.caption !== undefined && { caption: body.caption }),
      },
    });
  }

  // ── DELETE media (auth) ────────────────────────────────────────────────────

  @Delete('my/media/:id')
  async deleteMedia(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const media = await this.prisma.productMedia.findUnique({
      where: { id },
      include: { product: { select: { userId: true, businessId: true } } },
    });
    if (!media) throw new NotFoundException('Média introuvable');
    const p = media.product;
    const owns = user.businessId ? p.businessId === user.businessId : p.userId === user.id;
    if (!owns) throw new NotFoundException('Média introuvable');
    await this.prisma.productMedia.delete({ where: { id } });
    return { id };
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
                media: { orderBy: { sortOrder: 'asc' }, select: { id: true, url: true, type: true } },
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
      currency: store.currency ?? 'CDF',
      metaPixelId: store.metaPixelId ?? null,
      deliveryZones: store.deliveryZones ?? [],
      products: store.products
        .filter(sp => !sp.product.trackStock || sp.product.quantity > 0)
        .map(sp => {
          const { trackStock: _, media, ...pub } = sp.product as any;
          return {
            ...pub,
            sellingPrice: Number(sp.storePrice ?? pub.sellingPrice),
            comparePrice: sp.comparePrice ? Number(sp.comparePrice) : null,
            bundleQty: sp.bundleQty ?? null,
            bundlePrice: sp.bundlePrice ? Number(sp.bundlePrice) : null,
            description: sp.storeDescription ?? null,
            media: (media ?? []).map((m: any) => ({ id: m.id, url: m.url, type: m.type })),
          };
        }),
    };
  }

  // ── GET public feed / TikTok (no auth) ────────────────────────────────────

  @Public()
  @Get(':slug/feed')
  async getPublicFeed(@Param('slug') slug: string) {
    const store = await this.prisma.onlineStore.findUnique({
      where: { slug },
      include: {
        products: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                sellingPrice: true,
                imageUrl: true,
                category: true,
                quantity: true,
                trackStock: true,
                media: { orderBy: { sortOrder: 'asc' } },
              },
            },
          },
        },
      },
    });
    if (!store || !store.active) throw new NotFoundException('Boutique introuvable');

    return store.products.flatMap(sp => {
      const p = sp.product;
      if (p.trackStock && p.quantity <= 0) return [];
      const displayPrice = Number(sp.storePrice ?? p.sellingPrice);
      return p.media.map(m => ({
        id: m.id,
        url: m.url,
        type: m.type,
        caption: m.caption,
        audioUrl: m.audioUrl,
        sortOrder: m.sortOrder,
        product: {
          id: p.id,
          name: p.name,
          sellingPrice: displayPrice,
          imageUrl: p.imageUrl,
          category: p.category,
          quantity: p.quantity,
        },
      }));
    });
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
    const deliveryFee = dto.deliveryFee ?? 0;
    const grandTotal = total + deliveryFee;

    const order = await this.prisma.storeOrder.create({
      data: {
        storeId: store.id,
        customerName: dto.customerName.trim(),
        customerPhone: dto.customerPhone.trim(),
        deliveryZone: dto.deliveryZone,
        items: dto.items as any,
        totalAmount: total,
        deliveryFee,
        notes: dto.notes ?? null,
        utmSource: dto.utmSource ?? null,
        utmMedium: dto.utmMedium ?? null,
        utmCampaign: dto.utmCampaign ?? null,
        utmContent: dto.utmContent ?? null,
        status: 'pending',
      },
    });

    // Create draft order in logistics
    let businessWaPhone: string | null = null;
    try {
      const business = await this.prisma.business.findFirst({
        where: { userId: store.userId },
        orderBy: { isDefault: 'desc' },
        select: { id: true, whatsappPhone: true },
      });
      if (business?.whatsappPhone) businessWaPhone = business.whatsappPhone;
      if (business) {
        const addressParts = [dto.commune, dto.avenue, dto.reference].filter(Boolean);
        const address = addressParts.join(', ') || dto.deliveryZone;
        const orderCount = await this.prisma.manualOrder.count({
          where: { userId: store.userId, businessId: business.id },
        });
        const draft = await this.prisma.manualOrder.create({
          data: {
            userId: store.userId,
            businessId: business.id,
            orderNumber: orderCount + 1,
            customerName: dto.customerName.trim(),
            customerPhone: dto.customerPhone.trim(),
            city: dto.deliveryZone,
            address,
            deliveryFee,
            totalAmount: total,
            isDraft: true,
            notes: dto.notes ?? null,
            items: {
              create: dto.items
                .filter(i => i.productId)
                .map(i => ({ productId: i.productId, quantity: i.qty, unitPrice: i.unitPrice })),
            },
          },
          select: { id: true, orderNumber: true },
        });
        // Notify logistics dashboard via socket + push
        this.whatsapp.emitDraftOrderCreated(store.userId, order.id, order.orderNumber);
        this.push.sendToUser(store.userId, {
          title: '🛒 Nouvelle commande !',
          body: `${dto.customerName} vient de commander sur ${store.name}`,
          url: '/#/logistics',
          tag: 'draft-order',
        }).catch(() => {});
      }
    } catch { /* non-blocking */ }

    // Build order message text
    const ref = order.id.slice(0, 8).toUpperCase();
    const cur = store.currency ?? 'CDF';
    const lines = [
      `*Nouvelle commande — ${store.name}*`,
      '',
      '*Produits :*',
      ...dto.items.map(i => `  • ${i.name}  x${i.qty}  —  ${i.unitPrice.toLocaleString('fr-FR')} ${cur}`),
      '',
      `Sous-total : ${total.toLocaleString('fr-FR')} ${cur}`,
      `Frais de livraison : ${deliveryFee.toLocaleString('fr-FR')} FC`,
      `*Total à payer : ${total.toLocaleString('fr-FR')} ${cur} + ${deliveryFee.toLocaleString('fr-FR')} FC*`,
      `Paiement : À la livraison`,
      '',
      `*Client :* ${dto.customerName}`,
      `*Téléphone :* ${dto.customerPhone}`,
      `*Ville :* ${dto.deliveryZone}`,
      ...(dto.commune ? [`*Commune :* ${dto.commune}`] : []),
      ...(dto.avenue ? [`*Avenue :* ${dto.avenue}`] : []),
      ...(dto.reference ? [`*Référence :* ${dto.reference}`] : []),
      ...(dto.notes ? [`*Notes :* ${dto.notes}`] : []),
      '',
      `Réf : ${ref}`,
    ];

    const messageText = lines.join('\n');
    const destPhone = (businessWaPhone ?? store.whatsappPhone).replace(/\D/g, '');
    const waUrl = `https://wa.me/${destPhone}?text=${encodeURIComponent(messageText)}`;

    // Notify business internally (best-effort, non-blocking)
    this.whatsapp.notifyOrder(store.userId, destPhone, messageText).catch(() => {});

    // Always return waUrl so the client sends from their own number
    return { orderId: order.id, ref, waUrl };
  }
}
