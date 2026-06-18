import type { Product, Sale, Expense, SalesGoal, StockMovement } from '../types';
import { supabase } from '../lib/supabase';

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api';

export const STATIC_BASE = BASE.replace(/\/api\/?$/, '');

function getCurrentBusinessId(): string {
  return localStorage.getItem('kza_business_id') ?? '';
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  const bizId = getCurrentBusinessId();

  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(bizId ? { 'X-Business-Id': bizId } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(`API ${res.status}: ${msg}`);
  }
  // 204 No Content
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ─── Products ────────────────────────────────────────────────
export const productsApi = {
  getAll: () => req<Product[]>('/products'),
  create: (body: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>) =>
    req<Product>('/products', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: Partial<Product>) =>
    req<Product>(`/products/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  remove: (id: string) =>
    req<{ id: string }>(`/products/${id}`, { method: 'DELETE' }),
  reconcile: () => req<{ products: Product[]; fixedCount: number }>('/products/reconcile', { method: 'POST' }),
};

// ─── Movements ───────────────────────────────────────────────
export const movementsApi = {
  getAll: () => req<StockMovement[]>('/movements'),
  getByProduct: (productId: string) =>
    req<StockMovement[]>(`/movements/product/${productId}`),
  create: (body: Omit<StockMovement, 'id' | 'createdAt'>) =>
    req<StockMovement>('/movements', { method: 'POST', body: JSON.stringify(body) }),
};

// ─── Sales ───────────────────────────────────────────────────
export const salesApi = {
  getAll: () => req<Sale[]>('/sales'),
  create: (body: Omit<Sale, 'id' | 'createdAt'>) =>
    req<Sale>('/sales', { method: 'POST', body: JSON.stringify(body) }),
  updateStatus: (id: string, status: string) =>
    req<Sale>(`/sales/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  remove: (id: string) =>
    req<{ id: string }>(`/sales/${id}`, { method: 'DELETE' }),
  suggestCustomers: (q: string) =>
    req<{ name: string; phone: string }[]>(`/sales/customers/suggest?q=${encodeURIComponent(q)}`),
  sendInvoice: (id: string, body: { phone: string; pdfBase64: string }) =>
    req<{ success: boolean }>(`/sales/${id}/send-invoice`, { method: 'POST', body: JSON.stringify(body) }),
};

// ─── Expenses ────────────────────────────────────────────────
export const expensesApi = {
  getAll: () => req<Expense[]>('/expenses'),
  create: (body: Omit<Expense, 'id' | 'createdAt'>) =>
    req<Expense>('/expenses', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: Partial<Expense>) =>
    req<Expense>(`/expenses/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  remove: (id: string) =>
    req<{ id: string }>(`/expenses/${id}`, { method: 'DELETE' }),
};

// ─── Upload ──────────────────────────────────────────────────
export const uploadApi = {
  uploadImage: async (file: File): Promise<string> => {
    const ext = file.name.split('.').pop() ?? 'jpg';
    const filename = `${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from('products').upload(filename, file, {
      cacheControl: '3600',
      upsert: false,
    });
    if (error) throw new Error(error.message);
    const { data } = supabase.storage.from('products').getPublicUrl(filename);
    return data.publicUrl;
  },

  uploadMedia: async (file: File): Promise<string> => {
    const isVideo = file.type.startsWith('video/');
    const prefix = isVideo ? 'videos' : 'images';
    const ext = file.name.split('.').pop() ?? (isVideo ? 'mp4' : 'jpg');
    const filename = `${prefix}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from('products').upload(filename, file, {
      cacheControl: '3600',
      upsert: false,
    });
    if (error) throw new Error(error.message);
    const { data } = supabase.storage.from('products').getPublicUrl(filename);
    return data.publicUrl;
  },

  uploadAudio: async (blob: Blob): Promise<string> => {
    const ext = blob.type.includes('ogg') ? 'ogg' : blob.type.includes('mp4') ? 'mp4' : 'webm';
    const filename = `audio/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from('products').upload(filename, blob, {
      cacheControl: '3600',
      upsert: false,
      contentType: blob.type || 'audio/webm',
    });
    if (error) throw new Error(error.message);
    const { data } = supabase.storage.from('products').getPublicUrl(filename);
    return data.publicUrl;
  },
};

// ─── Store Media ─────────────────────────────────────────────────────────────

export interface ProductMedia {
  id: string;
  productId: string;
  url: string;
  type: string;
  caption: string | null;
  audioUrl: string | null;
  sortOrder: number;
  createdAt: string;
  product?: { id: string; name: string; imageUrl: string | null };
}

export type FeedItem = ProductMedia & {
  product: { id: string; name: string; sellingPrice: number; imageUrl: string | null; category: string; quantity: number };
};

export const mediaApi = {
  getAll: () => req<ProductMedia[]>('/store/my/media'),
  create: (body: { productId: string; url: string; type: string; caption?: string; audioUrl?: string }) =>
    req<ProductMedia>('/store/my/media', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: { audioUrl?: string | null; caption?: string }) =>
    req<ProductMedia>(`/store/my/media/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  remove: (id: string) => req<{ id: string }>(`/store/my/media/${id}`, { method: 'DELETE' }),
  getFeed: (slug: string): Promise<FeedItem[]> =>
    fetch(`${BASE}/store/${slug}/feed`).then(r => r.json()),
};

export function resolveImageUrl(imageUrl: string | null | undefined): string | null {
  if (!imageUrl) return null;
  return imageUrl.startsWith('http') ? imageUrl : `${STATIC_BASE}${imageUrl}`;
}

// ─── Categories ──────────────────────────────────────────────

export interface ProductCategory {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  sortOrder: number;
  createdAt: string;
}

export const categoriesApi = {
  getAll: () => req<ProductCategory[]>('/categories'),
  getAllAdmin: () => req<ProductCategory[]>('/categories/all'),
  seed: () => req<{ seeded?: number; skipped?: boolean; count?: number }>('/categories/seed', { method: 'POST' }),
  create: (name: string) => req<ProductCategory>('/categories', { method: 'POST', body: JSON.stringify({ name }) }),
  update: (id: string, body: { name?: string; active?: boolean; sortOrder?: number }) =>
    req<ProductCategory>(`/categories/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  remove: (id: string) => req<void>(`/categories/${id}`, { method: 'DELETE' }),
};

// ─── Auth / Profile ──────────────────────────────────────────

export interface UserProfile {
  id: string;
  userId: string;
  companyName?: string;
  businessSector?: string;
  country?: string;
}

export const authApi = {
  getProfile: () => req<UserProfile | null>('/auth/profile'),
  saveProfile: (body: { companyName?: string; businessSector?: string; country?: string }) =>
    req<UserProfile>('/auth/profile', { method: 'POST', body: JSON.stringify(body) }),
};

// ─── Goals ───────────────────────────────────────────────────
export const goalsApi = {
  getAll: () => req<SalesGoal[]>('/goals'),
  create: (body: Omit<SalesGoal, 'id' | 'createdAt'>) =>
    req<SalesGoal>('/goals', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: Partial<SalesGoal>) =>
    req<SalesGoal>(`/goals/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  remove: (id: string) =>
    req<{ id: string }>(`/goals/${id}`, { method: 'DELETE' }),
};

// ─── Businesses ──────────────────────────────────────────────
export interface BusinessRecord {
  id: string;
  name: string;
  sector?: string;
  country: string;
  currency: string;
  whatsappPhone: string;
  phone?: string;
  city?: string;
  logoUrl?: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export const businessApi = {
  getAll: () => req<BusinessRecord[]>('/businesses'),
  create: (body: Omit<BusinessRecord, 'id' | 'createdAt' | 'updatedAt'>) =>
    req<BusinessRecord>('/businesses', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: Partial<Omit<BusinessRecord, 'id' | 'createdAt' | 'updatedAt'>>) =>
    req<BusinessRecord>(`/businesses/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  remove: (id: string) =>
    req<void>(`/businesses/${id}`, { method: 'DELETE' }),
  setDefault: (id: string) =>
    req<BusinessRecord>(`/businesses/${id}/set-default`, { method: 'POST' }),
};
