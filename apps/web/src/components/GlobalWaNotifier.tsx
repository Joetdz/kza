import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '../contexts/AuthContext';

const WS_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api').replace('/api', '');

// ── Audio ─────────────────────────────────────────────────────────────────────

const audio = new Audio('/sounds/draft-order.mp3');
audio.volume = 1;
let unlocked = false;

// Unlock audio on first user gesture (browser autoplay policy)
document.addEventListener('click', () => {
  if (unlocked) return;
  audio.volume = 0;
  audio.play().then(() => {
    audio.pause();
    audio.currentTime = 0;
    audio.volume = 1;
    unlocked = true;
  }).catch(() => {});
}, { capture: true });

function playSound() {
  try {
    audio.currentTime = 0;
    audio.volume = 1;
    const p = audio.play();
    if (p) p.catch(() => {
      // Fallback: AudioContext chime
      try {
        const ctx = new AudioContext();
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
      } catch { /* blocked */ }
    });
  } catch { /* blocked */ }
}

// ── Component ─────────────────────────────────────────────────────────────────

let lastFired = 0; // debounce: prevent duplicate fires if two sockets active

export function GlobalWaNotifier() {
  const { session } = useAuth();
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const token = session?.access_token;
    if (!token) return;

    // Disconnect previous socket if session changed
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
      console.debug('[GlobalWaNotifier] draft-order-created', data);
      const now = Date.now();
      if (now - lastFired < 1500) return; // debounce
      lastFired = now;

      playSound();
      window.dispatchEvent(new CustomEvent('wa:draft-order-created', { detail: data }));
    });

    socketRef.current = sock;
    return () => { sock.disconnect(); socketRef.current = null; };
  }, [session?.access_token]);

  return null;
}
