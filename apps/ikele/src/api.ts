import { customerAuthHeader } from '@web/api/customer';
import { visitorId } from '@web/pages/PublicStore';

export const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api';

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: customerAuthHeader() });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.message ?? 'Connexion impossible, réessaie.');
  return body as T;
}

async function postJson<T>(path: string, data: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...customerAuthHeader() },
    body: JSON.stringify(data),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.message ?? 'Connexion impossible, réessaie.');
  return body as T;
}

export interface Media {
  url: string;
  type: string;
  thumbnailUrl?: string | null;
}

export interface GlobalReel extends Media {
  id: string;
  caption: string | null;
  audioUrl: string | null;
  viewCount: number;
  likeCount: number;
  liked: boolean;
  store: { id: string; slug: string; name: string; logoUrl: string | null; primaryColor: string; currency: string; following: boolean };
  product: { id: string; name: string; category: string | null; imageUrl: string | null; quantity: number; sellingPrice: number };
}

export interface StoreCard {
  slug: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  primaryColor: string;
  category: string | null;
  followers: number;
  following: boolean;
  likes: number;
  products: number;
  covers: Media[];
}

export interface StoreProfileData {
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  primaryColor: string;
  followers: number;
  following: boolean;
  likes: number;
  products: number;
}

export interface StoreReel extends Media {
  id: string;
  caption: string | null;
  audioUrl: string | null;
  viewCount: number;
  likeCount: number;
  liked: boolean;
  product: { id: string; name: string; sellingPrice: number };
}

export interface StoreCatalog {
  slug: string;
  name: string;
  currency: string;
  primaryColor: string;
  products: {
    id: string;
    name: string;
    sellingPrice: number;
    comparePrice: number | null;
    imageUrl: string | null;
    quantity: number;
    media: (Media & { id: string })[];
  }[];
}

export interface SearchResults {
  products: { id: string; name: string; price: number; imageUrl: string | null; media: Media | null; store: { slug: string; name: string; currency: string; primaryColor: string } }[];
  stores: StoreCard[];
}

const v = () => encodeURIComponent(visitorId());

// The visitor counter: the app opened, a store seen (its profile, its reels, one of its
// reels watched in the feed). The server keeps one per device and day; this only spares
// sending the same one twice in a visit.
const visitsSent = new Set<string>();
export function recordVisit(storeSlug?: string) {
  const key = `${new Date().toDateString()}|${storeSlug ?? ''}`;
  if (visitsSent.has(key)) return;
  visitsSent.add(key);
  postJson('/ikele/visit', { visitorId: visitorId(), storeSlug }).catch(() => visitsSent.delete(key));
}

/** Everything a store's pages show: its profile, its reels, its products. */
export interface StorePages {
  profile: StoreProfileData;
  reels: StoreReel[];
  catalog: StoreCatalog;
}

// Kept for the visit: a store seen once opens again at once, refreshed behind.
const storePages = new Map<string, StorePages>();

export const cachedStorePages = (slug: string) => storePages.get(slug);

export async function loadStorePages(slug: string): Promise<StorePages> {
  const [profile, reels, catalog] = await Promise.all([
    getJson<StoreProfileData>(`/store/${slug}/profile?visitor=${v()}`),
    getJson<StoreReel[]>(`/store/${slug}/feed?visitor=${v()}`),
    getJson<StoreCatalog>(`/store/${slug}`),
  ]);
  const pages = { profile, reels, catalog };
  storePages.set(slug, pages);
  return pages;
}

/** A follow made on one page shows on the others. */
export function updateCachedProfile(slug: string, change: Partial<StoreProfileData>) {
  const pages = storePages.get(slug);
  if (pages) storePages.set(slug, { ...pages, profile: { ...pages.profile, ...change } });
}

export const ikeleApi = {
  feed: (exclude: string[]) =>
    getJson<{ items: GlobalReel[]; hasMore: boolean }>(`/ikele/feed?visitor=${v()}&exclude=${exclude.join(',')}`),
  stores: (q = '', category = '') =>
    getJson<StoreCard[]>(`/ikele/stores?visitor=${v()}&q=${encodeURIComponent(q)}&category=${encodeURIComponent(category)}`),
  search: (q: string) => getJson<SearchResults>(`/ikele/search?q=${encodeURIComponent(q)}`),
  categories: () => getJson<string[]>('/customers/categories'),

  follow: (slug: string, following: boolean) =>
    postJson<{ following: boolean; followers: number }>(`/store/${slug}/follow`, { visitorId: visitorId(), following }),
  like: (slug: string, reelId: string, liked: boolean) =>
    postJson<{ liked: boolean; likeCount: number }>(`/store/${slug}/feed/${reelId}/like`, { visitorId: visitorId(), liked }),
  view: (slug: string, reelId: string) => postJson<{ viewCount: number }>(`/store/${slug}/feed/${reelId}/view`, {}),
};
