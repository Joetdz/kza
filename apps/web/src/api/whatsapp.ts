import { supabase } from '../lib/supabase';

const BASE = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api');

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
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const waApi = {
  // Connexion
  getStatus: () => req<{ connected: boolean; phone: string | null }>('/whatsapp/status'),
  connect: () => req<void>('/whatsapp/connect', { method: 'POST' }),
  disconnect: () => req<void>('/whatsapp/disconnect', { method: 'POST' }),

  // Contacts
  getContacts: (params?: { filter?: string; search?: string; tag?: string }) => {
    const qs = new URLSearchParams(params as any).toString();
    return req<any[]>(`/whatsapp/contacts${qs ? `?${qs}` : ''}`);
  },
  getContact: (id: string) => req<any>(`/whatsapp/contacts/${id}`),
  updateContact: (id: string, data: any) =>
    req<any>(`/whatsapp/contacts/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteContact: (id: string) => req<void>(`/whatsapp/contacts/${id}`, { method: 'DELETE' }),

  // Messages
  getMessages: (contactId: string) => req<any[]>(`/whatsapp/contacts/${contactId}/messages`),
  sendMessage: (contactId: string, message: string) =>
    req<void>(`/whatsapp/contacts/${contactId}/send`, { method: 'POST', body: JSON.stringify({ message }) }),
  markRead: (contactId: string) =>
    req<void>(`/whatsapp/contacts/${contactId}/read`, { method: 'PATCH' }),

  // Notes
  getNotes: (contactId: string) => req<any[]>(`/whatsapp/contacts/${contactId}/notes`),
  createNote: (contactId: string, content: string) =>
    req<any>(`/whatsapp/contacts/${contactId}/notes`, { method: 'POST', body: JSON.stringify({ content }) }),
  deleteNote: (noteId: string) => req<void>(`/whatsapp/notes/${noteId}`, { method: 'DELETE' }),

  // Tags
  getTags: () => req<any[]>('/whatsapp/tags'),
  createTag: (name: string, color?: string) =>
    req<any>('/whatsapp/tags', { method: 'POST', body: JSON.stringify({ name, color }) }),
  deleteTag: (tagId: string) => req<void>(`/whatsapp/tags/${tagId}`, { method: 'DELETE' }),
  addTagToContact: (contactId: string, tagId: string) =>
    req<void>(`/whatsapp/contacts/${contactId}/tags/${tagId}`, { method: 'POST' }),
  removeTagFromContact: (contactId: string, tagId: string) =>
    req<void>(`/whatsapp/contacts/${contactId}/tags/${tagId}`, { method: 'DELETE' }),

  // Config IA
  getAiConfig: () => req<any>('/whatsapp/ai-config'),
  updateAiConfig: (data: any) =>
    req<any>('/whatsapp/ai-config', { method: 'PATCH', body: JSON.stringify(data) }),

  // Base de connaissance
  getKb: () => req<any[]>('/whatsapp/kb'),
  createKb: (data: any) => req<any>('/whatsapp/kb', { method: 'POST', body: JSON.stringify(data) }),
  updateKb: (id: string, data: any) =>
    req<any>(`/whatsapp/kb/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteKb: (id: string) => req<void>(`/whatsapp/kb/${id}`, { method: 'DELETE' }),

  // Automatisations
  getAutomations: () => req<any[]>('/whatsapp/automations'),
  createAutomation: (data: any) =>
    req<any>('/whatsapp/automations', { method: 'POST', body: JSON.stringify(data) }),
  updateAutomation: (id: string, data: any) =>
    req<any>(`/whatsapp/automations/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteAutomation: (id: string) => req<void>(`/whatsapp/automations/${id}`, { method: 'DELETE' }),
};
