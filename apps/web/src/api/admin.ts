import { supabase } from '../lib/supabase';

const BASE = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api');

async function req<T>(path: string): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(`API ${res.status}: ${msg}`);
  }
  return res.json() as Promise<T>;
}

export interface AdminStats {
  totalClients: number;
  waConnected: number;
  totalAudience: number;
  totalCrmContacts: number;
  totalLeads: number;
  totalProducts: number;
  totalSales: number;
  totalExpenses: number;
  leadsBreakdown: Record<string, number>;
  recentSyncs: Array<{ clientId: string; syncedAt: string | null; waAccountId: string | null }>;
}

export interface AdminClient {
  userId: string;
  companyName: string | null;
  businessSector: string | null;
  waConnected: boolean;
  waPhone: string | null;
  audienceCount: number;
  crmContactCount: number;
  lastSeenAt: string;
}

export interface GrowthPoint {
  day: string;
  count: number;
}

export interface FunnelStep {
  status: string;
  count: number;
}

export interface AdminAudienceContact {
  id: string;
  clientId: string;
  clientCompany: string | null;
  clientSector: string | null;
  phoneNumber: string;
  displayName: string | null;
  waAccountId: string | null;
  businessSector: string | null;
  source: string;
  syncedAt: string | null;
  consentStatus: string;
  contactStatus: string;
  tags: string[];
  segments: string[];
  lastContactedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminLead {
  id: string;
  userId: string;
  clientCompany: string | null;
  phone: string;
  displayName: string | null;
  leadStatus: string;
  leadScore: number;
  leadName: string | null;
  leadNeed: string | null;
  leadBudget: string | null;
  leadCity: string | null;
  leadUrgency: string | null;
  leadProduct: string | null;
  assignedAgent: string | null;
  aiEnabled: boolean;
  lastMessageAt: string | null;
  source: string | null;
  tags: Array<{ tag: { id: string; name: string; color: string } }>;
  createdAt: string;
}

export interface PagedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface AdminOverview {
  totalUsers: number;
  totalBusinesses: number;
  waConnected: number;
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  totalSalesCount: number;
  salesBreakdown: { paid: number; pending: number; cancelled: number };
  totalProducts: number;
  revenueByDay: Array<{ day: string; revenue: number; salesCount: number }>;
  topBusinesses: Array<{
    id: string;
    name: string;
    currency: string;
    logoUrl: string | null;
    revenue: number;
    saleCount: number;
    expenseTotal: number;
    productCount: number;
    profit: number;
  }>;
}

export interface AdminBusiness {
  id: string;
  name: string;
  ownerEmail: string | null;
  sector: string | null;
  city: string | null;
  country: string;
  currency: string;
  whatsappPhone: string;
  phone: string | null;
  logoUrl: string | null;
  isDefault: boolean;
  waConnected: boolean;
  productCount: number;
  saleCount: number;
  createdAt: string;
}

export interface RevenueDetail {
  byChannel: Array<{ channel: string; revenue: number; count: number }>;
  topSales: Array<{ id: string; date: string; channel: string; customer: string | null; total: number; businessName: string | null }>;
  byBusiness: Array<{ name: string; currency: string; revenue: number; saleCount: number }>;
}

export interface SalesDetail {
  byChannel: Array<{ channel: string; status: string; count: number }>;
  recentSales: Array<{ id: string; date: string; channel: string; status: string; customer: string | null; total: number; businessName: string | null }>;
}

export interface ExpensesDetail {
  byCategory: Array<{ category: string; total: number; count: number }>;
  byBusiness: Array<{ name: string; total: number; count: number }>;
  recent: Array<{ id: string; category: string; amount: number; description: string; date: string; businessName: string | null }>;
}

export interface ProductsDetail {
  topByRevenue: Array<{ id: string; name: string; revenue: number; qtySold: number; businessName: string | null; stock: number }>;
  lowStockCount: number;
  activeCount: number;
}

export type UserDetail = {
  id: string; email: string; createdAt: string;
  businessCount: number; businesses: string[]; waConnected: boolean;
};

export const adminApi = {
  getOverview: () => req<AdminOverview>('/admin/overview'),
  getRevenueDetail: () => req<RevenueDetail>('/admin/detail/revenue'),
  getSalesDetail: () => req<SalesDetail>('/admin/detail/sales'),
  getExpensesDetail: () => req<ExpensesDetail>('/admin/detail/expenses'),
  getProductsDetail: () => req<ProductsDetail>('/admin/detail/products'),
  getUsersDetail: () => req<UserDetail[]>('/admin/detail/users'),
  getStats: () => req<AdminStats>('/admin/stats'),
  getClients: () => req<AdminClient[]>('/admin/clients'),
  getBusinesses: () => req<AdminBusiness[]>('/admin/businesses'),
  getAudienceGrowth: () => req<GrowthPoint[]>('/admin/audience-growth'),
  getLeadFunnel: () => req<FunnelStep[]>('/admin/lead-funnel'),

  getContacts: (params?: {
    page?: number; limit?: number; search?: string;
    clientId?: string; consentStatus?: string; contactStatus?: string; source?: string;
  }) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]))
    ).toString();
    return req<PagedResult<AdminAudienceContact>>(`/admin/contacts${qs ? `?${qs}` : ''}`);
  },

  getLeads: (params?: {
    page?: number; limit?: number; search?: string;
    clientId?: string; leadStatus?: string;
  }) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]))
    ).toString();
    return req<PagedResult<AdminLead>>(`/admin/leads${qs ? `?${qs}` : ''}`);
  },
};
