import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import {
  Store, Copy, ExternalLink, Check, Package,
  ToggleLeft, ToggleRight, Loader2, ShoppingBag, Clock, CheckCircle,
  XCircle, Truck, Plus, X, Film, Mic, MicOff, Play, Square, Trash2,
  Sparkles, RefreshCw, Music,
} from 'lucide-react';
import { mediaApi, uploadApi, type ProductMedia } from '../api';

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api';
const resolveImg = (url: string | null | undefined) =>
  url ? (url.startsWith('http') ? url : `${BASE.replace('/api', '')}${url}`) : null;

async function api<T>(path: string, init?: RequestInit): Promise<T> {
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

const COLORS = [
  { label: 'Indigo', value: '#6366f1' },
  { label: 'Violet', value: '#8b5cf6' },
  { label: 'Emeraude', value: '#10b981' },
  { label: 'Bleu', value: '#3b82f6' },
  { label: 'Rose', value: '#e11d48' },
  { label: 'Ardoise', value: '#475569' },
];

const STATUS_LABELS: Record<string, { label: string; color: string; Icon: any }> = {
  pending:   { label: 'En attente',  color: '#f59e0b', Icon: Clock },
  confirmed: { label: 'Confirmée',   color: '#6366f1', Icon: CheckCircle },
  delivered: { label: 'Livrée',      color: '#10b981', Icon: Truck },
  cancelled: { label: 'Annulée',     color: '#ef4444', Icon: XCircle },
};

// ── AudioRecorder ─────────────────────────────────────────────────────────────

type RecorderState = 'idle' | 'recording' | 'recorded' | 'uploading';

function AudioRecorder({ mediaId, existingAudioUrl, onSaved, onCancel }: {
  mediaId: string;
  existingAudioUrl: string | null;
  onSaved: (audioUrl: string | null) => void;
  onCancel: () => void;
}) {
  const [state, setState] = useState<RecorderState>('idle');
  const [seconds, setSeconds] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(existingAudioUrl);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
          ? 'audio/ogg;codecs=opus'
          : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const recorded = new Blob(chunksRef.current, { type: mimeType });
        setBlob(recorded);
        const url = URL.createObjectURL(recorded);
        setPreviewUrl(url);
        setState('recorded');
        stream.getTracks().forEach(t => t.stop());
      };
      recorder.start(100);
      recorderRef.current = recorder;
      setState('recording');
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000);
    } catch {
      alert('Impossible d\'accéder au microphone. Vérifiez les permissions.');
    }
  }, []);

  const stopRecording = useCallback(() => {
    recorderRef.current?.stop();
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const save = useCallback(async () => {
    if (!blob) return;
    setState('uploading');
    try {
      const url = await uploadApi.uploadAudio(blob);
      await mediaApi.update(mediaId, { audioUrl: url });
      onSaved(url);
    } catch {
      setState('recorded');
      alert('Erreur lors de l\'enregistrement audio');
    }
  }, [blob, mediaId, onSaved]);

  const removeAudio = useCallback(async () => {
    setState('uploading');
    await mediaApi.update(mediaId, { audioUrl: null }).catch(() => {});
    setBlob(null);
    setPreviewUrl(null);
    setState('idle');
    onSaved(null);
  }, [mediaId, onSaved]);

  const fmt = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  return (
    <div className="mt-2 bg-gray-50 border border-gray-200 rounded-xl p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
          <Mic size={13} className="text-indigo-500" />
          Voix / Son
        </p>
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
          <X size={14} />
        </button>
      </div>

      {/* Existing audio or preview */}
      {previewUrl && (
        <div className="mb-2 flex items-center gap-2">
          <audio src={previewUrl} controls className="flex-1 h-8" style={{ height: 32 }} />
          <button onClick={removeAudio} className="w-7 h-7 rounded-lg bg-red-50 hover:bg-red-100 flex items-center justify-center transition-colors" title="Supprimer l'audio">
            <Trash2 size={13} className="text-red-500" />
          </button>
        </div>
      )}

      {/* Controls */}
      {state === 'idle' && (
        <button onClick={startRecording}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold transition-colors">
          <Mic size={15} />
          {previewUrl ? 'Ré-enregistrer' : 'Enregistrer ma voix'}
        </button>
      )}

      {state === 'recording' && (
        <div className="flex items-center gap-3">
          <div className="flex-1 flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
            <span className="text-sm font-mono font-bold text-gray-800">{fmt(seconds)}</span>
            <span className="text-xs text-gray-400">Enregistrement...</span>
          </div>
          <button onClick={stopRecording}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gray-800 hover:bg-gray-900 text-white text-sm font-semibold transition-colors">
            <Square size={13} />
            Arrêter
          </button>
        </div>
      )}

      {state === 'recorded' && (
        <div className="flex gap-2">
          <button onClick={() => { setBlob(null); setPreviewUrl(existingAudioUrl); setState('idle'); }}
            className="flex-1 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-100 transition-colors">
            Recommencer
          </button>
          <button onClick={save}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors">
            <Check size={14} />
            Sauvegarder
          </button>
        </div>
      )}

      {state === 'uploading' && (
        <div className="flex items-center justify-center gap-2 py-2">
          <Loader2 size={16} className="animate-spin text-indigo-500" />
          <span className="text-sm text-gray-500">Sauvegarde en cours...</span>
        </div>
      )}
    </div>
  );
}

// ── JingleStudio ──────────────────────────────────────────────────────────────

const VOICES = [
  { id: 'nova',    label: 'Nova',    desc: 'Chaleureuse',    emoji: '🌟' },
  { id: 'alloy',   label: 'Alloy',   desc: 'Professionnelle', emoji: '💼' },
  { id: 'echo',    label: 'Echo',    desc: 'Dynamique',      emoji: '⚡' },
  { id: 'onyx',    label: 'Onyx',    desc: 'Grave/Puissante', emoji: '🎯' },
  { id: 'shimmer', label: 'Shimmer', desc: 'Douce/Élégante', emoji: '✨' },
  { id: 'fable',   label: 'Fable',   desc: 'Narrative',      emoji: '📖' },
] as const;

const JINGLE_STYLES = [
  { id: 'energique',    label: 'Énergique',    emoji: '⚡' },
  { id: 'elegant',      label: 'Élégant',       emoji: '💎' },
  { id: 'friendly',     label: 'Convivial',     emoji: '😊' },
  { id: 'urgent',       label: 'Promo / Urgence', emoji: '🔥' },
  { id: 'storytelling', label: 'Storytelling',  emoji: '📖' },
] as const;

type JingleStep = 'config' | 'script' | 'voice' | 'mix';

async function apiAuth<T>(path: string, init?: RequestInit): Promise<T> {
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

async function apiAuthBlob(path: string, init?: RequestInit): Promise<Blob> {
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
  return res.blob();
}

async function mixAudioBlobs(voiceBlob: Blob, bgBlob: Blob, bgVolume = 0.25): Promise<Blob> {
  const ctx = new AudioContext();
  const dest = ctx.createMediaStreamDestination();

  const [voiceBuf, bgBuf] = await Promise.all([
    ctx.decodeAudioData(await voiceBlob.arrayBuffer()),
    ctx.decodeAudioData(await bgBlob.arrayBuffer()),
  ]);

  const voiceSrc = ctx.createBufferSource();
  voiceSrc.buffer = voiceBuf;
  const voiceGain = ctx.createGain();
  voiceGain.gain.value = 1.0;
  voiceSrc.connect(voiceGain).connect(dest);

  const bgSrc = ctx.createBufferSource();
  bgSrc.buffer = bgBuf;
  bgSrc.loop = true;
  const bgGain = ctx.createGain();
  bgGain.gain.value = bgVolume;
  bgSrc.connect(bgGain).connect(dest);

  const recorder = new MediaRecorder(dest.stream);
  const chunks: Blob[] = [];
  recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };

  return new Promise(resolve => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType }));
    recorder.start(100);
    voiceSrc.start();
    bgSrc.start();
    const duration = voiceBuf.duration * 1000 + 600;
    setTimeout(() => { voiceSrc.stop(); bgSrc.stop(); recorder.stop(); ctx.close(); }, duration);
  });
}

function JingleStudio({ mediaId, product, onSaved, onCancel }: {
  mediaId: string;
  product: { name: string; sellingPrice: number };
  onSaved: (audioUrl: string) => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState<JingleStep>('config');
  const [style, setStyle] = useState<string>('energique');
  const [voice, setVoice] = useState<string>('nova');
  const [script, setScript] = useState('');
  const [voiceBlob, setVoiceBlob] = useState<Blob | null>(null);
  const [voiceUrl, setVoiceUrl] = useState<string | null>(null);
  const [bgFile, setBgFile] = useState<File | null>(null);
  const [bgVolume, setBgVolume] = useState(0.25);
  const [busy, setBusy] = useState(false);
  const [mixedBlob, setMixedBlob] = useState<Blob | null>(null);
  const [mixedUrl, setMixedUrl] = useState<string | null>(null);
  const bgInputRef = useRef<HTMLInputElement>(null);

  const generateScript = async () => {
    setBusy(true);
    try {
      const { script: s } = await apiAuth<{ script: string }>('/store/my/jingle/script', {
        method: 'POST',
        body: JSON.stringify({ productName: product.name, price: product.sellingPrice, style }),
      });
      setScript(s);
      setStep('script');
    } catch { alert('Erreur lors de la génération du script'); }
    finally { setBusy(false); }
  };

  const generateVoice = async () => {
    if (!script.trim()) return;
    setBusy(true);
    setVoiceBlob(null);
    setVoiceUrl(null);
    try {
      const blob = await apiAuthBlob('/store/my/jingle/voice', {
        method: 'POST',
        body: JSON.stringify({ script, voice }),
      });
      setVoiceBlob(blob);
      setVoiceUrl(URL.createObjectURL(blob));
      setStep('voice');
    } catch { alert('Erreur lors de la synthèse vocale'); }
    finally { setBusy(false); }
  };

  const generateMix = async () => {
    if (!voiceBlob || !bgFile) return;
    setBusy(true);
    setMixedBlob(null);
    setMixedUrl(null);
    try {
      const bgBlob = new Blob([await bgFile.arrayBuffer()], { type: bgFile.type });
      const mixed = await mixAudioBlobs(voiceBlob, bgBlob, bgVolume);
      setMixedBlob(mixed);
      setMixedUrl(URL.createObjectURL(mixed));
      setStep('mix');
    } catch { alert('Erreur lors du mixage audio'); }
    finally { setBusy(false); }
  };

  const save = async (finalBlob: Blob) => {
    setBusy(true);
    try {
      const url = await uploadApi.uploadAudio(finalBlob);
      await mediaApi.update(mediaId, { audioUrl: url });
      onSaved(url);
    } catch { alert('Erreur lors de la sauvegarde'); }
    finally { setBusy(false); }
  };

  return (
    <div className="mt-2 bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-100 rounded-xl p-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-bold text-indigo-700 flex items-center gap-1.5">
          <Sparkles size={13} />
          Jingle IA
        </p>
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
      </div>

      {/* Step indicators */}
      <div className="flex gap-1 mb-3">
        {(['config', 'script', 'voice', 'mix'] as JingleStep[]).map((s, i) => (
          <div key={s} className={`flex-1 h-1 rounded-full transition-colors ${
            ['config', 'script', 'voice', 'mix'].indexOf(step) >= i ? 'bg-indigo-500' : 'bg-gray-200'
          }`} />
        ))}
      </div>

      {/* ── Step 1 : Style ── */}
      {step === 'config' && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-gray-700">Style publicitaire</p>
          <div className="grid grid-cols-2 gap-1.5">
            {JINGLE_STYLES.map(s => (
              <button key={s.id} onClick={() => setStyle(s.id)}
                className={`flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-xs font-medium transition-all text-left ${style === s.id ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-indigo-300'}`}>
                <span>{s.emoji}</span>{s.label}
              </button>
            ))}
          </div>
          <button onClick={generateScript} disabled={busy}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-semibold transition-colors">
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
            {busy ? 'Génération...' : 'Générer le script'}
          </button>
        </div>
      )}

      {/* ── Step 2 : Script ── */}
      {step === 'script' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-700">Script généré</p>
            <button onClick={generateScript} disabled={busy} className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800">
              <RefreshCw size={11} className={busy ? 'animate-spin' : ''} />
              Regénérer
            </button>
          </div>
          <textarea
            value={script}
            onChange={e => setScript(e.target.value)}
            rows={4}
            className="w-full border border-indigo-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-400 resize-none bg-white text-gray-800"
          />
          <p className="text-[10px] text-gray-400">{script.length} caractères · Tu peux éditer le script avant de synthétiser</p>

          <p className="text-xs font-semibold text-gray-700 pt-1">Voix</p>
          <div className="grid grid-cols-3 gap-1.5">
            {VOICES.map(v => (
              <button key={v.id} onClick={() => setVoice(v.id)}
                className={`flex flex-col items-center px-2 py-2 rounded-xl text-[10px] font-medium transition-all border ${voice === v.id ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300'}`}>
                <span className="text-base mb-0.5">{v.emoji}</span>
                <span className="font-bold">{v.label}</span>
                <span className={`${voice === v.id ? 'text-indigo-200' : 'text-gray-400'} text-[9px]`}>{v.desc}</span>
              </button>
            ))}
          </div>

          <button onClick={generateVoice} disabled={busy || !script.trim()}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-semibold transition-colors">
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Mic size={15} />}
            {busy ? 'Synthèse en cours...' : 'Synthétiser la voix'}
          </button>
        </div>
      )}

      {/* ── Step 3 : Voice preview ── */}
      {step === 'voice' && voiceUrl && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-gray-700">Aperçu de la voix</p>
          <audio src={voiceUrl} controls className="w-full" style={{ height: 36 }} />

          <div className="flex gap-2">
            <button onClick={() => setStep('script')} className="flex-1 py-2 rounded-xl border border-gray-200 text-gray-600 text-xs font-medium hover:bg-gray-50 transition-colors">
              Modifier
            </button>
            <button onClick={generateVoice} disabled={busy} className="flex items-center gap-1 px-3 py-2 rounded-xl border border-indigo-200 text-indigo-600 text-xs font-medium hover:bg-indigo-50 transition-colors">
              <RefreshCw size={11} className={busy ? 'animate-spin' : ''} />
              Autre voix
            </button>
          </div>

          {/* Optional background music */}
          <div className="border-t border-indigo-100 pt-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
                <Music size={12} className="text-purple-500" />
                Musique de fond <span className="text-gray-400 font-normal">(optionnelle)</span>
              </p>
              {bgFile && (
                <button onClick={() => { setBgFile(null); if (bgInputRef.current) bgInputRef.current.value = ''; }}
                  className="text-red-400 hover:text-red-600 text-xs">
                  Retirer
                </button>
              )}
            </div>
            {!bgFile ? (
              <label className="flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-purple-200 rounded-xl cursor-pointer hover:border-purple-400 transition-colors text-xs text-purple-500">
                <Music size={14} />
                Charger ta piste (MP3, M4A, WAV...)
                <input ref={bgInputRef} type="file" accept="audio/*" className="hidden"
                  onChange={e => setBgFile(e.target.files?.[0] ?? null)} />
              </label>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-gray-500 truncate">{bgFile.name}</p>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-400 shrink-0">Volume BG</span>
                  <input type="range" min={0} max={1} step={0.05} value={bgVolume}
                    onChange={e => setBgVolume(parseFloat(e.target.value))}
                    className="flex-1 accent-purple-500" />
                  <span className="text-[10px] text-gray-500 w-8 text-right">{Math.round(bgVolume * 100)}%</span>
                </div>
                <button onClick={generateMix} disabled={busy}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white text-xs font-semibold transition-colors">
                  {busy ? <Loader2 size={13} className="animate-spin" /> : <Music size={13} />}
                  {busy ? 'Mixage...' : 'Mixer voix + musique'}
                </button>
              </div>
            )}
          </div>

          {/* Save voice only */}
          <button onClick={() => voiceBlob && save(voiceBlob)} disabled={busy}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-semibold transition-colors">
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
            {busy ? 'Sauvegarde...' : 'Sauvegarder la voix'}
          </button>
        </div>
      )}

      {/* ── Step 4 : Mixed preview ── */}
      {step === 'mix' && mixedUrl && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-gray-700">Aperçu du mix</p>
          <audio src={mixedUrl} controls className="w-full" style={{ height: 36 }} />
          <div className="flex gap-2">
            <button onClick={() => setStep('voice')} className="flex-1 py-2 rounded-xl border border-gray-200 text-gray-600 text-xs font-medium hover:bg-gray-50 transition-colors">
              Ajuster
            </button>
            <button onClick={() => mixedBlob && save(mixedBlob)} disabled={busy}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-semibold transition-colors">
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              {busy ? 'Sauvegarde...' : 'Sauvegarder le mix'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── StorePage ─────────────────────────────────────────────────────────────────

export function StorePage() {
  const [tab, setTab] = useState<'config' | 'products' | 'creations' | 'share' | 'orders'>('config');
  const [store, setStore] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [visibleIds, setVisibleIds] = useState<Set<string>>(new Set());
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Creations state
  const [media, setMedia] = useState<ProductMedia[]>([]);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [captionMap, setCaptionMap] = useState<Record<string, string>>({});
  const [recorderOpenId, setRecorderOpenId] = useState<string | null>(null);
  const [jingleOpenId, setJingleOpenId] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Per-product store price override (productId → price string)
  const [storePriceMap, setStorePriceMap] = useState<Record<string, string>>({});

  const [form, setForm] = useState({
    name: '',
    description: '',
    whatsappPhone: '',
    primaryColor: '#6366f1',
    currency: 'CDF',
    active: true,
  });

  useEffect(() => {
    Promise.all([
      api<any>('/store/my').catch(() => null),
      api<any[]>('/products').catch(() => []),
    ]).then(([s, prods]) => {
      setProducts(prods ?? []);
      if (s) {
        setStore(s);
        setForm({
          name: s.name,
          description: s.description ?? '',
          whatsappPhone: s.whatsappPhone,
          primaryColor: s.primaryColor,
          currency: s.currency ?? 'CDF',
          active: s.active,
        });
        setVisibleIds(new Set(s.visibleProductIds ?? []));
        if (s.storePrices) {
          const priceMap: Record<string, string> = {};
          for (const [pid, price] of Object.entries(s.storePrices as Record<string, number>)) {
            priceMap[pid] = String(price);
          }
          setStorePriceMap(priceMap);
        }
        if (s.suggestedPhone && !s.whatsappPhone) {
          setForm(f => ({ ...f, whatsappPhone: s.suggestedPhone }));
        }
      }
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (tab === 'orders' && store) {
      api<{ orders: any[] }>('/store/my/orders').then(d => setOrders(d.orders ?? []));
    }
    if (tab === 'creations' && store) {
      mediaApi.getAll().then(setMedia).catch(() => {});
    }
  }, [tab, store]);

  const saveConfig = async () => {
    if (!form.name.trim() || !form.whatsappPhone.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      const s = await api<any>('/store/my', { method: 'PUT', body: JSON.stringify(form) });
      setStore(s);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) {
      setSaveError(e?.message ?? 'Erreur lors de la sauvegarde');
    } finally { setSaving(false); }
  };

  const saveProducts = async () => {
    if (!store) return;
    setSaving(true);
    setSaveError(null);
    try {
      await api('/store/my/products', {
        method: 'PUT',
        body: JSON.stringify({ productIds: Array.from(visibleIds) }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) {
      setSaveError(e?.message ?? 'Erreur lors de la sauvegarde');
    } finally { setSaving(false); }
  };

  const toggleProduct = (id: string) => {
    setVisibleIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const copyLink = () => {
    const url = `${window.location.origin}${window.location.pathname}#/boutique/${store.slug}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const updateOrderStatus = async (orderId: string, status: string) => {
    await api(`/store/my/orders/${orderId}`, { method: 'PUT', body: JSON.stringify({ status }) });
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status } : o));
  };

  const handleUploadMedia = async (productId: string, file: File | undefined) => {
    if (!file) return;
    setUploadingId(productId);
    try {
      const url = await uploadApi.uploadMedia(file);
      const type = file.type.startsWith('video/') ? 'video' : 'image';
      const caption = captionMap[productId] ?? '';
      const created = await mediaApi.create({ productId, url, type, caption: caption || undefined });
      setMedia(prev => [created, ...prev]);
      setCaptionMap(c => ({ ...c, [productId]: '' }));
      const input = fileInputRefs.current[productId];
      if (input) input.value = '';
    } catch {
      // silently ignore
    } finally {
      setUploadingId(null);
    }
  };

  const handleDeleteMedia = async (id: string) => {
    if (recorderOpenId === id) setRecorderOpenId(null);
    if (jingleOpenId === id) setJingleOpenId(null);
    await mediaApi.remove(id).catch(() => {});
    setMedia(prev => prev.filter(m => m.id !== id));
  };

  const handleAudioSaved = (mediaId: string, audioUrl: string | null) => {
    setMedia(prev => prev.map(m => m.id === mediaId ? { ...m, audioUrl } : m));
    setRecorderOpenId(null);
  };

  const handleJingleSaved = (mediaId: string, audioUrl: string) => {
    setMedia(prev => prev.map(m => m.id === mediaId ? { ...m, audioUrl } : m));
    setJingleOpenId(null);
  };

  const saveProductStorePrice = async (productId: string) => {
    const val = storePriceMap[productId];
    const storePrice = val && val.trim() !== '' ? parseFloat(val) : null;
    if (storePrice !== null && isNaN(storePrice)) return;
    await api(`/store/my/products/${productId}`, {
      method: 'PATCH',
      body: JSON.stringify({ storePrice }),
    }).catch(() => {});
  };

  const storeUrl = store ? `${window.location.origin}${window.location.pathname}#/boutique/${store.slug}` : '';

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={24} className="animate-spin text-indigo-500" />
      </div>
    );
  }

  const TABS = [
    { key: 'config',    label: 'Configuration' },
    { key: 'products',  label: 'Produits' },
    { key: 'creations', label: 'Créations' },
    { key: 'share',     label: 'Lien & Partage' },
    { key: 'orders',    label: 'Commandes' },
  ] as const;

  const storeProducts = products.filter(p => visibleIds.has(p.id));

  return (
    <div className="max-w-3xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-indigo-100 rounded-2xl flex items-center justify-center">
          <Store size={20} className="text-indigo-600" />
        </div>
        <div>
          <h1 className="text-xl font-black text-gray-900">Ma Boutique en ligne</h1>
          <p className="text-sm text-gray-500">Exposez vos produits et recevez les commandes sur WhatsApp</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-2xl mb-6 overflow-x-auto">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-shrink-0 py-2 px-3 rounded-xl text-sm font-medium transition-all ${tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── CONFIG ── */}
      {tab === 'config' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nom de la boutique *</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Ex : Mode Kinshasa, Electronique Gombe..."
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description courte</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Décrivez votre boutique en 1-2 phrases..."
              rows={2}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Numéro WhatsApp *</label>
            <p className="text-xs text-gray-400 mb-1.5">Les commandes seront envoyées sur ce numéro</p>
            <input value={form.whatsappPhone} onChange={e => setForm(f => ({ ...f, whatsappPhone: e.target.value }))}
              placeholder="+243812345678"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Couleur principale</label>
            <div className="flex gap-2">
              {COLORS.map(c => (
                <button key={c.value} onClick={() => setForm(f => ({ ...f, primaryColor: c.value }))}
                  className={`w-9 h-9 rounded-xl transition-all ${form.primaryColor === c.value ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : 'hover:scale-105'}`}
                  style={{ background: c.value }} title={c.label} />
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Devise de la boutique</label>
            <div className="flex flex-wrap gap-2">
              {(['CDF', 'USD', 'EUR', 'XAF', 'XOF'] as const).map(cur => (
                <button key={cur} onClick={() => setForm(f => ({ ...f, currency: cur }))}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all border ${form.currency === cur ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300'}`}>
                  {cur}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between pt-2">
            <div>
              <p className="text-sm font-medium text-gray-700">Boutique active</p>
              <p className="text-xs text-gray-400">Les clients peuvent visiter et commander</p>
            </div>
            <button onClick={() => setForm(f => ({ ...f, active: !f.active }))} className="transition-colors">
              {form.active
                ? <ToggleRight size={32} className="text-indigo-600" />
                : <ToggleLeft size={32} className="text-gray-300" />}
            </button>
          </div>
          {saveError && (
            <div className="bg-red-50 border border-red-100 rounded-xl px-3 py-2.5 text-sm text-red-600">{saveError}</div>
          )}
          <button onClick={saveConfig} disabled={saving || !form.name.trim() || !form.whatsappPhone.trim()}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-semibold transition-all">
            {saving ? <Loader2 size={16} className="animate-spin" /> : saved ? <Check size={16} /> : null}
            {saved ? 'Enregistré' : 'Enregistrer la configuration'}
          </button>
        </div>
      )}

      {/* ── PRODUCTS ── */}
      {tab === 'products' && (
        <div className="space-y-4">
          {!store && (
            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 text-sm text-amber-700">
              Configurez d'abord votre boutique dans l'onglet "Configuration".
            </div>
          )}
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">{visibleIds.size} produit(s) sélectionné(s)</p>
            <div className="flex gap-2">
              <button onClick={() => setVisibleIds(new Set(products.map(p => p.id)))}
                className="text-xs text-indigo-600 hover:underline">Tout sélectionner</button>
              <span className="text-gray-300">|</span>
              <button onClick={() => setVisibleIds(new Set())}
                className="text-xs text-gray-500 hover:underline">Tout désélectionner</button>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50">
            {products.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-8">Aucun produit. Ajoutez-en dans la page Stock.</p>
            )}
            {products.map(p => {
              const selected = visibleIds.has(p.id);
              const imgUrl = resolveImg(p.imageUrl);
              return (
                <div key={p.id} className="p-3">
                  <div className="flex items-center gap-3 cursor-pointer" onClick={() => toggleProduct(p.id)}>
                    <div className="w-12 h-12 rounded-xl bg-gray-100 overflow-hidden shrink-0 flex items-center justify-center">
                      {imgUrl ? <img src={imgUrl} alt={p.name} className="w-full h-full object-cover" /> : <Package size={18} className="text-gray-300" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 text-sm truncate">{p.name}</p>
                      <p className="text-xs text-gray-400">{p.sellingPrice.toLocaleString('fr-FR')} {store?.currency ?? 'CDF'} · Stock : {p.quantity}</p>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${selected ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300'}`}>
                      {selected && <Check size={11} color="white" strokeWidth={3} />}
                    </div>
                  </div>
                  {selected && (
                    <div className="mt-2 ml-15 pl-[60px]">
                      <div className="relative">
                        <input
                          type="number"
                          min={0}
                          placeholder={`Prix boutique (stock: ${p.sellingPrice.toLocaleString('fr-FR')})`}
                          value={storePriceMap[p.id] ?? ''}
                          onChange={e => setStorePriceMap(m => ({ ...m, [p.id]: e.target.value }))}
                          onBlur={() => saveProductStorePrice(p.id)}
                          onClick={e => e.stopPropagation()}
                          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400 text-gray-700 pr-16"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">{form.currency}</span>
                      </div>
                      {storePriceMap[p.id] && (
                        <p className="text-[10px] text-indigo-600 mt-0.5 ml-1">Prix affiché : {parseFloat(storePriceMap[p.id]).toLocaleString('fr-FR')} {form.currency}</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {store && (
            <button onClick={saveProducts} disabled={saving}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-semibold transition-all">
              {saving ? <Loader2 size={16} className="animate-spin" /> : saved ? <Check size={16} /> : null}
              {saved ? 'Enregistré' : 'Enregistrer la sélection'}
            </button>
          )}
        </div>
      )}

      {/* ── CRÉATIONS ── */}
      {tab === 'creations' && (
        <div className="space-y-4">
          {!store ? (
            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 text-sm text-amber-700">
              Configurez d'abord votre boutique dans l'onglet "Configuration".
            </div>
          ) : storeProducts.length === 0 ? (
            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 text-sm text-amber-700">
              Sélectionnez d'abord des produits dans l'onglet "Produits" pour leur attacher des créations.
            </div>
          ) : (
            <>
              <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4">
                <p className="text-sm font-medium text-indigo-700 mb-0.5">Créations TikTok</p>
                <p className="text-xs text-indigo-500">Ajoutez des vidéos/photos et enregistrez votre voix. Le son joue automatiquement sur chaque slide du feed client.</p>
              </div>

              {storeProducts.map(p => {
                const productMedia = media.filter(m => m.productId === p.id);
                const imgUrl = resolveImg(p.imageUrl);
                const isUploading = uploadingId === p.id;
                return (
                  <div key={p.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                    {/* Product header */}
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-11 h-11 rounded-xl bg-gray-100 overflow-hidden shrink-0 flex items-center justify-center">
                        {imgUrl ? <img src={imgUrl} alt={p.name} className="w-full h-full object-cover" /> : <Package size={16} className="text-gray-300" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 text-sm truncate">{p.name}</p>
                        <p className="text-xs text-gray-400">{productMedia.length} création{productMedia.length !== 1 ? 's' : ''}</p>
                      </div>
                    </div>

                    {/* Media grid */}
                    <div className="grid grid-cols-3 gap-2 mb-3">
                      {productMedia.map(m => (
                        <div key={m.id} className="relative">
                          {/* Thumbnail */}
                          <div className="relative aspect-square rounded-xl overflow-hidden bg-gray-100 group">
                            {m.type === 'video' ? (
                              <>
                                <video src={m.url} className="w-full h-full object-cover" muted playsInline />
                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                  <div className="w-8 h-8 bg-black/40 rounded-full flex items-center justify-center">
                                    <Film size={14} color="white" />
                                  </div>
                                </div>
                              </>
                            ) : (
                              <img src={m.url} alt={m.caption ?? ''} className="w-full h-full object-cover" />
                            )}
                            {m.caption && (
                              <div className="absolute bottom-0 left-0 right-0 px-1.5 py-1 bg-black/50 pointer-events-none">
                                <p className="text-white text-[10px] truncate">{m.caption}</p>
                              </div>
                            )}
                            {/* Delete */}
                            <button
                              onClick={() => handleDeleteMedia(m.id)}
                              className="absolute top-1 right-1 w-6 h-6 bg-black/50 hover:bg-red-500/80 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                              <X size={11} color="white" />
                            </button>
                          </div>

                          {/* Audio indicator + recorder toggle */}
                          <button
                            onClick={() => {
                              setJingleOpenId(null);
                              setRecorderOpenId(recorderOpenId === m.id ? null : m.id);
                            }}
                            className={`mt-1.5 w-full flex items-center justify-center gap-1 py-1 rounded-lg text-[10px] font-medium transition-colors ${m.audioUrl ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                            {m.audioUrl ? <Mic size={10} /> : <MicOff size={10} />}
                            {m.audioUrl ? 'Voix' : 'Ajouter voix'}
                          </button>

                          {/* Jingle IA button */}
                          <button
                            onClick={() => {
                              setRecorderOpenId(null);
                              setJingleOpenId(jingleOpenId === m.id ? null : m.id);
                            }}
                            className="mt-1 w-full flex items-center justify-center gap-1 py-1 rounded-lg text-[10px] font-medium bg-purple-50 text-purple-600 hover:bg-purple-100 transition-colors">
                            <Sparkles size={10} />
                            Jingle IA
                          </button>

                          {/* Recorder panel */}
                          {recorderOpenId === m.id && (
                            <AudioRecorder
                              mediaId={m.id}
                              existingAudioUrl={m.audioUrl}
                              onSaved={audioUrl => handleAudioSaved(m.id, audioUrl)}
                              onCancel={() => setRecorderOpenId(null)}
                            />
                          )}

                          {/* Jingle Studio panel */}
                          {jingleOpenId === m.id && (
                            <JingleStudio
                              mediaId={m.id}
                              product={{ name: p.name, sellingPrice: p.sellingPrice }}
                              onSaved={audioUrl => handleJingleSaved(m.id, audioUrl)}
                              onCancel={() => setJingleOpenId(null)}
                            />
                          )}
                        </div>
                      ))}

                      {/* Upload slot */}
                      <label className="aspect-square rounded-xl border-2 border-dashed border-gray-200 hover:border-indigo-400 flex flex-col items-center justify-center cursor-pointer transition-colors">
                        {isUploading
                          ? <Loader2 size={20} className="animate-spin text-indigo-500" />
                          : <Plus size={20} className="text-gray-400" />}
                        <span className="text-[10px] text-gray-400 mt-1">
                          {isUploading ? 'Upload...' : 'Ajouter'}
                        </span>
                        <input
                          type="file"
                          accept="image/*,video/*"
                          className="hidden"
                          disabled={isUploading}
                          ref={el => { fileInputRefs.current[p.id] = el; }}
                          onChange={e => handleUploadMedia(p.id, e.target.files?.[0])}
                        />
                      </label>
                    </div>

                    {/* Caption input for next upload */}
                    <input
                      value={captionMap[p.id] ?? ''}
                      onChange={e => setCaptionMap(c => ({ ...c, [p.id]: e.target.value }))}
                      placeholder="Légende pour la prochaine création (optionnelle)..."
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-indigo-400 text-gray-600 placeholder:text-gray-300"
                    />
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}

      {/* ── SHARE ── */}
      {tab === 'share' && (
        <div className="space-y-4">
          {!store ? (
            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 text-sm text-amber-700">
              Configurez d'abord votre boutique pour obtenir votre lien.
            </div>
          ) : (
            <>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <p className="text-sm font-medium text-gray-700 mb-2">Lien de votre boutique</p>
                <div className="flex gap-2">
                  <input readOnly value={storeUrl}
                    className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-600 bg-gray-50 outline-none" />
                  <button onClick={copyLink}
                    className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-1.5 ${copied ? 'bg-emerald-100 text-emerald-700' : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'}`}>
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    {copied ? 'Copié' : 'Copier'}
                  </button>
                </div>
              </div>
              <a href={storeUrl} target="_blank" rel="noreferrer"
                className="flex items-center justify-center gap-2 w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-2xl text-sm transition-all">
                <ExternalLink size={16} />
                Voir ma boutique
              </a>
              <div className="bg-indigo-50 rounded-2xl p-4 text-sm text-indigo-700 space-y-1">
                <p className="font-medium">Comment partager ?</p>
                <p className="text-xs text-indigo-600">Copiez ce lien et envoyez-le à vos clients par WhatsApp, Instagram, Facebook ou SMS.</p>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── ORDERS ── */}
      {tab === 'orders' && (
        <div className="space-y-3">
          {orders.length === 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
              <ShoppingBag size={32} className="text-gray-200 mx-auto mb-2" />
              <p className="text-sm text-gray-400">Aucune commande pour l'instant</p>
            </div>
          )}
          {orders.map(order => {
            const { label, color, Icon } = STATUS_LABELS[order.status] ?? STATUS_LABELS.pending;
            const items = order.items as { name: string; qty: number; unitPrice: number }[];
            return (
              <div key={order.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">{order.customerName}</p>
                    <p className="text-xs text-gray-400">{order.customerPhone} · {order.deliveryZone}</p>
                  </div>
                  <span className="text-xs font-medium px-2 py-1 rounded-lg flex items-center gap-1"
                    style={{ background: `${color}15`, color }}>
                    <Icon size={11} />
                    {label}
                  </span>
                </div>
                <div className="space-y-0.5 mb-3">
                  {items.map((item, i) => (
                    <p key={i} className="text-xs text-gray-600">
                      {item.name} × {item.qty} — {(item.qty * item.unitPrice).toLocaleString('fr-FR')} {store?.currency ?? 'CDF'}
                    </p>
                  ))}
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-gray-900">{order.totalAmount.toLocaleString('fr-FR')} {store?.currency ?? 'CDF'}</p>
                  <select value={order.status}
                    onChange={e => updateOrderStatus(order.id, e.target.value)}
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:ring-1 focus:ring-indigo-400">
                    <option value="pending">En attente</option>
                    <option value="confirmed">Confirmée</option>
                    <option value="delivered">Livrée</option>
                    <option value="cancelled">Annulée</option>
                  </select>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
