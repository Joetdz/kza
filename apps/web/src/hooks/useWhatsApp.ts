import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { supabase } from '../lib/supabase';
import { waApi } from '../api/whatsapp';
import { useStore } from '../store/useStore';

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
  aiPausedUntil?: string | null;
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
  ack: number;
  fromAi: boolean;
  sentAt: string;
}

export interface SyncState {
  status: 'idle' | 'syncing' | 'done';
  imported: number;
  total: number;
}

export interface AudienceSyncState {
  status: 'idle' | 'syncing' | 'done';
  done: number;
  total: number;
}

export function useWhatsApp() {
  const currentBusinessId = useStore(s => s.currentBusinessId);
  const socketRef = useRef<Socket | null>(null);
  const loadedRef = useRef<Set<string>>(new Set()); // tracks which contactIds are fetched
  const pairingDoneRef = useRef(false); // true once pairing code received — ignore subsequent QR events

  const [statusLoaded, setStatusLoaded] = useState(false);
  const [connected, setConnected] = useState(false);
  const [phone, setPhone] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [loading, setLoading] = useState<{ percent: number; message: string } | null>(null);
  const [contacts, setContacts] = useState<WaContact[]>([]);
  const [messages, setMessages] = useState<Record<string, WaMessage[]>>({});
  const [socketReady, setSocketReady] = useState(false);
  const [sync, setSync] = useState<SyncState>({ status: 'idle', imported: 0, total: 0 });
  const [audienceSync, setAudienceSync] = useState<AudienceSyncState>({ status: 'idle', done: 0, total: 0 });
  const [pairingError, setPairingError] = useState<string | null>(null);

  // Stable load function — no dependency on messages state
  const loadMessages = useCallback(async (contactId: string, force = false) => {
    if (!force && loadedRef.current.has(contactId)) return;
    try {
      const data = await waApi.getMessages(contactId);
      loadedRef.current.add(contactId);
      setMessages(prev => ({ ...prev, [contactId]: data }));
    } catch { /* ignore */ }
  }, []);

  const loadContacts = useCallback(async (params?: { filter?: string; search?: string }) => {
    try {
      const data = await waApi.getContacts(params);
      setContacts(data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    let sock: Socket;

    supabase.auth.getSession().then(({ data: { session } }) => {
      sock = io(`${WS_URL}/whatsapp`, {
        auth: { token: session?.access_token },
        transports: ['websocket'],
      });

      sock.on('connect', () => setSocketReady(true));
      sock.on('disconnect', () => setSocketReady(false));

      // Each business has its own WhatsApp connection, but events reach every socket
      // of the user — drop anything that belongs to a business we're not showing.
      const onBiz = (event: string, handler: (payload: any) => void) => {
        sock.on(event, (payload: any) => {
          const current = localStorage.getItem('kza_business_id');
          if (payload?.businessId && current && payload.businessId !== current) return;
          handler(payload);
        });
      };

      onBiz('qr', ({ qr: q }: { qr: string }) => {
        if (pairingDoneRef.current) return; // pairing code already shown — ignore QR refreshes
        setQr(q);
        setPairingCode(null);
        setConnected(false);
        setLoading(null);
      });

      onBiz('pairing_code', ({ code }: { code: string }) => {
        pairingDoneRef.current = true;
        setPairingCode(code);
        setQr(null);
        setLoading(null);
        setPairingError(null);
      });

      onBiz('pairing_error', ({ message }: { message: string }) => {
        setPairingError(message);
        setPairingCode(null);
        setLoading(null);
      });

      onBiz('loading', ({ percent, message }: { percent: number; message: string }) => {
        setLoading({ percent, message });
      });

      onBiz('connected', ({ phone: p }: { phone: string }) => {
        setConnected(true);
        setPhone(p);
        setQr(null);
        setPairingCode(null);
        setPairingError(null);
        setLoading(null);
        loadContacts();
      });

      onBiz('disconnected', () => {
        pairingDoneRef.current = false;
        setConnected(false);
        setPhone(null);
        setLoading(null);
        setQr(null);
        setPairingCode(null);
        setPairingError(null);
        setMessages({});
        loadedRef.current.clear();
      });

      // Sync progress
      onBiz('sync-start', ({ total }: { total: number }) => {
        setSync({ status: 'syncing', imported: 0, total });
      });
      onBiz('sync-progress', ({ imported, total }: { imported: number; total: number }) => {
        setSync(prev => ({ ...prev, imported, total }));
      });
      onBiz('sync-complete', ({ imported, contacts: fresh }: { imported: number; contacts: WaContact[] }) => {
        setSync({ status: 'done', imported, total: imported });
        setContacts(fresh);
        // Clear message cache so they're re-fetched with correct IDs
        setMessages({});
        loadedRef.current.clear();
        setTimeout(() => setSync({ status: 'idle', imported: 0, total: 0 }), 4000);
      });

      // Audience sync progress
      onBiz('audience-sync-start', ({ total }: { total: number }) => {
        setAudienceSync({ status: 'syncing', done: 0, total });
      });
      onBiz('audience-sync-progress', ({ done, total }: { done: number; total: number }) => {
        setAudienceSync(prev => ({ ...prev, done, total }));
      });
      onBiz('audience-sync-complete', ({ total }: { total: number }) => {
        setAudienceSync({ status: 'done', done: total, total });
        setTimeout(() => setAudienceSync({ status: 'idle', done: 0, total: 0 }), 4000);
      });

      // Real-time incoming/outgoing message
      onBiz('message', ({ contact, message }: { contact: any; message: WaMessage }) => {
        // Add to message list if the contact is already loaded
        setMessages(prev => {
          if (!prev[message.contactId] && !loadedRef.current.has(message.contactId)) {
            // Contact messages not loaded yet — don't init with just one message,
            // it will be fetched on demand. Just return prev.
            return prev;
          }
          const existing = prev[message.contactId] ?? [];
          // Dedup by id
          if (existing.find(m => m.id === message.id)) return prev;
          return { ...prev, [message.contactId]: [...existing, message] };
        });

        // Update contact in list
        setContacts(prev => {
          const exists = prev.find(c => c.id === contact.id);
          if (!exists) {
            // New contact appeared — reload list
            loadContacts();
            return prev;
          }
          return prev.map(c =>
            c.id === contact.id
              ? {
                  ...c,
                  lastMessageAt: message.sentAt,
                  lastMessageText: message.content,
                  isRead: message.direction === 'out',
                }
              : c
          );
        });
      });

      // ACK checkmarks update
      onBiz('message-ack', ({ waId, ack }: { waId: string; ack: number }) => {
        setMessages(prev => {
          const updated: Record<string, WaMessage[]> = {};
          for (const [cid, msgs] of Object.entries(prev)) {
            updated[cid] = msgs.map(m => (m.waId === waId ? { ...m, ack } : m));
          }
          return updated;
        });
      });

      // Revoked message
      onBiz('message-revoked', ({ waId }: { waId: string }) => {
        setMessages(prev => {
          const updated: Record<string, WaMessage[]> = {};
          for (const [cid, msgs] of Object.entries(prev)) {
            updated[cid] = msgs.map(m =>
              m.waId === waId ? { ...m, content: '🚫 Message supprimé' } : m
            );
          }
          return updated;
        });
      });

      onBiz('lead-updated', (data: any) => {
        setContacts(prev => prev.map(c => (c.id === data.contactId ? { ...c, ...data } : c)));
      });
      onBiz('contact-updated', (data: any) => {
        setContacts(prev => prev.map(c => (c.id === data.contactId ? { ...c, ...data } : c)));
      });

      // draft-order-created is handled globally by GlobalWaNotifier (sound + event dispatch)

      socketRef.current = sock;
    });

    return () => { sock?.disconnect(); };
  }, [loadContacts]);

  const initConnect = useCallback(async () => { await waApi.connect(); }, []);

  const initConnectPairing = useCallback(async (phone: string) => {
    pairingDoneRef.current = false;
    await waApi.connectPairing(phone);
  }, []);

  const initDisconnect = useCallback(async () => {
    await waApi.disconnect();
    setConnected(false);
    setPhone(null);
    setQr(null);
    setContacts([]);
    setMessages({});
    loadedRef.current.clear();
  }, []);

  const sendMessage = useCallback(async (contactId: string, text: string, quotedMsgId?: string) => {
    await waApi.sendMessage(contactId, text, quotedMsgId);
  }, []);

  const updateContact = useCallback(async (id: string, data: Partial<WaContact>) => {
    const updated = await waApi.updateContact(id, data);
    setContacts(prev => prev.map(c => (c.id === id ? { ...c, ...updated } : c)));
    return updated;
  }, []);

  // Load status on mount and whenever the active business changes — each business has
  // its own WhatsApp connection, so the previous one's contacts must not linger.
  useEffect(() => {
    setStatusLoaded(false);
    setContacts([]);
    setMessages({});
    loadedRef.current.clear();
    pairingDoneRef.current = false;
    setQr(null);
    setPairingCode(null);
    setPairingError(null);

    waApi.getStatus().then(({ connected: c, phone: p }) => {
      setConnected(c);
      setPhone(p);
      if (c) loadContacts();
    }).catch(() => {}).finally(() => setStatusLoaded(true));
  }, [loadContacts, currentBusinessId]);

  return {
    statusLoaded, connected, phone, qr, pairingCode, pairingError, loading, contacts, messages, socketReady, sync, audienceSync,
    loadContacts, loadMessages, sendMessage, updateContact,
    initConnect, initConnectPairing, initDisconnect,
    setContacts, setMessages,
  };
}
