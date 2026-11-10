import { Controller, Get, Put, Post, Patch, Delete, Body, Param, Query, Headers, NotFoundException, BadRequestException, Res, Logger } from '@nestjs/common';
import { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { PushService } from '../push/push.service';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { Public } from '../auth/public.decorator';
import { LogisticsService } from '../logistics/logistics.service';
import { CustomersService } from '../customers/customers.service';
import { VideoCompressorService } from './video-compressor.service';
import { assertStockAvailable, lockProducts } from '../movements/stock-rules';
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
  ikeleListed?: boolean;
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
  /** 'ikele' when placed from the Ikele app. */
  source?: string;
  /** The device's visitor id: its likes and follows join the account the order opens. */
  deviceVisitorId?: string;
  /** Where the customer stood when ordering (« Ma position »), for the delivery person. */
  location?: { lat?: number; lng?: number };
  /** The day the customer wants it: today, tomorrow, the day after. Absent: as soon as possible. */
  deliveryDay?: 'today' | 'tomorrow' | 'after';
}

/** Kinshasa's clock (UTC+1, no daylight saving): « today » is the customer's today. */
const KINSHASA_OFFSET_MS = 3600_000;
/** The hour a wished day is filed at in Logistics, Kinshasa time. */
const WISHED_DAY_HOUR = 10;

function wishedDeliveryDate(day: OrderDto['deliveryDay']): Date | null {
  const offset = { today: 0, tomorrow: 1, after: 2 }[day ?? ''];
  if (offset === undefined) return null;
  const local = new Date(Date.now() + KINSHASA_OFFSET_MS);
  local.setUTCDate(local.getUTCDate() + offset);
  local.setUTCHours(WISHED_DAY_HOUR, 0, 0, 0);
  return new Date(local.getTime() - KINSHASA_OFFSET_MS);
}

/** A map link to the customer's position, or null when none (or not a real one) was sent. */
function positionLink(location: OrderDto['location']): string | null {
  const lat = Number(location?.lat), lng = Number(location?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return `https://maps.google.com/?q=${lat.toFixed(6)},${lng.toFixed(6)}`;
}

/** Same calculation as the cart on the public store (calcLineTotal in PublicStore.tsx). */
function lineTotal(price: number, qty: number, bundleQty: number | null, bundlePrice: number | null): number {
  if (!bundleQty || !bundlePrice) return qty * price;
  return Math.floor(qty / bundleQty) * bundlePrice + (qty % bundleQty) * price;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

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
  private readonly logger = new Logger(StoreController.name);
  private openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  constructor(
    private prisma: PrismaService,
    private whatsapp: WhatsAppService,
    private push: PushService,
    private logisticsService: LogisticsService,
    private customers: CustomersService,
    private videos: VideoCompressorService,
  ) {}

  // Each business owns its own store — scope every lookup by (userId, businessId)
  private storeWhere(user: AuthUser) {
    return { userId: user.ownerId, businessId: user.businessId || null };
  }

  // ── GET my store config (auth) ────────────────────────────────────────────

  @Get('my')
  async getMyStore(@CurrentUser() user: AuthUser) {
    const store = await this.prisma.onlineStore.findFirst({
      where: this.storeWhere(user),
      include: { products: { select: { productId: true, storePrice: true, comparePrice: true, bundleQty: true, bundlePrice: true, storeDescription: true } } },
    });

    if (!store) return null;

    // Fetch WhatsApp phone as fallback suggestion
    const waSession = await this.prisma.whatsAppSession.findFirst({
      where: { userId: user.ownerId, businessId: user.businessId || null },
    });

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

    const existing = await this.prisma.onlineStore.findFirst({ where: this.storeWhere(user) });

    if (existing) {
      return this.prisma.onlineStore.update({
        where: { id: existing.id },
        data: {
          name: dto.name.trim(),
          description: dto.description ?? null,
          whatsappPhone: dto.whatsappPhone.trim(),
          primaryColor: dto.primaryColor ?? existing.primaryColor,
          currency: dto.currency ?? existing.currency,
          metaPixelId: dto.metaPixelId !== undefined ? (dto.metaPixelId.trim() || null) : existing.metaPixelId,
          deliveryZones: dto.deliveryZones !== undefined ? dto.deliveryZones : existing.deliveryZones ?? undefined,
          active: dto.active ?? existing.active,
          ikeleListed: dto.ikeleListed ?? existing.ikeleListed,
        },
      });
    }

    // buildSlug's random suffix is only 4 base36 chars (~1.7M combos) — rare but real
    // collision risk. Retry a few times with a fresh suffix rather than 500ing on P2002.
    for (let attempt = 0; attempt < 5; attempt++) {
      const slug = buildSlug(dto.name);
      try {
        return await this.prisma.onlineStore.create({
          data: {
            userId: user.ownerId,
            businessId: user.businessId || null,
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
      } catch (err: any) {
        if (err?.code === 'P2002' && attempt < 4) continue; // slug collision — retry with a new suffix
        throw err;
      }
    }
    // Unreachable (loop always returns or throws), but keeps TS happy.
    throw new BadRequestException('Impossible de créer la boutique — réessaie.');
  }

  // ── SET visible products (auth) ───────────────────────────────────────────

  @Put('my/products')
  async setStoreProducts(@CurrentUser() user: AuthUser, @Body() body: { productIds: string[] }) {
    const store = await this.prisma.onlineStore.findFirst({ where: this.storeWhere(user) });
    if (!store) throw new NotFoundException('Créez votre boutique d\'abord');

    // Never trust productIds as given — without this check, any authenticated business
    // can attach another business's private product to its own public storefront,
    // which getPublicStore then republishes (name, price, stock, images) to anyone.
    const requestedIds = body.productIds ?? [];
    const owned = requestedIds.length
      ? await this.prisma.product.findMany({
          where: { id: { in: requestedIds }, userId: user.ownerId, businessId: user.businessId || null },
          select: { id: true },
        })
      : [];
    const ownedIds = new Set(owned.map(p => p.id));
    const productIds = requestedIds.filter(id => ownedIds.has(id));

    // Preserve existing store prices before replacing
    const existing = await this.prisma.storeProduct.findMany({
      where: { storeId: store.id },
      select: { productId: true, storePrice: true, comparePrice: true, bundleQty: true, bundlePrice: true, storeDescription: true },
    });
    const configMap = Object.fromEntries(existing.map(p => [p.productId, p]));

    await this.prisma.storeProduct.deleteMany({ where: { storeId: store.id } });

    if (productIds.length) {
      await this.prisma.storeProduct.createMany({
        data: productIds.map(productId => ({
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

    return { ok: true, skipped: requestedIds.length - productIds.length };
  }

  // ── SET store price / description per product (auth) ────────────────────────

  @Patch('my/products/:productId')
  async setProductStoreConfig(
    @CurrentUser() user: AuthUser,
    @Param('productId') productId: string,
    @Body() body: { storePrice?: number | null; comparePrice?: number | null; bundleQty?: number | null; bundlePrice?: number | null; storeDescription?: string | null },
  ) {
    const store = await this.prisma.onlineStore.findFirst({ where: this.storeWhere(user) });
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
    const store = await this.prisma.onlineStore.findFirst({ where: this.storeWhere(user) });
    if (!store) return { orders: [] };

    const orders = await this.prisma.storeOrder.findMany({
      where: { storeId: store.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { manualOrder: { select: { status: true, isDraft: true, orderNumber: true } } },
    });
    // The Logistics order is the source of truth: its status is the one shown.
    return {
      orders: orders.map(({ manualOrder, ...o }) => ({
        ...o,
        status: manualOrder ? (manualOrder.isDraft ? 'pending' : manualOrder.status) : o.status,
        logisticsNumber: manualOrder?.orderNumber ?? null,
      })),
    };
  }

  // ── UPDATE order status (auth) ────────────────────────────────────────────

  @Put('my/orders/:orderId')
  async updateOrderStatus(
    @CurrentUser() user: AuthUser,
    @Param('orderId') orderId: string,
    @Body() body: { status: string },
  ) {
    const store = await this.prisma.onlineStore.findFirst({ where: this.storeWhere(user) });
    if (!store) throw new NotFoundException('Boutique introuvable');

    const order = await this.prisma.storeOrder.findFirst({ where: { id: orderId, storeId: store.id } });
    if (!order) throw new NotFoundException('Commande introuvable');

    // The logistics order is the source of truth for stock and sales: every status set here
    // goes through it, under the same rules as in Logistics.
    if (order.manualOrderId) {
      // Also writes this storefront order's status, once the change is accepted.
      await this.logisticsService.applyStoreStatus(order.manualOrderId, body.status);
      return { ok: true };
    }
    if (['delivered', 'returned', 'dispatched'].includes(body.status) || (order.status === 'cancelled' && body.status !== 'cancelled')) {
      // No logistics order (deleted, or too old to have one): delivering it here would move
      // no stock and record no sale.
      throw new BadRequestException("Cette commande n'est reliée à aucune commande Logistique : créez-la dans la Logistique pour la livrer.");
    }

    await this.prisma.storeOrder.update({
      where: { id: orderId },
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
    const where = user.businessId ? { businessId: user.businessId } : { userId: user.ownerId };
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
    @Body() body: { productId: string; url: string; type: string; caption?: string; audioUrl?: string; thumbnailUrl?: string },
  ) {
    const where = user.businessId ? { businessId: user.businessId } : { userId: user.ownerId };
    const product = await this.prisma.product.findFirst({ where: { id: body.productId, ...where } });
    if (!product) throw new NotFoundException('Produit introuvable');
    const media = await this.prisma.productMedia.create({
      data: {
        productId: body.productId,
        url: body.url,
        type: body.type ?? 'image',
        caption: body.caption ?? null,
        audioUrl: body.audioUrl ?? null,
        thumbnailUrl: body.thumbnailUrl ?? null,
      },
    });
    // Lighter for the feed, in the background: the reel shows at once, as uploaded.
    if (media.type === 'video') this.videos.enqueue(media.id);
    return media;
  }

  // ── PATCH media audio (auth) ───────────────────────────────────────────────

  @Patch('my/media/:id')
  async updateMedia(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { audioUrl?: string | null; caption?: string; thumbnailUrl?: string | null },
  ) {
    const media = await this.prisma.productMedia.findUnique({
      where: { id },
      include: { product: { select: { userId: true, businessId: true } } },
    });
    if (!media) throw new NotFoundException('Média introuvable');
    const p = media.product;
    const owns = user.businessId ? p.businessId === user.businessId : p.userId === user.ownerId;
    if (!owns) throw new NotFoundException('Média introuvable');
    return this.prisma.productMedia.update({
      where: { id },
      data: {
        ...(body.audioUrl !== undefined && { audioUrl: body.audioUrl }),
        ...(body.caption !== undefined && { caption: body.caption }),
        ...(body.thumbnailUrl !== undefined && { thumbnailUrl: body.thumbnailUrl }),
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
    const owns = user.businessId ? p.businessId === user.businessId : p.userId === user.ownerId;
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
                variantGroup: true,
                variantLabel: true,
                media: { orderBy: { sortOrder: 'asc' }, select: { id: true, url: true, type: true, thumbnailUrl: true } },
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
            media: (media ?? []).map((m: any) => ({ id: m.id, url: m.url, type: m.type, thumbnailUrl: m.thumbnailUrl })),
          };
        }),
    };
  }

  // ── GET public feed / TikTok (no auth) ────────────────────────────────────

  @Public()
  @Get(':slug/feed')
  async getPublicFeed(@Param('slug') slug: string, @Query('visitor') visitor?: string) {
    const visitorId = visitor && UUID.test(visitor) ? visitor : null;
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
                media: {
                  orderBy: { sortOrder: 'asc' },
                  // No visitor id: the nil UUID matches no like.
                  include: { likes: { where: { visitorId: visitorId ?? NIL_UUID }, select: { visitorId: true } } },
                },
              },
            },
          },
        },
      },
    });
    if (!store || !store.active) throw new NotFoundException('Boutique introuvable');

    // In the database order; the visitor's page shuffles it.
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
        thumbnailUrl: m.thumbnailUrl,
        sortOrder: m.sortOrder,
        viewCount: m.viewCount,
        likeCount: m.likeCount,
        liked: m.likes.length > 0,
        product: {
          id: p.id,
          name: p.name,
          sellingPrice: displayPrice,
          bundleQty: sp.bundleQty ?? null,
          bundlePrice: sp.bundlePrice ? Number(sp.bundlePrice) : null,
          imageUrl: p.imageUrl,
          category: p.category,
          quantity: p.quantity,
        },
      }));
    });
  }

  // ── Reel views and likes (no auth) ─────────────────────────────────────────
  // The page sends a view once per reel per visit, after a moment on screen.

  @Public()
  @Post(':slug/feed/:mediaId/view')
  async viewReel(@Param('slug') slug: string, @Param('mediaId') mediaId: string) {
    await this.findStoreMedia(slug, mediaId);
    const media = await this.prisma.productMedia.update({
      where: { id: mediaId },
      data: { viewCount: { increment: 1 } },
      select: { viewCount: true },
    });
    return { viewCount: media.viewCount };
  }

  @Public()
  @Post(':slug/feed/:mediaId/like')
  async likeReel(
    @Param('slug') slug: string,
    @Param('mediaId') mediaId: string,
    @Body() body: { visitorId?: string; liked?: boolean },
  ) {
    if (!body.visitorId || !UUID.test(body.visitorId)) throw new BadRequestException('Visiteur invalide');
    await this.findStoreMedia(slug, mediaId);
    const key = { mediaId, visitorId: body.visitorId };

    // The like row decides: tapping twice, or on two tabs, never counts twice.
    const media = await this.prisma.$transaction(async tx => {
      if (body.liked !== false) {
        const added = await tx.productMediaLike.createMany({ data: [key], skipDuplicates: true });
        if (added.count) await tx.productMedia.update({ where: { id: mediaId }, data: { likeCount: { increment: 1 } } });
      } else {
        const removed = await tx.productMediaLike.deleteMany({ where: key });
        if (removed.count) await tx.productMedia.update({ where: { id: mediaId }, data: { likeCount: { decrement: removed.count } } });
      }
      return tx.productMedia.findUniqueOrThrow({ where: { id: mediaId }, select: { likeCount: true } });
    });
    return { liked: body.liked !== false, likeCount: media.likeCount };
  }

  // ── Store profile shown in the reels feed, and following (no auth) ────────

  @Public()
  @Get(':slug/profile')
  async getStoreProfile(@Param('slug') slug: string, @Query('visitor') visitor?: string) {
    const store = await this.prisma.onlineStore.findUnique({ where: { slug } });
    if (!store || !store.active) throw new NotFoundException('Boutique introuvable');
    const visitorId = visitor && UUID.test(visitor) ? visitor : null;

    const [followers, following, likes, storeProducts] = await Promise.all([
      this.prisma.storeFollower.count({ where: { storeId: store.id } }),
      visitorId ? this.prisma.storeFollower.count({ where: { storeId: store.id, visitorId } }) : 0,
      this.prisma.productMedia.aggregate({
        where: { product: { storeItems: { some: { storeId: store.id } } } },
        _sum: { likeCount: true },
      }),
      this.prisma.storeProduct.findMany({
        where: { storeId: store.id },
        select: { product: { select: { trackStock: true, quantity: true } } },
      }),
    ]);

    return {
      name: store.name,
      slug: store.slug,
      description: store.description,
      logoUrl: store.logoUrl,
      primaryColor: store.primaryColor,
      followers,
      following: following > 0,
      likes: likes._sum.likeCount ?? 0,
      // The products a visitor can see: the same rule as the catalogue.
      products: storeProducts.filter(sp => !(sp.product.trackStock && sp.product.quantity <= 0)).length,
    };
  }

  @Public()
  @Post(':slug/follow')
  async followStore(@Param('slug') slug: string, @Body() body: { visitorId?: string; following?: boolean }) {
    if (!body.visitorId || !UUID.test(body.visitorId)) throw new BadRequestException('Visiteur invalide');
    const store = await this.prisma.onlineStore.findUnique({ where: { slug } });
    if (!store || !store.active) throw new NotFoundException('Boutique introuvable');

    const key = { storeId: store.id, visitorId: body.visitorId };
    if (body.following !== false) {
      await this.prisma.storeFollower.createMany({ data: [key], skipDuplicates: true });
    } else {
      await this.prisma.storeFollower.deleteMany({ where: key });
    }
    const followers = await this.prisma.storeFollower.count({ where: { storeId: store.id } });
    return { following: body.following !== false, followers };
  }

  /** The reel, only if it belongs to an active store's product. */
  private async findStoreMedia(slug: string, mediaId: string) {
    if (!UUID.test(mediaId)) throw new NotFoundException('Reel introuvable');
    const media = await this.prisma.productMedia.findFirst({
      where: { id: mediaId, product: { storeItems: { some: { store: { slug, active: true } } } } },
      select: { id: true },
    });
    if (!media) throw new NotFoundException('Reel introuvable');
    return media;
  }

  // ── POST public order (no auth) ────────────────────────────────────────────

  @Public()
  @Post(':slug/order')
  async submitOrder(@Param('slug') slug: string, @Body() dto: OrderDto, @Headers('authorization') auth?: string) {
    const store = await this.prisma.onlineStore.findUnique({ where: { slug } });
    if (!store || !store.active) throw new NotFoundException('Boutique introuvable');
    // Optional: an order placed while signed in shows in the customer's history.
    const customer = await this.customers.optionalCustomer(auth);

    // One spelling for every order, whatever was typed: tidy text, and the number in the
    // international form WhatsApp and the follow-ups use.
    const line = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
    dto.customerName = line(dto.customerName, 100);
    if (dto.customerName.length < 2) throw new BadRequestException('Indiquez votre nom.');
    dto.customerPhone = `+${this.customers.normalizePhone(dto.customerPhone).international}`;
    dto.deliveryZone = line(dto.deliveryZone, 100);
    if (!dto.deliveryZone) throw new BadRequestException('Choisissez la ville de livraison.');
    dto.commune = line(dto.commune, 100);
    dto.avenue = line(dto.avenue, 200);
    if (!dto.commune || !dto.avenue) throw new BadRequestException("Indiquez la commune et l'avenue de livraison.");
    dto.reference = line(dto.reference, 200) || undefined;
    dto.notes = typeof dto.notes === 'string' ? dto.notes.trim().slice(0, 500) || undefined : undefined;
    // The position travels in the notes: the delivery partner's messages and portal show them.
    const position = positionLink(dto.location);
    const orderNotes = [dto.notes, position && `📍 Position GPS : ${position}`].filter(Boolean).join('\n') || null;
    const scheduledAt = wishedDeliveryDate(dto.deliveryDay);
    if (!dto.items?.length) throw new BadRequestException('Panier vide');

    // Prices and delivery fee come from the store, never from the browser. Lines for the
    // same product are merged so the bundle price applies as it does in the cart.
    const qtyByProduct = new Map<string, number>();
    for (const i of dto.items) {
      if (!Number.isInteger(i.qty) || i.qty <= 0) throw new BadRequestException('Quantité invalide');
      qtyByProduct.set(i.productId, (qtyByProduct.get(i.productId) ?? 0) + i.qty);
    }
    const storeProducts = await this.prisma.storeProduct.findMany({
      where: { storeId: store.id, productId: { in: [...qtyByProduct.keys()] } },
      include: { product: { select: { name: true, sellingPrice: true } } },
    });
    if (storeProducts.length !== qtyByProduct.size) {
      throw new BadRequestException("Un article de votre panier n'est plus disponible.");
    }
    const items = storeProducts.map(sp => {
      const qty = qtyByProduct.get(sp.productId)!;
      return {
        productId: sp.productId,
        name: sp.product.name,
        qty,
        unitPrice: lineTotal(Number(sp.storePrice ?? sp.product.sellingPrice), qty, sp.bundleQty, sp.bundlePrice ? Number(sp.bundlePrice) : null) / qty,
      };
    });
    const total = items.reduce((sum, i) => sum + i.qty * i.unitPrice, 0);

    const zones = (store.deliveryZones ?? []) as unknown as { city: string; fee: number }[];
    const zone = zones.find(z => z.city === dto.deliveryZone);
    if (zones.length > 0 && !zone) throw new BadRequestException('Zone de livraison invalide');
    const deliveryFee = zone?.fee ?? 0;

    // Attributed to THIS store's own business, not whichever business happens to be the
    // account's default. A multi-business account otherwise gets orders from store B's
    // public page silently filed under business A's Logistics queue (and disagreeing with
    // the businessId used for the socket event below).
    // store.businessId is the source of truth when set (the normal, post-migration case).
    // Only fall back to "the account's default business" for a legacy store never
    // backfilled with a businessId — same fallback chain used elsewhere in this codebase
    // (e.g. the WhatsApp label-triggered draft handler) when no business row resolves at all.
    const business = store.businessId
      ? await this.prisma.business.findUnique({ where: { id: store.businessId }, select: { id: true, whatsappPhone: true } })
      : await this.prisma.business.findFirst({
          where: { userId: store.userId },
          orderBy: { createdAt: 'asc' },
          select: { id: true, whatsappPhone: true },
        });
    const orderBusinessId = store.businessId ?? business?.id ?? store.userId;
    const businessWaPhone = business?.whatsappPhone ?? null;
    const addressParts = [dto.commune, dto.avenue, dto.reference].filter(Boolean);
    const address = addressParts.join(', ') || dto.deliveryZone;

    // All or nothing: the order always exists on both sides (storefront and Logistics),
    // linked, so a later status change on either side goes through the single shared path.
    const createOrder = () => this.prisma.$transaction(async tx => {
      await lockProducts(tx, items.map(i => i.productId));
      await assertStockAvailable(tx, items.map(i => ({ productId: i.productId, quantity: i.qty })), { storefront: true });

      const maxResult = await tx.manualOrder.aggregate({
        where: { userId: store.userId, businessId: orderBusinessId },
        _max: { orderNumber: true },
      });
      // A real order straight away, not a draft: it shows in Logistics as "En attente".
      const draft = await tx.manualOrder.create({
        data: {
          userId: store.userId,
          businessId: orderBusinessId,
          orderNumber: (maxResult._max.orderNumber ?? 0) + 1,
          customerName: dto.customerName.trim(),
          customerPhone: dto.customerPhone.trim(),
          city: dto.deliveryZone,
          address,
          deliveryFee,
          totalAmount: total,
          isDraft: false,
          status: 'pending',
          scheduledAt,
          notes: orderNotes,
          items: {
            create: items.map(i => ({ productId: i.productId, quantity: i.qty, unitPrice: i.unitPrice })),
          },
        },
        select: { id: true, orderNumber: true },
      });
      const order = await tx.storeOrder.create({
        data: {
          storeId: store.id,
          manualOrderId: draft.id,
          customerId: customer?.id ?? null,
          customerName: dto.customerName.trim(),
          customerPhone: dto.customerPhone.trim(),
          deliveryZone: dto.deliveryZone,
          items: items as any,
          totalAmount: total,
          deliveryFee,
          notes: orderNotes,
          utmSource: dto.utmSource ?? null,
          utmMedium: dto.utmMedium ?? null,
          utmCampaign: dto.utmCampaign ?? null,
          utmContent: dto.utmContent ?? null,
          source: dto.source === 'ikele' ? 'ikele' : null,
          status: 'pending',
        },
      });
      return { order, draft };
    }, { timeout: 20_000 });

    // Two orders at once can pick the same number: the unique index refuses one, which retries.
    let created: Awaited<ReturnType<typeof createOrder>> | undefined;
    for (let attempt = 1; !created; attempt++) {
      try {
        created = await createOrder();
      } catch (err: any) {
        if (err?.code !== 'P2002' || attempt === 3) throw err;
      }
    }
    const { order, draft } = created;

    // Not signed in: the order opens an account for this number, signed in on this device.
    const account = customer ? null : await this.customers.accountForOrder(order.id, dto.customerPhone, dto.customerName, dto.deviceVisitorId)
      .catch(err => { this.logger.warn(`accountForOrder failed for order ${order.id}: ${err?.message}`); return null; });
    // The delivery address joins the account's address book, ready for the next order.
    const accountId = customer?.id ?? account?.customer.id;
    if (accountId) {
      this.customers.rememberAddress(accountId, { city: dto.deliveryZone, commune: dto.commune, avenue: dto.avenue, reference: dto.reference })
        .catch(err => this.logger.warn(`rememberAddress failed for order ${order.id}: ${err?.message}`));
    }

    // Notify logistics dashboard via socket + push — same businessId as the row above,
    // so the real-time event and the persisted order can no longer disagree.
    this.whatsapp.emitDraftOrderCreated(store.userId, store.businessId ?? null, draft.id, draft.orderNumber);
    this.push.sendToUser(store.userId, {
      title: '🛒 Nouvelle commande !',
      body: `${dto.customerName} vient de commander sur ${store.name}`,
      url: '/#/logistics',
      tag: 'draft-order',
    }).catch(() => {});

    // Build order message text
    const ref = order.id.slice(0, 8).toUpperCase();
    const cur = store.currency ?? 'CDF';
    const lines = [
      `*Nouvelle commande — ${store.name}*`,
      '',
      '*Produits :*',
      ...items.map(i => `  • ${i.name}  x${i.qty}  —  ${i.unitPrice.toLocaleString('fr-FR')} ${cur}`),
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
      ...(scheduledAt ? [`*Livraison souhaitée :* ${scheduledAt.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Africa/Kinshasa' })}`] : []),
      ...(position ? [`*Position GPS :* ${position}`] : []),
      ...(dto.notes ? [`*Notes :* ${dto.notes}`] : []),
      '',
      `Réf : ${ref}`,
    ];

    const messageText = lines.join('\n');
    const destPhone = (businessWaPhone ?? store.whatsappPhone).replace(/\D/g, '');
    const waUrl = `https://wa.me/${destPhone}?text=${encodeURIComponent(messageText)}`;

    // Notify business internally (best-effort, non-blocking)
    this.whatsapp.notifyOrder(store.userId, store.businessId ?? null, destPhone, messageText).catch(() => {});

    // Always return waUrl so the client sends from their own number
    return { orderId: order.id, ref, waUrl, account };
  }
}
