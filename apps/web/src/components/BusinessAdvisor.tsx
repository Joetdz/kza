import { useState, useRef, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import {
  BrainCircuit, Send, Loader2, ChevronDown, Sparkles,
  Trash2, Mic, MicOff, PhoneCall, PhoneOff, X,
} from 'lucide-react';

const BASE = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api');

interface Msg { role: 'user' | 'assistant'; content: string }
interface Insight { priority: string; text: string }
type CallState = 'idle' | 'listening' | 'thinking' | 'speaking';

async function authReq<T>(path: string, init?: RequestInit): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function fetchAudio(text: string): Promise<HTMLAudioElement | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${BASE}/business-ai/speak`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({ text }),
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.onended = () => URL.revokeObjectURL(url);
    return audio;
  } catch { return null; }
}

const SUGGESTIONS = [
  'Quels sont mes produits les plus rentables ?',
  'Comment améliorer mon taux de conversion ?',
  'Quels leads devrais-je prioriser ?',
  'Analyse mon chiffre d\'affaires du mois',
  'Quelles actions pour augmenter mes ventes ?',
];

const WELCOME_TEXT = `Bonjour ! Je suis **Kayden Zion**, votre experte en développement business. J'ai accès à toutes vos données commerciales en temps réel.\n\nJe peux vous aider à :\n• Analyser vos ventes et identifier les tendances\n• Optimiser votre pipeline de leads\n• Identifier des opportunités de croissance\n• Donner des conseils stratégiques personnalisés\n\nQue souhaitez-vous explorer ?`;

const CALL_GREET = "Bonjour ! Kayden Zion à l'écoute. Comment puis-je vous aider aujourd'hui ?";

const CALL_STATUS: Record<CallState, string> = {
  idle: 'Touchez le micro pour parler',
  listening: 'Je vous écoute...',
  thinking: 'Je réfléchis...',
  speaking: 'Kayden répond...',
};

export function BusinessAdvisor() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'chat' | 'call'>('chat');
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 640);
  const [callState, setCallState] = useState<CallState>('idle');
  const [callStarted, setCallStarted] = useState(false);

  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recogRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const modeRef = useRef(mode);
  useEffect(() => { modeRef.current = mode; }, [mode]);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadInsights = useCallback(async () => {
    setInsightsLoading(true);
    try {
      const data = await authReq<{ insights: Insight[] }>('/business-ai/insights');
      setInsights(data.insights ?? []);
    } catch { /* ignore */ }
    finally { setInsightsLoading(false); }
  }, []);

  // Load history from API on open
  useEffect(() => {
    if (!open) return;
    authReq<{ messages: Msg[] }>('/business-ai/history')
      .then(({ messages: history }) => {
        if (history.length > 0) {
          setMessages(history);
        } else {
          loadInsights();
          setMessages([{ role: 'assistant', content: WELCOME_TEXT }]);
        }
      })
      .catch(() => {
        loadInsights();
        setMessages([{ role: 'assistant', content: WELCOME_TEXT }]);
      });
  }, [open, loadInsights]);

  const clearHistory = () => {
    authReq('/business-ai/history', { method: 'DELETE' }).catch(() => {});
    setInsights([]);
    loadInsights();
    setMessages([{ role: 'assistant', content: WELCOME_TEXT }]);
  };

  // Stop all audio and recognition
  const stopAll = useCallback(() => {
    recogRef.current?.stop();
    recogRef.current = null;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setCallState('idle');
  }, []);

  // Auto-listen after AI speaks in call mode
  const startListening = useCallback(() => {
    const SpeechRec = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SpeechRec) return;

    stopAll();
    const rec = new SpeechRec();
    rec.lang = 'fr-FR';
    rec.interimResults = false;
    rec.continuous = false;
    recogRef.current = rec;

    let captured = '';
    rec.onresult = (e: any) => {
      captured = Array.from<any>(e.results).map((r: any) => r[0].transcript).join('');
    };
    rec.onend = () => {
      if (captured.trim()) {
        sendCall(captured);
      } else {
        setCallState('idle');
      }
    };
    rec.onerror = () => setCallState('idle');
    rec.start();
    setCallState('listening');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopAll]);

  // Play voice and auto-listen after
  const speakAndListen = useCallback(async (text: string) => {
    stopAll();
    setCallState('speaking');
    const audio = await fetchAudio(text);
    if (!audio) { setCallState('idle'); return; }
    audioRef.current = audio;
    audio.onended = () => {
      URL.revokeObjectURL(audio.src);
      audioRef.current = null;
      if (modeRef.current === 'call') startListening();
      else setCallState('idle');
    };
    audio.play();
  }, [stopAll, startListening]);

  // Send in call mode (voice response + auto-listen)
  const sendCall = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;
    setCallState('thinking');
    setMessages(prev => [...prev, { role: 'user', content: text }]);

    try {
      const data = await authReq<{ message: string }>('/business-ai/chat', {
        method: 'POST',
        body: JSON.stringify({ message: text, history: messages, voiceMode: true }),
      });
      setMessages(prev => [...prev, { role: 'assistant', content: data.message }]);
      await speakAndListen(data.message);
    } catch {
      setCallState('idle');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, messages, speakAndListen]);

  // Send in chat mode (text response, no voice)
  const sendChat = useCallback(async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;
    setInput('');
    const userMsg: Msg = { role: 'user', content: msg };
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setLoading(true);
    try {
      const data = await authReq<{ message: string }>('/business-ai/chat', {
        method: 'POST',
        body: JSON.stringify({ message: msg, history: messages, voiceMode: false }),
      });
      setMessages(prev => [...prev, { role: 'assistant', content: data.message }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Désolé, une erreur s\'est produite. Réessayez.' }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages]);

  // Start the call
  const beginCall = useCallback(async () => {
    setCallStarted(true);
    setCallState('speaking');
    const audio = await fetchAudio(CALL_GREET);
    if (!audio) { setCallState('idle'); return; }
    audioRef.current = audio;
    audio.onended = () => {
      audioRef.current = null;
      if (modeRef.current === 'call') startListening();
      else setCallState('idle');
    };
    audio.play();
    setMessages(prev => {
      const hasGreet = prev.some(m => m.content === CALL_GREET);
      return hasGreet ? prev : [...prev, { role: 'assistant', content: CALL_GREET }];
    });
  }, [startListening]);

  // Switch mode
  const switchToCall = () => {
    setMode('call');
    setCallStarted(false);
    stopAll();
  };
  const switchToChat = () => {
    setMode('chat');
    stopAll();
  };

  const handleClose = () => {
    stopAll();
    setCallStarted(false);
    setOpen(false);
    setMode('chat');
  };

  const renderContent = (text: string) => {
    return text.split('\n').map((line, i) => {
      if (line.startsWith('**') && line.endsWith('**'))
        return <p key={i} className="font-semibold">{line.slice(2, -2)}</p>;
      if (line.startsWith('• ') || line.startsWith('- '))
        return <p key={i} className="pl-3">• {line.slice(2)}</p>;
      const parts = line.split(/\*\*(.*?)\*\*/g);
      return (
        <p key={i} className={line === '' ? 'h-2' : ''}>
          {parts.map((part, j) => j % 2 === 1 ? <strong key={j}>{part}</strong> : part)}
        </p>
      );
    });
  };

  const panelStyle: React.CSSProperties = isMobile
    ? { inset: 0, borderRadius: 0 }
    : { width: 420, height: 640, bottom: 24, right: 24, borderRadius: 20 };

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-full shadow-2xl text-white font-medium text-sm transition-all hover:scale-105 active:scale-95"
          style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
        >
          <BrainCircuit size={20} />
          <span>Kayden Zion</span>
          {insights.length > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-xs flex items-center justify-center font-bold">
              {insights.length}
            </span>
          )}
        </button>
      )}

      {/* Panel */}
      {open && (
        <div
          className="fixed z-50 flex flex-col overflow-hidden shadow-2xl"
          style={{ ...panelStyle, background: '#0f172a', border: '1px solid #1e293b' }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3 shrink-0"
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
          >
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center font-bold text-white text-sm">
                KZ
              </div>
              <div>
                <p className="text-white font-bold text-sm">Kayden Zion</p>
                <p className="text-white/70 text-xs">Experte en développement business</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {mode === 'chat' && (
                <button
                  onClick={clearHistory}
                  className="p-1.5 rounded-full hover:bg-white/20 transition-colors"
                  title="Effacer la conversation"
                >
                  <Trash2 size={15} color="white" opacity={0.8} />
                </button>
              )}
              <button
                onClick={handleClose}
                className="p-1.5 rounded-full hover:bg-white/20 transition-colors"
              >
                {isMobile ? <X size={18} color="white" /> : <ChevronDown size={18} color="white" />}
              </button>
            </div>
          </div>

          {/* Mode tabs */}
          <div className="flex shrink-0" style={{ background: '#1e293b', borderBottom: '1px solid #334155' }}>
            <button
              onClick={switchToChat}
              className={`flex-1 py-2 text-xs font-medium transition-colors flex items-center justify-center gap-1.5 ${mode === 'chat' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-slate-400 hover:text-slate-200'}`}
            >
              <BrainCircuit size={13} />
              Chat texte
            </button>
            <button
              onClick={switchToCall}
              className={`flex-1 py-2 text-xs font-medium transition-colors flex items-center justify-center gap-1.5 ${mode === 'call' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-slate-400 hover:text-slate-200'}`}
            >
              <PhoneCall size={13} />
              Appel vocal
            </button>
          </div>

          {/* ── CHAT MODE ── */}
          {mode === 'chat' && (
            <>
              {/* Insights */}
              {(insightsLoading || insights.length > 0) && (
                <div className="px-3 py-2 shrink-0 space-y-1" style={{ background: '#1e293b', borderBottom: '1px solid #334155' }}>
                  {insightsLoading ? (
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <Loader2 size={12} className="animate-spin" /> Analyse en cours...
                    </div>
                  ) : insights.map((ins, i) => (
                    <button
                      key={i}
                      onClick={() => sendChat(ins.text)}
                      className="w-full text-left text-xs px-2 py-1 rounded-lg hover:bg-slate-700 transition-colors flex items-start gap-2"
                      style={{ color: '#94a3b8' }}
                    >
                      <span className="shrink-0">{ins.priority}</span>
                      <span className="truncate">{ins.text}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4" style={{ background: '#0f172a' }}>
                {messages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {m.role === 'assistant' && (
                      <div className="w-7 h-7 rounded-full shrink-0 mr-2 mt-0.5 flex items-center justify-center font-bold text-white text-xs"
                        style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
                        KZ
                      </div>
                    )}
                    <div
                      className="max-w-[82%] rounded-2xl px-3 py-2 text-sm space-y-0.5"
                      style={{
                        background: m.role === 'user' ? '#6366f1' : '#1e293b',
                        color: m.role === 'user' ? 'white' : '#e2e8f0',
                        borderRadius: m.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                      }}
                    >
                      {renderContent(m.content)}
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex justify-start">
                    <div className="w-7 h-7 rounded-full shrink-0 mr-2 flex items-center justify-center font-bold text-white text-xs"
                      style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
                      KZ
                    </div>
                    <div className="rounded-2xl px-4 py-3 flex items-center gap-1" style={{ background: '#1e293b' }}>
                      <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                )}
                <div ref={endRef} />
              </div>

              {/* Suggestions */}
              {messages.length <= 1 && !loading && (
                <div className="px-3 py-2 shrink-0 flex gap-2 overflow-x-auto" style={{ borderTop: '1px solid #1e293b' }}>
                  {SUGGESTIONS.map((s, i) => (
                    <button key={i} onClick={() => sendChat(s)}
                      className="shrink-0 text-xs px-3 py-1.5 rounded-full whitespace-nowrap transition-colors hover:bg-indigo-600"
                      style={{ background: '#1e293b', color: '#94a3b8', border: '1px solid #334155' }}>
                      {s}
                    </button>
                  ))}
                </div>
              )}

              {/* Text input */}
              <div className="px-3 py-3 shrink-0 flex items-end gap-2" style={{ background: '#0f172a', borderTop: '1px solid #1e293b' }}>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
                  placeholder="Posez une question à Kayden Zion..."
                  rows={1}
                  className="flex-1 resize-none rounded-xl px-3 py-2 text-sm outline-none"
                  style={{ background: '#1e293b', color: '#e2e8f0', border: '1px solid #334155', maxHeight: 100 }}
                />
                <button
                  onClick={() => sendChat()}
                  disabled={!input.trim() || loading}
                  className="p-2 rounded-xl transition-all disabled:opacity-40 shrink-0"
                  style={{ background: '#6366f1' }}
                >
                  {loading ? <Loader2 size={18} color="white" className="animate-spin" /> : <Send size={18} color="white" />}
                </button>
              </div>
            </>
          )}

          {/* ── CALL MODE ── */}
          {mode === 'call' && (
            <div className="flex-1 flex flex-col items-center justify-between py-8 px-6" style={{ background: '#0f172a' }}>

              {/* Avatar with pulse rings */}
              <div className="flex flex-col items-center gap-4">
                <div className="relative">
                  {/* Outer pulse rings when speaking */}
                  {callState === 'speaking' && (
                    <>
                      <span className="absolute inset-0 rounded-full animate-ping opacity-20" style={{ background: '#6366f1', scale: '1.4' }} />
                      <span className="absolute inset-0 rounded-full animate-ping opacity-10" style={{ background: '#6366f1', animationDelay: '0.3s', scale: '1.7' }} />
                    </>
                  )}
                  {/* Listening ring */}
                  {callState === 'listening' && (
                    <span className="absolute inset-0 rounded-full animate-pulse opacity-40" style={{ background: '#ef4444', scale: '1.2' }} />
                  )}
                  {/* Avatar circle */}
                  <div
                    className="w-28 h-28 rounded-full flex items-center justify-center text-white text-3xl font-bold shadow-2xl"
                    style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
                  >
                    KZ
                  </div>
                </div>

                <div className="text-center">
                  <p className="text-white font-bold text-xl">Kayden Zion</p>
                  <p className="text-slate-400 text-sm mt-0.5">Experte business IA</p>
                </div>

                {/* Status */}
                <div className="flex items-center gap-2 mt-2">
                  {callState === 'thinking' && <Loader2 size={14} className="animate-spin text-indigo-400" />}
                  {callState === 'listening' && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
                  {callState === 'speaking' && <Sparkles size={14} className="text-indigo-400 animate-pulse" />}
                  <p className="text-slate-300 text-sm">{CALL_STATUS[callState]}</p>
                </div>
              </div>

              {/* Call controls */}
              <div className="flex flex-col items-center gap-6 w-full">
                {!callStarted ? (
                  <button
                    onClick={beginCall}
                    className="w-20 h-20 rounded-full flex items-center justify-center shadow-2xl transition-all hover:scale-105 active:scale-95"
                    style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)' }}
                  >
                    <PhoneCall size={32} color="white" />
                  </button>
                ) : (
                  <div className="flex items-center gap-8">
                    {/* Mic toggle */}
                    <button
                      onClick={callState === 'listening' ? () => { recogRef.current?.stop(); setCallState('idle'); } : startListening}
                      disabled={callState === 'thinking' || callState === 'speaking'}
                      className={`w-16 h-16 rounded-full flex items-center justify-center transition-all disabled:opacity-30 ${callState === 'listening' ? 'animate-pulse' : 'hover:scale-105 active:scale-95'}`}
                      style={{ background: callState === 'listening' ? '#ef4444' : '#1e293b', border: '2px solid #334155' }}
                    >
                      {callState === 'listening' ? <MicOff size={24} color="white" /> : <Mic size={24} color="#94a3b8" />}
                    </button>

                    {/* End call */}
                    <button
                      onClick={() => { stopAll(); setCallStarted(false); }}
                      className="w-16 h-16 rounded-full flex items-center justify-center transition-all hover:scale-105 active:scale-95"
                      style={{ background: '#ef4444' }}
                    >
                      <PhoneOff size={24} color="white" />
                    </button>
                  </div>
                )}

                {!callStarted && (
                  <p className="text-slate-500 text-xs text-center">
                    Démarrez une consultation vocale<br />interactive avec Kayden Zion
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
