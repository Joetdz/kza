import { Body, Controller, Get, Headers, Post, Query } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { CustomersService } from '../customers/customers.service';
import { IkeleStatsService } from './ikele-stats.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NIL_UUID = '00000000-0000-0000-0000-000000000000';
/** Reels considered for one page of the feed: the most recent ones. */
const FEED_CANDIDATES = 600;
const FEED_PAGE = 12;
const MAX_EXCLUDED = 300;
const NEW_STORE_DAYS = 14;

/** A store's visible products: the same rule as its catalogue. */
const inStock = (p: { trackStock: boolean; quantity: number }) => !p.trackStock || p.quantity > 0;

// Ikele, the marketplace of the Kzion stores: one feed for all of them, the store
// directory, search. Only stores listed on Ikele and still active; a store's own page,
// feed and ordering stay on the store routes, which also serve unlisted stores by link.
@Controller('ikele')
export class IkeleController {
  constructor(private prisma: PrismaService, private customers: CustomersService, private stats: IkeleStatsService) {}

  /** A visit, for the visitor counter: the app opened, or a store seen (storeSlug). */
  @Public()
  @Post('visit')
  visit(@Body() body: { visitorId?: string; storeSlug?: string }) {
    return this.stats.recordVisit(body?.visitorId, body?.storeSlug);
  }

  /**
   * "Pour toi": reels drawn at random, weighted by how well they do (likes and views),
   * how recent they are, whether the visitor follows the store or likes its kind of
   * products. New stores get a push. Never the same store twice in a row when avoidable.
   */
  @Public()
  @Get('feed')
  async feed(
    @Query('visitor') visitor?: string,
    @Query('exclude') exclude?: string,
    @Headers('authorization') auth?: string,
  ) {
    const visitorId = visitor && UUID.test(visitor) ? visitor : NIL_UUID;
    const excluded = (exclude ?? '').split(',').filter(id => UUID.test(id)).slice(0, MAX_EXCLUDED);
    const customer = await this.customers.optionalCustomer(auth);
    const preferred = new Set(customer?.preferredCategories ?? []);

    const media = await this.prisma.productMedia.findMany({
      where: {
        id: { notIn: excluded },
        product: { storeItems: { some: { store: { active: true, ikeleListed: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: FEED_CANDIDATES,
      include: {
        likes: { where: { visitorId }, select: { visitorId: true } },
        product: {
          select: {
            id: true, name: true, category: true, imageUrl: true, quantity: true, trackStock: true, sellingPrice: true,
            storeItems: {
              where: { store: { active: true, ikeleListed: true } },
              take: 1,
              select: {
                storePrice: true, bundleQty: true, bundlePrice: true,
                store: { select: { id: true, slug: true, name: true, logoUrl: true, primaryColor: true, currency: true, createdAt: true } },
              },
            },
          },
        },
      },
    });

    const storeIds = [...new Set(media.flatMap(m => m.product.storeItems.map(si => si.store.id)))];
    const followed = new Set(
      (await this.prisma.storeFollower.findMany({ where: { visitorId, storeId: { in: storeIds } }, select: { storeId: true } }))
        .map(f => f.storeId),
    );

    const now = Date.now();
    const scored = media.flatMap(m => {
      const listing = m.product.storeItems[0];
      if (!listing || !inStock(m.product)) return [];
      const ageDays = (now - m.createdAt.getTime()) / 86_400_000;
      const engagement = (m.likeCount * 4 + m.viewCount * 0.3 + 5) / (m.viewCount + 10);
      let score = engagement / Math.pow(ageDays + 1, 0.35);
      if (followed.has(listing.store.id)) score *= 1.6;
      if (m.product.category && preferred.has(m.product.category)) score *= 1.4;
      if ((now - listing.store.createdAt.getTime()) / 86_400_000 < NEW_STORE_DAYS) score *= 1.5;
      // Weighted random draw: a better reel comes first more often, never always.
      return [{ m, listing, key: Math.pow(Math.random(), 1 / score) }];
    }).sort((a, b) => b.key - a.key);

    // Spread the stores: take the next reel from another store when one is left.
    const page: typeof scored = [];
    const pool = [...scored];
    while (page.length < FEED_PAGE && pool.length) {
      const last = page[page.length - 1]?.listing.store.id;
      const i = pool.findIndex(c => c.listing.store.id !== last);
      page.push(pool.splice(i < 0 ? 0 : i, 1)[0]);
    }

    return {
      items: page.map(({ m, listing }) => ({
        id: m.id,
        url: m.url,
        type: m.type,
        caption: m.caption,
        audioUrl: m.audioUrl,
        thumbnailUrl: m.thumbnailUrl,
        viewCount: m.viewCount,
        likeCount: m.likeCount,
        liked: m.likes.length > 0,
        store: { ...listing.store, createdAt: undefined, following: followed.has(listing.store.id) },
        product: {
          id: m.product.id,
          name: m.product.name,
          category: m.product.category,
          imageUrl: m.product.imageUrl,
          quantity: m.product.quantity,
          sellingPrice: Number(listing.storePrice ?? m.product.sellingPrice),
          bundleQty: listing.bundleQty ?? null,
          bundlePrice: listing.bundlePrice ? Number(listing.bundlePrice) : null,
        },
      })),
      hasMore: pool.length > 0,
    };
  }

  /** Every store listed on Ikele, with its numbers and a few reels for the cover. */
  @Public()
  @Get('stores')
  async stores(@Query('q') q?: string, @Query('category') category?: string, @Query('visitor') visitor?: string) {
    const visitorId = visitor && UUID.test(visitor) ? visitor : NIL_UUID;
    const search = q?.trim();
    const stores = await this.prisma.onlineStore.findMany({
      where: {
        active: true,
        ikeleListed: true,
        ...(search ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { description: { contains: search, mode: 'insensitive' } }] } : {}),
        ...(category ? { products: { some: { product: { category } } } } : {}),
      },
      take: 100,
      select: {
        id: true, slug: true, name: true, description: true, logoUrl: true, primaryColor: true, createdAt: true,
        products: {
          select: {
            product: {
              select: {
                trackStock: true, quantity: true, category: true, imageUrl: true,
                media: { select: { url: true, type: true, thumbnailUrl: true, likeCount: true }, orderBy: { createdAt: 'desc' }, take: 3 },
              },
            },
          },
        },
      },
    });

    const ids = stores.map(s => s.id);
    const [followerCounts, mine] = await Promise.all([
      this.prisma.storeFollower.groupBy({ by: ['storeId'], where: { storeId: { in: ids } }, _count: { _all: true } }),
      this.prisma.storeFollower.findMany({ where: { visitorId, storeId: { in: ids } }, select: { storeId: true } }),
    ]);
    const followers = new Map(followerCounts.map(c => [c.storeId, c._count._all]));
    const following = new Set(mine.map(f => f.storeId));

    return stores
      .map(s => {
        const visible = s.products.map(sp => sp.product).filter(inStock);
        const media = visible.flatMap(p => p.media);
        const categories = visible.map(p => p.category).filter((c): c is string => !!c);
        // The store's main kind of product: its most frequent category.
        const mainCategory = [...new Set(categories)].sort((a, b) =>
          categories.filter(c => c === b).length - categories.filter(c => c === a).length)[0] ?? null;
        return {
          slug: s.slug,
          name: s.name,
          description: s.description,
          logoUrl: s.logoUrl,
          primaryColor: s.primaryColor,
          category: mainCategory,
          followers: followers.get(s.id) ?? 0,
          following: following.has(s.id),
          likes: media.reduce((n, m) => n + m.likeCount, 0),
          products: visible.length,
          covers: [
            ...media.map(m => ({ url: m.url, type: m.type, thumbnailUrl: m.thumbnailUrl })),
            ...visible.filter(p => p.imageUrl).map(p => ({ url: p.imageUrl!, type: 'image', thumbnailUrl: null })),
          ].slice(0, 3),
        };
      })
      // Stores with something to show first, then the most followed.
      .sort((a, b) => Number(b.products > 0) - Number(a.products > 0) || b.followers - a.followers || b.likes - a.likes);
  }

  /** Products and stores matching a few words, on the listed stores only. */
  @Public()
  @Get('search')
  async search(@Query('q') q?: string) {
    const search = q?.trim();
    if (!search || search.length < 2) return { products: [], stores: [] };

    const [products, stores] = await Promise.all([
      this.prisma.storeProduct.findMany({
        where: {
          store: { active: true, ikeleListed: true },
          product: {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { category: { contains: search, mode: 'insensitive' } },
            ],
          },
        },
        take: 60,
        select: {
          storePrice: true,
          store: { select: { slug: true, name: true, currency: true, primaryColor: true } },
          product: {
            select: {
              id: true, name: true, sellingPrice: true, imageUrl: true, quantity: true, trackStock: true,
              media: { select: { url: true, type: true, thumbnailUrl: true }, orderBy: { sortOrder: 'asc' }, take: 1 },
            },
          },
        },
      }),
      this.stores(search),
    ]);

    return {
      products: products
        .filter(sp => inStock(sp.product))
        .map(sp => ({
          id: sp.product.id,
          name: sp.product.name,
          price: Number(sp.storePrice ?? sp.product.sellingPrice),
          imageUrl: sp.product.imageUrl,
          media: sp.product.media[0] ?? null,
          store: sp.store,
        })),
      stores: stores.slice(0, 20),
    };
  }
}
