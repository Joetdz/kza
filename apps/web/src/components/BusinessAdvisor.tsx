import { useState, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { BrainCircuit, X, Send, Loader2, ChevronDown, Sparkles } from 'lucide-react';

const BASE = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api');

interface Msg { role: 'user' | 'assistant'; content: string }
interface Insight { priority: string; text: string }

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

const SUGGESTIONS = [
  'Quels sont mes produits les plus rentables ?',
  'Comment améliorer mon taux de conversion ?',
  'Quels leads devrais-je prioriser ?',
  'Analyse mon chiffre d\'affaires du mois',
  'Quelles actions pour augmenter mes ventes ?',
];

export function BusinessAdvisor() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (open && messages.length === 0) {
      loadInsights();
      setMessages([{
        role: 'assistant',
        content: `Bonjour ! Je suis votre **Business Developer IA**. J'ai accès à toutes vos données commerciales en temps réel.\n\nJe peux vous aider à :\n• Analyser vos ventes et identifier les tendances\n• Optimiser votre pipeline de leads\n• Identifier des opportunités de croissance\n• Donner des conseils stratégiques personnalisés\n\nQue souhaitez-vous explorer ?`,
      }]);
    }
  }, [open]);

  const loadInsights = async () => {
    setInsightsLoading(true);
    try {
      const data = await authReq<{ insights: Insight[] }>('/business-ai/insights');
      setInsights(data.insights ?? []);
    } catch { /* ignore */ }
    finally { setInsightsLoading(false); }
  };

  const send = async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;
    setInput('');

    const userMsg: Msg = { role: 'user', content: msg };
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setLoading(true);

    try {
      const history = newHistory.slice(0, -1); // exclude last user msg
      const data = await authReq<{ message: string }>('/business-ai/chat', {
        method: 'POST',
        body: JSON.stringify({ message: msg, history }),
      });
      setMessages(prev => [...prev, { role: 'assistant', content: data.message }]);
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Désolé, une erreur s\'est produite. Réessayez.',
      }]);
    } finally {
      setLoading(false);
    }
  };

  const renderContent = (text: string) => {
    // Simple markdown-like rendering
    return text
      .split('\n')
      .map((line, i) => {
        if (line.startsWith('**') && line.endsWith('**')) {
          return <p key={i} className="font-semibold">{line.slice(2, -2)}</p>;
        }
        if (line.startsWith('• ') || line.startsWith('- ')) {
          return <p key={i} className="pl-3">• {line.slice(2)}</p>;
        }
        // Inline bold
        const parts = line.split(/\*\*(.*?)\*\*/g);
        return (
          <p key={i} className={line === '' ? 'h-2' : ''}>
            {parts.map((part, j) =>
              j % 2 === 1 ? <strong key={j}>{part}</strong> : part
            )}
          </p>
        );
      });
  };

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
          <span>Business IA</span>
          {insights.length > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-xs flex items-center justify-center font-bold">
              {insights.length}
            </span>
          )}
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div
          className="fixed bottom-6 right-6 z-50 flex flex-col rounded-2xl shadow-2xl overflow-hidden"
          style={{ width: 400, height: 600, background: '#0f172a', border: '1px solid #1e293b' }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3 shrink-0"
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
          >
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                <BrainCircuit size={16} color="white" />
              </div>
              <div>
                <p className="text-white font-semibold text-sm">Business Developer IA</p>
                <p className="text-white/70 text-xs">Conseiller stratégique personnel</p>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="p-1 rounded-full hover:bg-white/20 transition-colors"
            >
              <ChevronDown size={20} color="white" />
            </button>
          </div>

          {/* Insights bar */}
          {(insightsLoading || insights.length > 0) && (
            <div className="px-3 py-2 shrink-0 space-y-1" style={{ background: '#1e293b', borderBottom: '1px solid #334155' }}>
              {insightsLoading ? (
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <Loader2 size={12} className="animate-spin" />
                  Analyse en cours...
                </div>
              ) : (
                insights.map((ins, i) => (
                  <button
                    key={i}
                    onClick={() => send(ins.text)}
                    className="w-full text-left text-xs px-2 py-1 rounded-lg hover:bg-slate-700 transition-colors flex items-start gap-2"
                    style={{ color: '#94a3b8' }}
                  >
                    <span className="shrink-0">{ins.priority}</span>
                    <span className="truncate">{ins.text}</span>
                  </button>
                ))
              )}
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4" style={{ background: '#0f172a' }}>
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {m.role === 'assistant' && (
                  <div className="w-6 h-6 rounded-full shrink-0 mr-2 mt-1 flex items-center justify-center"
                    style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
                    <Sparkles size={12} color="white" />
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
                <div className="w-6 h-6 rounded-full shrink-0 mr-2 flex items-center justify-center"
                  style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
                  <Sparkles size={12} color="white" />
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
                <button
                  key={i}
                  onClick={() => send(s)}
                  className="shrink-0 text-xs px-3 py-1.5 rounded-full whitespace-nowrap transition-colors hover:bg-indigo-600"
                  style={{ background: '#1e293b', color: '#94a3b8', border: '1px solid #334155' }}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="px-3 py-3 shrink-0 flex items-end gap-2" style={{ background: '#0f172a', borderTop: '1px solid #1e293b' }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Posez une question sur votre business..."
              rows={1}
              className="flex-1 resize-none rounded-xl px-3 py-2 text-sm outline-none"
              style={{
                background: '#1e293b',
                color: '#e2e8f0',
                border: '1px solid #334155',
                maxHeight: 100,
              }}
            />
            <button
              onClick={() => send()}
              disabled={!input.trim() || loading}
              className="p-2 rounded-xl transition-all disabled:opacity-40"
              style={{ background: '#6366f1' }}
            >
              {loading ? <Loader2 size={18} color="white" className="animate-spin" /> : <Send size={18} color="white" />}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
