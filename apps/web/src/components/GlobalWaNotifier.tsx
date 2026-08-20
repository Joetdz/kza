import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '../contexts/AuthContext';
import type { Session } from '@supabase/supabase-js';

const WS_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api').replace('/api', '');

// ── Audio ─────────────────────────────────────────────────────────────────────

const audio = new Audio('/sounds/draft-order.mp3');
audio.volume = 1;
let unlocked = false;

// Unlock audio on first user gesture — listen to both click AND touchstart for mobile
const unlockAudio = () => {
  if (unlocked) return;
  audio.volume = 0;
  audio.play().then(() => {
    audio.pause();
    audio.currentTime = 0;
    audio.volume = 1;
    unlocked = true;
  }).catch(() => {});
};
document.addEventListener('click', unlockAudio, { capture: true, passive: true });
document.addEventListener('touchstart', unlockAudio, { capture: true, passive: true });

// ── Notification permission ───────────────────────────────────────────────────

export function requestNotifPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

function showBrowserNotif() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    new Notification('🛒 Nouvelle commande !', {
      body: 'Un client vient de passer une commande.',
      icon: '/pwa-192x192.png',
      badge: '/pwa-64x64.png',
      tag: 'draft-order',
      // @ts-ignore — vibrate supported on Android Chrome
      vibrate: [200, 100, 200],
    });
  } catch { /* Firefox private mode etc */ }
}

// ── Sound ─────────────────────────────────────────────────────────────────────

function playSound() {
  // 1. Try the mp3 file
  try {
    audio.currentTime = 0;
    audio.volume = 1;
    const p = audio.play();
    if (p) {
      p.catch(() => {
        // 2. Fallback: AudioContext chime (desktop mostly)
        try {
          const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
          ctx.resume().then(() => {
            const notes = [
              { f: 1047, t: 0 },
              { f: 1319, t: 0.1 },
              { f: 1568, t: 0.2 },
              { f: 2093, t: 0.33 },
            ];
            notes.forEach(({ f, t }) => {
              const osc = ctx.createOscillator();
              const g = ctx.createGain();
              osc.connect(g); g.connect(ctx.destination);
              osc.type = 'sine'; osc.frequency.value = f;
              g.gain.setValueAtTime(0, ctx.currentTime + t);
              g.gain.linearRampToValueAtTime(0.5, ctx.currentTime + t + 0.01);
              g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.28);
              osc.start(ctx.currentTime + t);
              osc.stop(ctx.currentTime + t + 0.3);
            });
          }).catch(() => {});
        } catch { /* blocked */ }

        // 3. On mobile: browser notification plays system sound
        showBrowserNotif();
      });
      return;
    }
  } catch { /* blocked */ }

  // Also show notification as backup
  showBrowserNotif();
}

// ── Component ─────────────────────────────────────────────────────────────────

let lastFired = 0;

export function GlobalWaNotifier() {
  const { session } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  // Keep a ref to the current session so the socket handler always sees the latest userId
  const sessionRef = useRef<Session | null>(null);
  sessionRef.current = session ?? null;

  // Ask notification permission on mount (after user is logged in)
  useEffect(() => {
    if (session?.access_token) requestNotifPermission();
  }, [session?.access_token]);

  useEffect(() => {
    const token = session?.access_token;
    if (!token) return;

    socketRef.current?.disconnect();

    const sock = io(`${WS_URL}/whatsapp`, {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
    });

    sock.on('connect', () => {
      console.debug('[GlobalWaNotifier] socket connected');
    });

    sock.on('connect_error', (err) => {
      console.warn('[GlobalWaNotifier] connect error:', err.message);
    });

    sock.on('draft-order-created', (data: any) => {
      // Guard: only react if this event belongs to the currently authenticated user
      const currentUserId = sessionRef.current?.user?.id;
      if (data?.userId && currentUserId && data.userId !== currentUserId) {
        console.warn('[GlobalWaNotifier] draft-order-created ignored — userId mismatch', data.userId, currentUserId);
        return;
      }

      console.debug('[GlobalWaNotifier] draft-order-created', data);
      const now = Date.now();
      if (now - lastFired < 1500) return;
      lastFired = now;

      playSound();
      window.dispatchEvent(new CustomEvent('wa:draft-order-created', { detail: data }));
    });

    socketRef.current = sock;
    return () => { sock.disconnect(); socketRef.current = null; };
  }, [session?.access_token]);

  return null;
}
