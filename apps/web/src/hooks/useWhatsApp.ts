import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { supabase } from '../lib/supabase';
import { waApi } from '../api/whatsapp';

const WS_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api')
  .replace('/api', '');

export interface WaContact {
  id: string;
  phone: string;
  displayName?: string;
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
  direction: 'in' | 'out';
  content: string;
  fromAi: boolean;
  sentAt: string;
}

export function useWhatsApp() {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [phone, setPhone] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [contacts, setContacts] = useState<WaContact[]>([]);
  const [messages, setMessages] = useState<Record<string, WaMessage[]>>({});
  const [socketReady, setSocketReady] = useState(false);

  // Init socket
  useEffect(() => {
    let sock: Socket;

    supabase.auth.getSession().then(({ data: { session } }) => {
      sock = io(`${WS_URL}/whatsapp`, {
        auth: { token: session?.access_token },
        transports: ['websocket'],
      });

      sock.on('connect', () => setSocketReady(true));
      sock.on('disconnect', () => setSocketReady(false));

      sock.on('qr', ({ qr }: { qr: string }) => {
        setQr(qr);
        setConnected(false);
      });

      sock.on('connected', ({ phone: p }: { phone: string }) => {
        setConnected(true);
        setPhone(p);
        setQr(null);
        // Load contacts
        loadContacts();
      });

      sock.on('disconnected', () => {
        setConnected(false);
        setPhone(null);
      });

      sock.on('message', ({ contact, message }: { contact: any; message: WaMessage }) => {
        // Add message to conversation
        setMessages(prev => ({
          ...prev,
          [message.contactId]: [...(prev[message.contactId] ?? []), message],
        }));

        // Update contact (lastMessageAt, isRead for inbound)
        setContacts(prev => {
          const exists = prev.find(c => c.id === contact.id);
          if (!exists) {
            loadContacts();
            return prev;
          }
          return prev.map(c =>
            c.id === contact.id
              ? { ...c, lastMessageAt: message.sentAt, isRead: message.direction === 'out' }
              : c
          );
        });
      });

      sock.on('lead-updated', (data: any) => {
        setContacts(prev =>
          prev.map(c => (c.id === data.contactId ? { ...c, ...data } : c))
        );
      });

      sock.on('contact-updated', (data: any) => {
        setContacts(prev =>
          prev.map(c => (c.id === data.contactId ? { ...c, ...data } : c))
        );
      });

      socketRef.current = sock;
    });

    return () => {
      sock?.disconnect();
    };
  }, []);

  const loadContacts = useCallback(async (params?: { filter?: string; search?: string }) => {
    const data = await waApi.getContacts(params);
    setContacts(data);
  }, []);

  const loadMessages = useCallback(async (contactId: string) => {
    if (messages[contactId]) return; // Already loaded
    const data = await waApi.getMessages(contactId);
    setMessages(prev => ({ ...prev, [contactId]: data }));
  }, [messages]);

  const initConnect = useCallback(async () => {
    await waApi.connect();
  }, []);

  const initDisconnect = useCallback(async () => {
    await waApi.disconnect();
    setConnected(false);
    setPhone(null);
    setQr(null);
  }, []);

  const sendMessage = useCallback(async (contactId: string, text: string) => {
    await waApi.sendMessage(contactId, text);
  }, []);

  const updateContact = useCallback(async (id: string, data: Partial<WaContact>) => {
    const updated = await waApi.updateContact(id, data);
    setContacts(prev => prev.map(c => (c.id === id ? { ...c, ...updated } : c)));
    return updated;
  }, []);

  // Load initial status
  useEffect(() => {
    waApi.getStatus().then(({ connected: c, phone: p }) => {
      setConnected(c);
      setPhone(p);
      if (c) loadContacts();
    }).catch(() => {});
  }, []);

  return {
    connected, phone, qr, contacts, messages, socketReady,
    loadContacts, loadMessages, sendMessage, updateContact,
    initConnect, initDisconnect,
    setContacts, setMessages,
  };
}
