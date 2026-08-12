import { supabase } from '../lib/supabase';

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api';

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  const bizId = localStorage.getItem('kza_business_id') ?? '';
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(bizId ? { 'X-Business-Id': bizId } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export interface LocationStock {
  id: string;
  locationId: string;
  productId: string;
  quantity: number;
  product: { id: string; name: string; sellingPrice: number; imageUrl: string | null };
  updatedAt: string;
}

export interface StockLocation {
  id: string;
  name: string;
  city: string;
  address: string | null;
  type: string;
  partnerId: string | null;
  partner: DeliveryPartner | null;
  stocks: LocationStock[];
  createdAt: string;
}

export interface DeliveryAgent {
  id: string;
  partnerId: string;
  name: string;
  phone: string | null;
  createdAt: string;
}

export interface DeliveryPartner {
  id: string;
  name: string;
  phone: string | null;
  city: string | null;
  type: string;
  token: string;
  hasPin?: boolean;
  whatsappGroupId: string | null;
  location: StockLocation | null;
  agents?: DeliveryAgent[];
  createdAt: string;
}

export interface WaGroup {
  id: string;      // e.g. "120363XXXXXX@g.us"
  name: string;
  participants: number;
}

export interface ManualOrderItem {
  id: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  product: { id: string; name: string; sellingPrice: number; imageUrl: string | null };
}

export interface ManualOrder {
  id: string;
  orderNumber: number;
  customerName: string;
  customerPhone: string | null;
  city: string;
  address: string;
  deliveryFee: number;
  totalAmount: number;
  status: string;
  isDraft: boolean;
  sourceContactId: string | null;
  notes: string | null;
  agentId: string | null;
  agent: DeliveryAgent | null;
  deliveryPersonName: string | null;
  scheduledAt: string | null;
  partnerId: string | null;
  locationId: string | null;
  partner: DeliveryPartner | null;
  location: StockLocation | null;
  items: ManualOrderItem[];
  createdAt: string;
  updatedAt: string;
}

export interface DailyReportOrder {
  num: number;
  id: string;
  orderNumber: number;
  city: string;
  address: string;
  customerName: string;
  customerPhone: string | null;
  agentName: string | null;
  collectedUsd: number;
  collectedCdf: number;
  totalAmount: number;
  deliveryFee: number;
  notes: string | null;
  items: { name: string; quantity: number }[];
  status: string;
}

export interface DailyReportSummary {
  date: string;
  total: number;
  delivered: number;
  failed: number;
  cancelled: number;
  totalCollectedUsd: number;
  totalCollectedCdf: number;
  totalDeliveryFees: number;
  soldeUsd: number;
  soldeCdf: number;
}

export interface DailyReport {
  date: string;
  partner: { id: string; name: string; city: string | null };
  orders: DailyReportOrder[];
  summary: {
    total: number;
    delivered: number;
    failed: number;
    cancelled: number;
    pending: number;
    successRate: number;
    totalCollectedUsd: number;
    totalCollectedCdf: number;
    totalDeliveryFees: number;
    soldeUsd: number;
    soldeCdf: number;
  };
  cumulativeSolde: { soldeUsd: number; soldeCdf: number };
  stock: { productName: string; stockStart: number; delivered: number; entries: number; stockCurrent: number }[];
}

export interface PartnerPayment {
  id: string;
  partnerId: string;
  partner?: { id: string; name: string; city: string | null };
  amount: number;
  currency: string;
  proofUrl: string | null;
  status: 'pending' | 'confirmed' | 'rejected';
  notes: string | null;
  confirmedAt: string | null;
  createdAt: string;
}

export interface PartnerFinances {
  totalOwed: number;
  totalPaid: number;
  balance: number;
  deliveredOrders: { id: string; orderNumber: number; customerName: string; totalAmount: number; createdAt: string }[];
  payments: PartnerPayment[];
}

export interface PartnerReport {
  partner: DeliveryPartner;
  locationStock: LocationStock[];
  ordersByStatus: Record<string, number>;
  totalOrders: number;
  orders: ManualOrder[];
  period: string;
  from: string;
  to: string;
}

export const logisticsApi = {
  // Locations
  getLocations: () => req<StockLocation[]>('/my/logistics/locations'),
  createLocation: (body: { name: string; city: string; address?: string; type?: string }) =>
    req<StockLocation>('/my/logistics/locations', { method: 'POST', body: JSON.stringify(body) }),
  updateLocation: (id: string, body: Partial<{ name: string; city: string; address: string }>) =>
    req<unknown>(`/my/logistics/locations/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteLocation: (id: string) =>
    req<unknown>(`/my/logistics/locations/${id}`, { method: 'DELETE' }),

  // Location stock allocations
  getLocationStock: (locationId: string) =>
    req<LocationStock[]>(`/my/logistics/locations/${locationId}/stock`),
  setLocationStock: (locationId: string, body: { productId: string; quantity: number }) =>
    req<LocationStock>(`/my/logistics/locations/${locationId}/stock`, { method: 'POST', body: JSON.stringify(body) }),
  getProductAllocations: (productId: string) =>
    req<LocationStock[]>(`/my/logistics/products/${productId}/allocations`),

  // Partners
  getPartners: () => req<DeliveryPartner[]>('/my/logistics/partners'),
  createPartner: (body: { name: string; phone?: string; city?: string; type?: string }) =>
    req<DeliveryPartner>('/my/logistics/partners', { method: 'POST', body: JSON.stringify(body) }),
  updatePartner: (id: string, body: Partial<{ name: string; phone: string; city: string; type: string; whatsappGroupId: string | null }>) =>
    req<unknown>(`/my/logistics/partners/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  getWaGroups: () => req<WaGroup[]>('/whatsapp/groups'),
  deletePartner: (id: string) =>
    req<unknown>(`/my/logistics/partners/${id}`, { method: 'DELETE' }),
  getPartnerReport: (partnerId: string, period: 'daily' | 'weekly' | 'monthly') =>
    req<PartnerReport>(`/my/logistics/partners/${partnerId}/report?period=${period}`),
  getDailyReport: (partnerId: string, date: string) =>
    req<DailyReport>(`/my/logistics/partners/${partnerId}/daily-report?date=${date}`),

  // Orders
  getOrders: () => req<ManualOrder[]>('/my/logistics/orders'),
  createOrder: (body: {
    customerName: string;
    customerPhone?: string;
    city: string;
    address: string;
    deliveryFee: number;
    notes?: string;
    partnerId?: string;
    locationId?: string;
    scheduledAt?: string;
    items: { productId: string; quantity: number; unitPrice: number }[];
  }) => req<ManualOrder>('/my/logistics/orders', { method: 'POST', body: JSON.stringify(body) }),
  updateStatus: (id: string, status: string, deliveryPersonName?: string, partnerId?: string, collectedUsd?: number, collectedCdf?: number) =>
    req<unknown>(`/my/logistics/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status, deliveryPersonName, partnerId, collectedUsd, collectedCdf }) }),
  reschedule: (id: string, scheduledAt: string | null) =>
    req<unknown>(`/my/logistics/orders/${id}/reschedule`, { method: 'PATCH', body: JSON.stringify({ scheduledAt }) }),
  notifyPartner: (orderId: string) =>
    req<{ sent: boolean; reason?: string }>(`/my/logistics/orders/${orderId}/notify-partner`, { method: 'POST' }),
  deleteOrder: (id: string) =>
    req<unknown>(`/my/logistics/orders/${id}`, { method: 'DELETE' }),
  editDraft: (id: string, body: {
    customerName?: string; customerPhone?: string; city?: string; address?: string;
    deliveryFee?: number; notes?: string; partnerId?: string;
    items?: { productId: string; quantity: number; unitPrice: number }[];
  }) => req<ManualOrder>(`/my/logistics/orders/${id}/edit-draft`, { method: 'PATCH', body: JSON.stringify(body) }),
  confirmDraft: (id: string) =>
    req<ManualOrder>(`/my/logistics/orders/${id}/confirm-draft`, { method: 'POST' }),

  // Partner portal (public — no auth token)
  partnerPortal: {
    getOrders: (token: string): Promise<DeliveryPartner & { orders: ManualOrder[]; hasPin: boolean }> =>
      fetch(`${BASE}/partner-portal/${token}`).then(r => r.json()),
    auth: (token: string, pin: string): Promise<{ ok: boolean; setup?: boolean; error?: string }> =>
      fetch(`${BASE}/partner-portal/${token}/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      }).then(r => r.json()),
    updateOrderStatus: (token: string, orderId: string, body: { status: string; deliveryPersonName?: string; collectedUsd?: number; collectedCdf?: number }): Promise<ManualOrder> =>
      fetch(`${BASE}/partner-portal/${token}/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then(r => r.json()),
    reschedule: (token: string, orderId: string, scheduledAt: string | null): Promise<ManualOrder> =>
      fetch(`${BASE}/partner-portal/${token}/orders/${orderId}/reschedule`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduledAt }),
      }).then(r => r.json()),
    getAgents: (token: string): Promise<DeliveryAgent[]> =>
      fetch(`${BASE}/partner-portal/${token}/agents`).then(r => r.json()),
    addAgent: (token: string, body: { name: string; phone?: string }): Promise<DeliveryAgent> =>
      fetch(`${BASE}/partner-portal/${token}/agents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then(r => r.json()),
    removeAgent: (token: string, agentId: string): Promise<unknown> =>
      fetch(`${BASE}/partner-portal/${token}/agents/${agentId}`, { method: 'DELETE' }).then(r => r.json()),
    assignAgent: (token: string, orderId: string, agentId: string | null): Promise<ManualOrder> =>
      fetch(`${BASE}/partner-portal/${token}/orders/${orderId}/assign-agent`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId }),
      }).then(r => r.json()),
    getDailyReport: (token: string, date: string): Promise<DailyReport> =>
      fetch(`${BASE}/partner-portal/${token}/daily-report?date=${date}`).then(r => {
        if (!r.ok) throw new Error(`API ${r.status}`);
        return r.json();
      }),
    getReportsHistory: (token: string, from: string, to: string): Promise<DailyReportSummary[]> =>
      fetch(`${BASE}/partner-portal/${token}/reports-history?from=${from}&to=${to}`).then(r => {
        if (!r.ok) throw new Error(`API ${r.status}`);
        return r.json();
      }),
    getFinances: (token: string): Promise<PartnerFinances> =>
      fetch(`${BASE}/partner-portal/${token}/finances`).then(r => {
        if (!r.ok) throw new Error(`API ${r.status}`);
        return r.json();
      }),
    createPayment: (token: string, body: { amount: number; currency?: string; proofUrl?: string; notes?: string }): Promise<PartnerPayment> =>
      fetch(`${BASE}/partner-portal/${token}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then(r => {
        if (!r.ok) throw new Error(`API ${r.status}`);
        return r.json();
      }),
  },

  // Admin — versements
  getPayments: (status?: string) =>
    req<PartnerPayment[]>(`/my/logistics/payments${status ? `?status=${status}` : ''}`),
  confirmPayment: (id: string, notes?: string) =>
    req<PartnerPayment>(`/my/logistics/payments/${id}/confirm`, { method: 'PATCH', body: JSON.stringify({ notes }) }),
  rejectPayment: (id: string, notes?: string) =>
    req<PartnerPayment>(`/my/logistics/payments/${id}/reject`, { method: 'PATCH', body: JSON.stringify({ notes }) }),

  resetPartnerPin: (id: string) =>
    req<unknown>(`/my/logistics/partners/${id}/reset-pin`, { method: 'PATCH' }),

  // Follow-up automatique
  getFollowUpConfig: () => req<FollowUpConfig>('/my/logistics/followup/config'),
  updateFollowUpConfig: (body: Partial<FollowUpConfig>) =>
    req<FollowUpConfig>('/my/logistics/followup/config', { method: 'PATCH', body: JSON.stringify(body) }),
  getFollowUpHistory: (limit?: number) =>
    req<FollowUpEntry[]>(`/my/logistics/followup/history${limit ? `?limit=${limit}` : ''}`),
  previewRelance: () => req<ManualOrder[]>('/my/logistics/followup/preview-relance'),
  previewLoyalty: () => req<ManualOrder[]>('/my/logistics/followup/preview-loyalty'),
  triggerRelance: () =>
    req<{ sent: number }>('/my/logistics/followup/trigger-relance', { method: 'POST' }),
  triggerLoyalty: () =>
    req<{ sent: number }>('/my/logistics/followup/trigger-loyalty', { method: 'POST' }),
};

export interface FollowUpConfig {
  id: string;
  userId: string;
  relanceEnabled: boolean;
  relanceDelayH: number;
  relanceTemplate: string;
  loyaltyEnabled: boolean;
  loyaltyDelayH: number;
  loyaltyTemplate: string;
  createdAt: string;
  updatedAt: string;
}

export interface FollowUpEntry {
  id: string;
  userId: string;
  orderId: string;
  type: 'relance' | 'loyalty';
  phone: string;
  message: string;
  sentAt: string;
}
