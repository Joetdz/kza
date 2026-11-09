// Customer accounts of the online stores. Separate from the merchants' Supabase login:
// the session token lives in this browser and goes as "Authorization: Bearer".

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api';
const TOKEN_KEY = 'kza_customer_token';
const CUSTOMER_KEY = 'kza_customer';
/** The random id likes and follows are stored under (see PublicStore). */
export const VISITOR_KEY = 'kza_visitor_id';
/** The last store visited: it sends the verification codes. */
export const LAST_STORE_KEY = 'kza_last_store';

export interface Customer {
  id: string;
  name: string;
  phone: string;
  visitorId: string;
  preferredCategories: string[];
}

export interface CustomerAddress {
  id: string;
  label: string;
  city: string;
  commune: string;
  avenue: string;
  reference: string;
  isDefault: boolean;
}

export interface CustomerOrder {
  id: string;
  ref: string;
  createdAt: string;
  store: { name: string; slug: string; logoUrl: string | null; currency: string; primaryColor: string };
  items: { name: string; qty: number; unitPrice: number }[];
  totalAmount: number;
  deliveryFee: number;
  deliveryZone: string;
  status: string;
}

export interface FollowedStore {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  primaryColor: string;
  followers: number;
}

function read(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch { /* private mode: the session lasts for this page only */ }
}

export function customerToken(): string | null {
  return read(TOKEN_KEY);
}

/** The signed-in customer as last seen, for a first render before /me answers. */
export function cachedCustomer(): Customer | null {
  try { return JSON.parse(read(CUSTOMER_KEY) ?? 'null'); } catch { return null; }
}

function saveSession(session: { token: string; customer: Customer }) {
  write(TOKEN_KEY, session.token);
  write(CUSTOMER_KEY, JSON.stringify(session.customer));
  // From now on likes and follows count for the account, on this device too.
  write(VISITOR_KEY, session.customer.visitorId);
  return session.customer;
}

function clearSession() {
  write(TOKEN_KEY, null);
  write(CUSTOMER_KEY, null);
  // A fresh anonymous id: what is liked after logging out no longer counts for the account.
  write(VISITOR_KEY, null);
}

/** Authorization header for the store's own calls (an order placed while signed in). */
export function customerAuthHeader(): Record<string, string> {
  const token = customerToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}/customers${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...customerAuthHeader(), ...(init.headers ?? {}) },
  });
  const body = await res.json().catch(() => null);
  if (res.status === 401) clearSession();
  if (!res.ok) throw new Error(body?.message ?? 'Une erreur est survenue, réessaie.');
  return body as T;
}

const post = <T>(path: string, data: unknown) => call<T>(path, { method: 'POST', body: JSON.stringify(data) });
const deviceVisitorId = () => read(VISITOR_KEY) ?? undefined;

export const customerApi = {
  requestCode: (phone: string, purpose: 'signup' | 'reset', storeSlug: string | null) =>
    post<{ sent: boolean }>('/otp', { phone, purpose, storeSlug }),

  signup: async (data: { phone: string; code: string; name: string; password: string }) =>
    saveSession(await post('/signup', { ...data, deviceVisitorId: deviceVisitorId() })),

  login: async (phone: string, password: string) =>
    saveSession(await post('/login', { phone, password, deviceVisitorId: deviceVisitorId() })),

  resetPassword: async (data: { phone: string; code: string; password: string }) =>
    saveSession(await post('/reset-password', { ...data, deviceVisitorId: deviceVisitorId() })),

  changePassword: async (currentPassword: string, newPassword: string) =>
    saveSession(await post('/me/password', { currentPassword, newPassword })),

  logout: async () => {
    await post('/logout', {}).catch(() => {});
    clearSession();
  },

  me: async () => {
    const customer = await call<Customer>('/me');
    write(CUSTOMER_KEY, JSON.stringify(customer));
    return customer;
  },
  updateMe: (data: { name?: string; preferredCategories?: string[] }) =>
    call<Customer>('/me', { method: 'PATCH', body: JSON.stringify(data) }),
  categories: () => call<string[]>('/categories'),

  orders: () => call<CustomerOrder[]>('/me/orders'),
  following: () => call<FollowedStore[]>('/me/following'),

  addresses: () => call<CustomerAddress[]>('/me/addresses'),
  addAddress: (data: Omit<CustomerAddress, 'id' | 'isDefault'> & { isDefault?: boolean }) =>
    post<CustomerAddress>('/me/addresses', data),
  updateAddress: (id: string, data: Partial<Omit<CustomerAddress, 'id'>>) =>
    call<CustomerAddress>(`/me/addresses/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  removeAddress: (id: string) => call<{ id: string }>(`/me/addresses/${id}`, { method: 'DELETE' }),
};
