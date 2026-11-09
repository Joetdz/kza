import type { MonthlyClosing } from '@kza/shared';
import type { Product, Sale, Expense, SalesGoal, StockMovement, RecurringExpense, BudgetForecast } from '../types';
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

/** The reason a request was refused (a 4xx from the API), or the fallback. */
export function apiMessage(error: unknown, fallback: string): string {
  const match = error instanceof Error ? /^API 4\d\d: (.*)$/s.exec(error.message) : null;
  if (!match) return fallback;
  try {
    const { message } = JSON.parse(match[1]);
    return typeof message === 'string' ? message : fallback;
  } catch { return fallback; }
}

// ─── Products ────────────────────────────────────────────────
export const productsApi = {
  getAll: () => req<Product[]>('/products'),
  getReservations: () => req<Record<string, number>>('/products/reservations'),
  create: (body: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>) =>
    req<Product>('/products', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: Partial<Product>) =>
    req<Product>(`/products/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  remove: (id: string) =>
    req<{ id: string }>(`/products/${id}`, { method: 'DELETE' }),
  reconcile: () => req<{ products: Product[]; fixedCount: number }>('/products/reconcile', { method: 'POST' }),
  createVariants: (body: {
    group: string; labels: string[]; quantities?: Record<string, number>; prices?: Record<string, number>;
    category: string; alertThreshold: number; supplier: string; acquisitionCost: number; sellingPrice: number;
    imageUrl?: string; entryDate: string; trackStock: boolean;
  }) => req<Product[]>('/products/variants', { method: 'POST', body: JSON.stringify(body) }),
  renameVariantGroup: (from: string, to: string) =>
    req<Product[]>('/products/variant-groups/rename', { method: 'PATCH', body: JSON.stringify({ from, to }) }),
};

// ─── Movements ───────────────────────────────────────────────
export const movementsApi = {
  getAll: () => req<StockMovement[]>('/movements'),
  getByProduct: (productId: string) =>
    req<StockMovement[]>(`/movements/product/${productId}`),
  create: (body: Omit<StockMovement, 'id' | 'createdAt'> & { unitCost?: number }) =>
    req<StockMovement>('/movements', { method: 'POST', body: JSON.stringify(body) }),
  inventory: (body: { date: string; note?: string; lines: { productId: string; countedQuantity: number }[] }) =>
    req<{ products: Product[]; movements: StockMovement[] }>('/movements/inventory', { method: 'POST', body: JSON.stringify(body) }),
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

// ─── Recurring Expenses (salaires, loyers, créances...) ────────
export const recurringExpensesApi = {
  getAll: () => req<RecurringExpense[]>('/expenses/recurring'),
  create: (body: Omit<RecurringExpense, 'id' | 'createdAt' | 'updatedAt' | 'lastGeneratedMonth'>) =>
    req<RecurringExpense>('/expenses/recurring', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: Partial<RecurringExpense>) =>
    req<RecurringExpense>(`/expenses/recurring/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  remove: (id: string) =>
    req<{ id: string }>(`/expenses/recurring/${id}`, { method: 'DELETE' }),
};

// ─── Upload ──────────────────────────────────────────────────
const MAX_IMAGE_SIDE = 1600;
const SHRINK_ABOVE_BYTES = 300 * 1024;
const UPLOAD_STALL_MS = 120_000;

// Phone photos weigh several MB for no visible gain in the store. Animated or vector
// formats are left alone, and so is any image the conversion would not make lighter.
async function shrinkImage(file: File): Promise<File> {
  if (file.size <= SHRINK_ABOVE_BYTES || file.type === 'image/gif' || file.type === 'image/svg+xml') return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff'; // JPEG has no transparency
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], 'photo.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

// XMLHttpRequest rather than supabase.storage: fetch can't report upload progress.
// A transfer that stops moving fails instead of spinning forever.
async function putToStorage(bucket: string, path: string, file: File, onProgress?: (pct: number) => void): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let stalled = false;
    let watchdog: ReturnType<typeof setTimeout>;
    const armWatchdog = () => {
      clearTimeout(watchdog);
      watchdog = setTimeout(() => { stalled = true; xhr.abort(); }, UPLOAD_STALL_MS);
    };

    xhr.open('POST', `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/${bucket}/${path}`);
    xhr.setRequestHeader('Authorization', `Bearer ${session?.access_token ?? anonKey}`);
    xhr.setRequestHeader('apikey', anonKey);
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.setRequestHeader('cache-control', 'max-age=3600');
    if (file.type) xhr.setRequestHeader('Content-Type', file.type);

    xhr.upload.onprogress = e => {
      armWatchdog();
      if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      clearTimeout(watchdog);
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      if (xhr.status === 413) return reject(new Error('Fichier trop volumineux pour le stockage.'));
      let message = `Erreur ${xhr.status} pendant l'envoi.`;
      try { message = JSON.parse(xhr.responseText).message ?? message; } catch { /* not JSON: keep the fallback */ }
      reject(new Error(message));
    };
    xhr.onerror = () => { clearTimeout(watchdog); reject(new Error('Connexion perdue pendant l\'envoi.')); };
    xhr.onabort = () => {
      clearTimeout(watchdog);
      reject(new Error(stalled ? 'L\'envoi est bloqué : vérifie ta connexion puis réessaie.' : 'Envoi annulé.'));
    };

    armWatchdog();
    xhr.send(file);
  });
}

const THUMB_MAX_SIDE = 720;
const THUMB_TIMEOUT_MS = 15_000;

/**
 * A still of a video (half a second in), as a JPEG to upload: the grids show it instead
 * of loading every video. null when the browser can't read the video.
 */
export async function videoThumbnail(source: Blob | string): Promise<File | null> {
  const src = typeof source === 'string' ? source : URL.createObjectURL(source);
  const video = document.createElement('video');
  const wait = (event: 'loadeddata' | 'seeked') => new Promise<void>((resolve, reject) => {
    const timer = setTimeout(reject, THUMB_TIMEOUT_MS);
    video.addEventListener(event, () => { clearTimeout(timer); resolve(); }, { once: true });
    video.addEventListener('error', () => { clearTimeout(timer); reject(); }, { once: true });
  });
  try {
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    // A stored video is drawn only if its server allows it, or the canvas can't be read.
    if (typeof source === 'string') video.crossOrigin = 'anonymous';
    video.src = src;
    await wait('loadeddata');
    // Recorded videos may not know their length: Infinity or NaN.
    video.currentTime = Math.min(0.5, (Number.isFinite(video.duration) ? video.duration : 1) / 2);
    await wait('seeked');

    const scale = Math.min(1, THUMB_MAX_SIDE / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    if (!canvas.width || !canvas.height) return null;
    canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8));
    return blob ? new File([blob], 'thumbnail.jpg', { type: 'image/jpeg' }) : null;
  } catch {
    return null;
  } finally {
    video.removeAttribute('src');
    if (typeof source !== 'string') URL.revokeObjectURL(src);
  }
}

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

  uploadMedia: async (original: File, onProgress?: (pct: number) => void): Promise<string> => {
    const isVideo = original.type.startsWith('video/');
    const file = isVideo ? original : await shrinkImage(original);
    const prefix = isVideo ? 'videos' : 'images';
    const ext = file.name.split('.').pop() ?? (isVideo ? 'mp4' : 'jpg');
    const filename = `${prefix}/${crypto.randomUUID()}.${ext}`;
    await putToStorage('products', filename, file, onProgress);
    const { data } = supabase.storage.from('products').getPublicUrl(filename);
    return data.publicUrl;
  },

  /** A video's still, uploaded; null when it couldn't be made. Never fails the upload it goes with. */
  uploadVideoThumbnail: async (video: Blob | string): Promise<string | null> => {
    const still = await videoThumbnail(video);
    return still ? uploadApi.uploadMedia(still).catch(() => null) : null;
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
  thumbnailUrl: string | null;
  sortOrder: number;
  viewCount: number;
  likeCount: number;
  createdAt: string;
  product?: { id: string; name: string; imageUrl: string | null };
}

export type FeedItem = ProductMedia & {
  product: { id: string; name: string; sellingPrice: number; imageUrl: string | null; category: string; quantity: number };
};

export const mediaApi = {
  getAll: () => req<ProductMedia[]>('/store/my/media'),
  create: (body: { productId: string; url: string; type: string; caption?: string; audioUrl?: string; thumbnailUrl?: string }) =>
    req<ProductMedia>('/store/my/media', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: { audioUrl?: string | null; caption?: string; thumbnailUrl?: string | null }) =>
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

// ─── Budget prévisionnel ────────────────────────────────────────
export const budgetForecastApi = {
  /** Closed months (read-only history) and the business's current month. */
  closings: () => req<{ currentMonth: string | null; closings: MonthlyClosing[] }>('/goals/closings'),
  get: () => req<BudgetForecast>('/goals/budget-forecast'),
  update: (body: { startMonth?: string; monthlyGrowthPct?: number; horizonMonths?: number }) =>
    req<BudgetForecast>('/goals/budget-forecast', { method: 'PATCH', body: JSON.stringify(body) }),
  setProducts: (items: { productId: string; quantity: number; adBudgetOverride?: number | null }[]) =>
    req<BudgetForecast>('/goals/budget-forecast/products', { method: 'POST', body: JSON.stringify({ items }) }),
  addExpense: (body: { category: string; description?: string; amount: number }) =>
    req<BudgetForecast['expenses'][number]>('/goals/budget-forecast/expenses', { method: 'POST', body: JSON.stringify(body) }),
  updateExpense: (id: string, body: { category?: string; description?: string; amount?: number }) =>
    req<BudgetForecast['expenses'][number]>(`/goals/budget-forecast/expenses/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  removeExpense: (id: string) =>
    req<{ id: string }>(`/goals/budget-forecast/expenses/${id}`, { method: 'DELETE' }),
};

// ─── Levée de fonds (cagnottes) ──────────────────────────────────
export interface FundraisingInvestor {
  id: string;
  email: string;
  name: string;
  phone: string | null;
}

export interface FundraisingInvestment {
  id: string;
  campaignId: string;
  investorId: string;
  amount: number;
  repaymentAmount: number;
  repaymentDueDate: string | null;
  repaidAmount: number;
  repaidAt: string | null;
  status: 'pending' | 'partially_repaid' | 'repaid';
  investedAt: string;
  investor?: FundraisingInvestor;
}

export interface FundraisingCampaign {
  id: string;
  name: string;
  description: string;
  targetAmount: number;
  entryTicket: number;
  maxInvestors: number | null;
  repaymentDueDate: string | null;
  status: 'active' | 'closed';
  createdAt: string;
  updatedAt: string;
  investments: FundraisingInvestment[];
}

export const fundraisingApi = {
  listCampaigns: () => req<FundraisingCampaign[]>('/fundraising/campaigns'),
  getCampaign: (id: string) => req<FundraisingCampaign>(`/fundraising/campaigns/${id}`),
  createCampaign: (body: { name: string; description?: string; targetAmount: number; entryTicket: number; maxInvestors?: number | null; repaymentDueDate?: string | null }) =>
    req<FundraisingCampaign>('/fundraising/campaigns', { method: 'POST', body: JSON.stringify(body) }),
  updateCampaign: (id: string, body: Partial<{ name: string; description: string; targetAmount: number; entryTicket: number; maxInvestors: number | null; repaymentDueDate: string | null; status: 'active' | 'closed' }>) =>
    req<FundraisingCampaign>(`/fundraising/campaigns/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  removeCampaign: (id: string) =>
    req<{ id: string }>(`/fundraising/campaigns/${id}`, { method: 'DELETE' }),
  listInvestments: (campaignId: string) =>
    req<FundraisingInvestment[]>(`/fundraising/campaigns/${campaignId}/investments`),
  addInvestment: (campaignId: string, body: { investorEmail: string; investorName: string; investorPhone?: string; investorPassword?: string; amount: number; repaymentAmount?: number; repaymentDueDate?: string; investedAt?: string }) =>
    req<FundraisingInvestment>(`/fundraising/campaigns/${campaignId}/investments`, { method: 'POST', body: JSON.stringify(body) }),
  updateInvestment: (id: string, body: Partial<{ repaymentAmount: number; repaymentDueDate: string; repaidAmount: number; repaidAt: string; status: 'pending' | 'partially_repaid' | 'repaid' }>) =>
    req<FundraisingInvestment>(`/fundraising/investments/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  removeInvestment: (id: string) =>
    req<{ id: string }>(`/fundraising/investments/${id}`, { method: 'DELETE' }),
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

// ─── Équipe ──────────────────────────────────────────────────────
export interface TeamMember {
  id: string;
  userId: string;
  email: string | null;
  displayName: string | null;
  role: 'manager' | 'operator';
  createdAt: string;
}

export interface PendingInvite {
  id: string;
  token: string;
  role: 'manager' | 'operator';
  label: string | null;
  expiresAt: string;
  createdAt: string;
}

export interface InvitePreview {
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  role: 'manager' | 'operator';
  businessName: string;
  businessCity: string | null;
  businessLogo: string | null;
  expiresAt: string;
}

export const teamApi = {
  list: (businessId: string) =>
    req<{ members: TeamMember[]; pendingInvites: PendingInvite[] }>(`/businesses/${businessId}/team`),
  createInvite: (businessId: string, body: { role: 'manager' | 'operator'; label?: string }) =>
    req<PendingInvite>(`/businesses/${businessId}/team/invites`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  revokeInvite: (businessId: string, inviteId: string) =>
    req<{ id: string }>(`/businesses/${businessId}/team/invites/${inviteId}`, { method: 'DELETE' }),
  updateRole: (businessId: string, memberId: string, role: 'manager' | 'operator') =>
    req<TeamMember>(`/businesses/${businessId}/team/members/${memberId}`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    }),
  removeMember: (businessId: string, memberId: string) =>
    req<{ id: string }>(`/businesses/${businessId}/team/members/${memberId}`, { method: 'DELETE' }),

  peekInvite: (token: string) => req<InvitePreview>(`/invites?token=${encodeURIComponent(token)}`),
  acceptInvite: (token: string) =>
    req<{ businessId: string; businessName: string; role: 'manager' | 'operator' }>('/invites/accept', {
      method: 'POST',
      body: JSON.stringify({ token }),
    }),
};
