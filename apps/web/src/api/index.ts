import type { Product, Sale, Expense, SalesGoal, StockMovement } from '../types';
import { supabase } from '../lib/supabase';

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api';

// URL de base pour les fichiers statiques (sans le préfixe /api)
export const STATIC_BASE = BASE.replace(/\/api\/?$/, '');

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`${BASE}/upload`, {
      method: 'POST',
      body: fd,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error('Erreur upload');
    const data = await res.json() as { url: string };
    return data.url;
  },
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
