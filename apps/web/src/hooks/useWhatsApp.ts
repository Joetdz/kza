import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { supabase } from '../lib/supabase';
import { waApi } from '../api/whatsapp';

const WS_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api').replace('/api', '');

export interface WaContact {
  id: string;
  phone: string;
  displayName?: string;
  lastMessageText?: string;
  isRead: boolean;
  isArchived: boolean;
  assignedAgent?: string;
  lastMessageAt?: string;
  leadStatus: 'cold' | 'warm' | 'hot' | 'converted' | 'lost';
  leadScore: number;
  leadName?: string;
  leadNeed?: string;
  leadBudget?: string;
  leadCity?: string;
  leadUrgency?: string;
  leadProduct?: string;
  aiEnabled: boolean;
  source?: string;
  tags: Array<{ tag: { id: string; name: string; color: string } }>;
}

export interface WaMessage {
  id: string;
  contactId: string;
  waId?: string;
  direction: 'in' | 'out';
  content: string;
  mediaUrl?: string;
  mediaType?: string;
  quotedMsgId?: string;
  ack: number; // 0=pending 1=sent 2=delivered 3=read 4=played
  fromAi: boolean;
  sentAt: string;
}

export interface SyncState {
  status: 'idle' | 'syncing' | 'done';
  imported: number;
  total: number;
}

export function useWhatsApp() {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [phone, setPhone] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [loading, setLoading] = useState<{ percent: number; message: string } | null>(null);
  const [contacts, setContacts] = useState<WaContact[]>([]);
  const [messages, setMessages] = useState<Record<string, WaMessage[]>>({});
  const [socketReady, setSocketReady] = useState(false);
  const [sync, setSync] = useState<SyncState>({ status: 'idle', imported: 0, total: 0 });
  const [typingContacts, setTypingContacts] = useState<Set<string>>(new Set());

  useEffect(() => {
    let sock: Socket;

    supabase.auth.getSession().then(({ data: { session } }) => {
      sock = io(`${WS_URL}/whatsapp`, {
        auth: { token: session?.access_token },
        transports: ['websocket'],
      });

      sock.on('connect', () => setSocketReady(true));
      sock.on('disconnect', () => setSocketReady(false));

      sock.on('qr', ({ qr: q }: { qr: string }) => {
        setQr(q);
        setConnected(false);
        setLoading(null);
      });

      sock.on('loading', ({ percent, message }: { percent: number; message: string }) => {
        setLoading({ percent, message });
      });

      sock.on('connected', ({ phone: p }: { phone: string }) => {
        setConnected(true);
        setPhone(p);
        setQr(null);
        setLoading(null);
        loadContacts();
      });

      sock.on('disconnected', () => {
        setConnected(false);
        setPhone(null);
        setLoading(null);
      });

      // Sync events
      sock.on('sync-start', ({ total }: { total: number }) => {
        setSync({ status: 'syncing', imported: 0, total });
      });
      sock.on('sync-progress', ({ imported, total }: { imported: number; total: number }) => {
        setSync(prev => ({ ...prev, imported, total }));
      });
      sock.on('sync-complete', ({ imported, contacts: fresh }: { imported: number; contacts: WaContact[] }) => {
        setSync({ status: 'done', imported, total: imported });
        setContacts(fresh);
        setTimeout(() => setSync({ status: 'idle', imported: 0, total: 0 }), 4000);
      });

      // Real-time message
      sock.on('message', ({ contact, message }: { contact: any; message: WaMessage }) => {
        setMessages(prev => ({
          ...prev,
          [message.contactId]: [...(prev[message.contactId] ?? []), message],
        }));
        setContacts(prev => {
          const exists = prev.find(c => c.id === contact.id);
          if (!exists) { loadContacts(); return prev; }
          return prev.map(c =>
            c.id === contact.id
              ? { ...c, lastMessageAt: message.sentAt, lastMessageText: message.content, isRead: message.direction === 'out' }
              : c
          );
        });
      });

      // ACK update (checkmarks)
      sock.on('message-ack', ({ waId, ack }: { waId: string; ack: number }) => {
        setMessages(prev => {
          const updated = { ...prev };
          for (const [cid, msgs] of Object.entries(updated)) {
            updated[cid] = msgs.map(m => m.waId === waId ? { ...m, ack } : m);
          }
          return updated;
        });
      });

      // Revoked message
      sock.on('message-revoked', ({ waId }: { waId: string }) => {
        setMessages(prev => {
          const updated = { ...prev };
          for (const [cid, msgs] of Object.entries(updated)) {
            updated[cid] = msgs.map(m => m.waId === waId ? { ...m, content: '🚫 Message supprimé' } : m);
          }
          return updated;
        });
      });

      sock.on('lead-updated', (data: any) => {
        setContacts(prev => prev.map(c => c.id === data.contactId ? { ...c, ...data } : c));
      });
      sock.on('contact-updated', (data: any) => {
        setContacts(prev => prev.map(c => c.id === data.contactId ? { ...c, ...data } : c));
      });

      socketRef.current = sock;
    });

    return () => { sock?.disconnect(); };
  }, []);

  const loadContacts = useCallback(async (params?: { filter?: string; search?: string }) => {
    const data = await waApi.getContacts(params);
    setContacts(data);
  }, []);

  const loadMessages = useCallback(async (contactId: string, force = false) => {
    if (!force && messages[contactId]) return;
    const data = await waApi.getMessages(contactId);
    setMessages(prev => ({ ...prev, [contactId]: data }));
  }, [messages]);

  const initConnect = useCallback(async () => { await waApi.connect(); }, []);
  const initDisconnect = useCallback(async () => {
    await waApi.disconnect();
    setConnected(false); setPhone(null); setQr(null);
  }, []);

  const sendMessage = useCallback(async (contactId: string, text: string, quotedMsgId?: string) => {
    await waApi.sendMessage(contactId, text, quotedMsgId);
  }, []);

  const updateContact = useCallback(async (id: string, data: Partial<WaContact>) => {
    const updated = await waApi.updateContact(id, data);
    setContacts(prev => prev.map(c => c.id === id ? { ...c, ...updated } : c));
    return updated;
  }, []);

  // Load initial status
  useEffect(() => {
    waApi.getStatus().then(({ connected: c, phone: p }) => {
      setConnected(c); setPhone(p);
      if (c) loadContacts();
    }).catch(() => {});
  }, []);

  return {
    connected, phone, qr, loading, contacts, messages, socketReady, sync, typingContacts,
    loadContacts, loadMessages, sendMessage, updateContact,
    initConnect, initDisconnect,
    setContacts, setMessages,
  };
}
