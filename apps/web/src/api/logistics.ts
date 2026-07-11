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

export interface DeliveryPartner {
  id: string;
  name: string;
  phone: string | null;
  city: string | null;
  type: string;
  token: string;
  location: StockLocation | null;
  createdAt: string;
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
  notes: string | null;
  deliveryPersonName: string | null;
  scheduledAt: string | null;
  partnerId: string | null;
  locationId: string | null;
  partner: DeliveryPartner | null;
  location: StockLocation | null;
  items: ManualOrderItem[];
  createdAt: string;
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
  updatePartner: (id: string, body: Partial<{ name: string; phone: string; city: string; type: string }>) =>
    req<unknown>(`/my/logistics/partners/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deletePartner: (id: string) =>
    req<unknown>(`/my/logistics/partners/${id}`, { method: 'DELETE' }),
  getPartnerReport: (partnerId: string, period: 'daily' | 'weekly' | 'monthly') =>
    req<PartnerReport>(`/my/logistics/partners/${partnerId}/report?period=${period}`),

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
  updateStatus: (id: string, status: string, deliveryPersonName?: string) =>
    req<unknown>(`/my/logistics/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status, deliveryPersonName }) }),
  notifyPartner: (orderId: string) =>
    req<{ sent: boolean; reason?: string }>(`/my/logistics/orders/${orderId}/notify-partner`, { method: 'POST' }),
  deleteOrder: (id: string) =>
    req<unknown>(`/my/logistics/orders/${id}`, { method: 'DELETE' }),

  // Partner portal (public — no auth token)
  partnerPortal: {
    getOrders: (token: string): Promise<DeliveryPartner & { orders: ManualOrder[] }> =>
      fetch(`${BASE}/partner-portal/${token}`).then(r => r.json()),
    updateOrderStatus: (token: string, orderId: string, body: { status: string; deliveryPersonName?: string }): Promise<ManualOrder> =>
      fetch(`${BASE}/partner-portal/${token}/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then(r => r.json()),
  },
};
