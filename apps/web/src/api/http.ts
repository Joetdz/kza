// Authenticated JSON request to the API, scoped to the selected business.
import { supabase } from '../lib/supabase';

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api';

export async function req<T>(path: string, init?: RequestInit): Promise<T> {
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
  if (!res.ok) {
    const raw = await res.text().catch(() => '');
    let message = `API ${res.status}`;
    try { message = JSON.parse(raw)?.message ?? message; } catch { if (raw) message = raw; }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
