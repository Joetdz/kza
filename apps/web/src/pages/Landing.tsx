import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { ScrollLock } from '../components/ui/ScrollLock';
import { X } from 'lucide-react';

type AuthMode = 'login' | 'register';
type InputMethod = 'email' | 'phone';

const PHONE_COUNTRIES = [
  { name: 'RD Congo', dial: '+243' },
  { name: "Côte d'Ivoire", dial: '+225' },
  { name: 'Sénégal', dial: '+221' },
  { name: 'Cameroun', dial: '+237' },
  { name: 'Mali', dial: '+223' },
  { name: 'Burkina Faso', dial: '+226' },
  { name: 'Niger', dial: '+227' },
  { name: 'Guinée', dial: '+224' },
  { name: 'Bénin', dial: '+229' },
  { name: 'Togo', dial: '+228' },
  { name: 'Madagascar', dial: '+261' },
  { name: 'Rwanda', dial: '+250' },
  { name: 'Burundi', dial: '+257' },
  { name: 'Congo', dial: '+242' },
  { name: 'Gabon', dial: '+241' },
  { name: 'Mauritanie', dial: '+222' },
  { name: 'Tchad', dial: '+235' },
  { name: 'Centrafrique', dial: '+236' },
  { name: 'Djibouti', dial: '+253' },
  { name: 'Comores', dial: '+269' },
];

// ── Auth Modal ─────────────────────────────────────────────────────────────────

function AuthModal({ initialMode, onClose }: { initialMode: AuthMode; onClose: () => void }) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [inputMethod, setInputMethod] = useState<InputMethod>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [dialCode, setDialCode] = useState('+243');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSent, setResetSent] = useState(false);

  const fullPhone = dialCode + phone.replace(/^0+/, '');
  const switchMode = (m: AuthMode) => { setMode(m); setError(null); setInfo(null); setOtpSent(false); setShowReset(false); };

  const handleGoogle = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: (import.meta.env.VITE_APP_URL ?? window.location.origin) + '/' } });
    if (error) { setError(error.message); setLoading(false); }
  };
  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError(null); setInfo(null);
    if (mode === 'login') { const { error } = await supabase.auth.signInWithPassword({ email, password }); if (error) setError(error.message); }
    else { const { error } = await supabase.auth.signUp({ email, password }); if (error) setError(error.message); else setInfo('Vérifiez votre email pour confirmer votre compte.'); }
    setLoading(false);
  };
  const handleSendOtp = async () => {
    setLoading(true); setError(null);
    const { error } = await supabase.auth.signInWithOtp({ phone: fullPhone });
    if (error) setError(error.message); else { setOtpSent(true); setInfo('Code envoyé par SMS.'); }
    setLoading(false);
  };
  const handleVerifyOtp = async () => {
    setLoading(true); setError(null);
    const { error } = await supabase.auth.verifyOtp({ phone: fullPhone, token: otp, type: 'sms' });
    if (error) setError(error.message);
    setLoading(false);
  };
  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, { redirectTo: `${window.location.origin}/#/reset-password` });
    if (error) setError(error.message); else setResetSent(true);
    setLoading(false);
  };

  const inp = 'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-white';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,13,11,0.5)', backdropFilter: 'blur(12px)' }}>
      <ScrollLock />
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: '#5148E8' }}>
              <span className="text-white text-sm font-black">K</span>
            </div>
            <span className="font-bold text-gray-900">KZA Manager</span>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 transition-colors"><X size={18} className="text-gray-400" /></button>
        </div>
        <div className="p-6 overflow-y-auto flex-1">
          {showReset ? (
            <div className="space-y-4">
              <button onClick={() => setShowReset(false)} className="text-sm text-gray-400 hover:text-gray-600">← Retour</button>
              <div><p className="font-semibold text-gray-900 mb-1">Mot de passe oublié ?</p><p className="text-sm text-gray-500">Entrez votre email pour recevoir un lien.</p></div>
              {resetSent
                ? <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 text-sm text-emerald-700">Email envoyé. Vérifiez votre boîte.</div>
                : <form onSubmit={handleReset} className="space-y-3">
                    <input type="email" required value={resetEmail} onChange={e => setResetEmail(e.target.value)} placeholder="votre@email.com" className={inp} />
                    {error && <div className="bg-red-50 border border-red-100 rounded-xl px-3 py-2 text-sm text-red-600">{error}</div>}
                    <button type="submit" disabled={loading} className="w-full flex items-center justify-center gap-2 text-white py-2.5 rounded-xl text-sm font-medium" style={{ background: '#5148E8' }}>
                      {loading && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}Envoyer le lien
                    </button>
                  </form>
              }
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
                {(['login', 'register'] as AuthMode[]).map(m => (
                  <button key={m} onClick={() => switchMode(m)} className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${mode === m ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                    {m === 'login' ? 'Connexion' : 'Créer un compte'}
                  </button>
                ))}
              </div>
              <button onClick={handleGoogle} disabled={loading} className="w-full flex items-center justify-center gap-3 border border-gray-200 rounded-xl py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 transition-colors">
                <svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                Continuer avec Google
              </button>
              <div className="flex items-center gap-3"><div className="flex-1 h-px bg-gray-200" /><span className="text-xs text-gray-400">ou</span><div className="flex-1 h-px bg-gray-200" /></div>
              <div className="flex gap-1 p-1 rounded-xl bg-gray-100">
                {(['email', 'phone'] as InputMethod[]).map(m => (
                  <button key={m} onClick={() => { setInputMethod(m); setError(null); setOtpSent(false); }} className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${inputMethod === m ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
                    {m === 'email' ? 'Email' : 'Téléphone'}
                  </button>
                ))}
              </div>
              {inputMethod === 'email' && (
                <form onSubmit={handleEmailSubmit} className="space-y-3">
                  <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="vous@exemple.com" className={inp} />
                  <div>
                    <input type="password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="Mot de passe" minLength={6} className={inp} />
                    {mode === 'login' && <button type="button" onClick={() => { setShowReset(true); setError(null); }} className="text-xs mt-1.5 text-right w-full text-gray-400 hover:text-gray-700">Mot de passe oublié ?</button>}
                  </div>
                  {error && <div className="bg-red-50 border border-red-100 rounded-xl px-3 py-2 text-sm text-red-600">{error}</div>}
                  {info && <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2 text-sm text-emerald-700">{info}</div>}
                  <button type="submit" disabled={loading} className="w-full flex items-center justify-center gap-2 text-white py-2.5 rounded-xl text-sm font-medium" style={{ background: '#5148E8' }}>
                    {loading && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                    {mode === 'login' ? 'Se connecter' : 'Créer mon compte'}
                  </button>
                </form>
              )}
              {inputMethod === 'phone' && (
                <div className="space-y-3">
                  {!otpSent ? (
                    <>
                      <div className="flex gap-2">
                        <select value={dialCode} onChange={e => setDialCode(e.target.value)} className="border border-gray-200 rounded-xl px-2 py-2.5 text-sm outline-none bg-white shrink-0">
                          {PHONE_COUNTRIES.map(c => <option key={c.dial} value={c.dial}>{c.name} ({c.dial})</option>)}
                        </select>
                        <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="8XXXXXXXX" className={inp} />
                      </div>
                      {error && <div className="bg-red-50 border border-red-100 rounded-xl px-3 py-2 text-sm text-red-600">{error}</div>}
                      <button onClick={handleSendOtp} disabled={loading || phone.length < 7} className="w-full flex items-center justify-center gap-2 text-white py-2.5 rounded-xl text-sm font-medium disabled:opacity-60" style={{ background: '#5148E8' }}>
                        {loading && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}Envoyer le code SMS
                      </button>
                    </>
                  ) : (
                    <>
                      {info && <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2 text-sm text-emerald-700">{info}</div>}
                      <input type="text" value={otp} onChange={e => setOtp(e.target.value)} placeholder="Code à 6 chiffres" maxLength={6} className={`${inp} text-center text-xl tracking-widest font-mono`} />
                      {error && <div className="bg-red-50 border border-red-100 rounded-xl px-3 py-2 text-sm text-red-600">{error}</div>}
                      <button onClick={handleVerifyOtp} disabled={loading || otp.length !== 6} className="w-full flex items-center justify-center gap-2 text-white py-2.5 rounded-xl text-sm font-medium disabled:opacity-60" style={{ background: '#5148E8' }}>
                        {loading && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}Confirmer le code
                      </button>
                      <button onClick={() => { setOtpSent(false); setOtp(''); setError(null); setInfo(null); }} className="text-xs text-gray-400 hover:text-gray-600 text-center w-full">Changer de numéro</button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Tokens ─────────────────────────────────────────────────────────────────────

const INDIGO = '#5148E8';
const AMBER  = '#F5A623';
const BG     = '#F4F2EE';
const INK    = '#0F0D0B';
const INK2   = '#6B6560';
const WHITE  = '#FFFFFF';

// ── Reusable section layout ────────────────────────────────────────────────────

function FeatSection({
  tag, title, body, bullets, cta, onCta, mockup, reverse = false, dark = false,
}: {
  tag: string; title: React.ReactNode; body: string; bullets: string[];
  cta?: string; onCta?: () => void; mockup: React.ReactNode;
  reverse?: boolean; dark?: boolean;
}) {
  const bg   = dark ? '#07130D' : reverse ? WHITE : BG;
  const tc   = dark ? '#fff'    : INK;
  const tc2  = dark ? 'rgba(255,255,255,0.55)' : INK2;
  const tagC = dark ? '#25d366' : INDIGO;

  return (
    <section style={{ background: bg, padding: '88px 24px', overflow: 'hidden', position: 'relative' }}>
      <div style={{
        maxWidth: 1100, margin: '0 auto',
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 72,
        alignItems: 'center',
        direction: reverse ? 'rtl' : 'ltr',
      }}>
        <div style={{ direction: 'ltr' }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: tagC, marginBottom: 16 }}>{tag}</p>
          <h2 style={{ fontSize: 'clamp(26px,3.5vw,46px)', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.1, color: tc, marginBottom: 20 }}>{title}</h2>
          <p style={{ fontSize: 15, lineHeight: 1.8, color: tc2, marginBottom: 28, maxWidth: 400 }}>{body}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: cta ? 32 : 0 }}>
            {bullets.map(b => (
              <div key={b} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, color: tc2 }}>
                <div style={{ width: 18, height: 18, borderRadius: '50%', background: dark ? '#25d36622' : `${INDIGO}14`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={dark ? '#25d366' : INDIGO} strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                {b}
              </div>
            ))}
          </div>
          {cta && (
            <button onClick={onCta} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 8, padding: '12px 24px', borderRadius: 100, background: dark ? '#25d366' : INDIGO, border: 'none', color: dark ? '#07130D' : '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: `0 6px 20px ${dark ? '#25d36640' : `${INDIGO}35`}` }}>
              {cta}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </button>
          )}
        </div>
        <div style={{ direction: 'ltr' }}>{mockup}</div>
      </div>
    </section>
  );
}

// ── Mockup components ──────────────────────────────────────────────────────────

function MockupCard({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: WHITE, borderRadius: 20, boxShadow: '0 16px 56px rgba(15,13,11,0.10)', overflow: 'hidden', ...style }}>
      {children}
    </div>
  );
}

function MockupHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(15,13,11,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: INK }}>{title}</div>
        {subtitle && <div style={{ fontSize: 11, color: INK2, marginTop: 2 }}>{subtitle}</div>}
      </div>
      <div style={{ display: 'flex', gap: 5 }}>
        {[BG, BG, BG].map((c, i) => <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: c, border: '1px solid rgba(15,13,11,0.1)' }} />)}
      </div>
    </div>
  );
}

// Stock mockup
function StockMockup() {
  const products = [
    { name: 'Robe Wax Taille M',   qty: 24, max: 30, alert: false },
    { name: 'Sac Cuir Noir',       qty: 4,  max: 20, alert: true  },
    { name: 'Chaussures T38',      qty: 18, max: 20, alert: false },
    { name: 'Collier Doré',        qty: 3,  max: 15, alert: true  },
    { name: 'Jean Slim Taille 32', qty: 12, max: 15, alert: false },
  ];
  return (
    <MockupCard>
      <MockupHeader title="Inventaire" subtitle="47 produits · 5 alertes" />
      <div style={{ padding: '6px 0' }}>
        {products.map(({ name, qty, max, alert }, i) => (
          <div key={name} style={{ padding: '11px 18px', borderBottom: i < products.length - 1 ? '1px solid rgba(15,13,11,0.05)' : 'none', animation: `slideRow .4s ${i * 0.08}s ease both` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
              <span style={{ fontSize: 12.5, fontWeight: 500, color: INK }}>{name}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {alert && (
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 100, background: '#fef2f2', color: '#ef4444', animation: 'pulse 2s infinite' }}>
                    Stock bas
                  </span>
                )}
                <span style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', color: alert ? '#ef4444' : INK2, fontWeight: 600 }}>{qty}/{max}</span>
              </div>
            </div>
            <div style={{ height: 5, borderRadius: 100, background: 'rgba(15,13,11,0.07)', overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 100,
                background: alert ? '#ef4444' : qty / max > 0.7 ? '#22c55e' : AMBER,
                width: `${(qty / max) * 100}%`,
                animation: `barGrow .6s ${i * 0.08 + 0.2}s ease both`,
              }} />
            </div>
          </div>
        ))}
      </div>
    </MockupCard>
  );
}

// Ventes mockup
function VentesMockup() {
  const channels = [
    { name: 'WhatsApp',  val: '847 500 FC', pct: 100, c: '#25d366' },
    { name: 'TikTok',    val: '312 000 FC', pct: 37,  c: '#111' },
    { name: 'Boutique',  val: '187 500 FC', pct: 22,  c: AMBER },
    { name: 'Instagram', val: '95 000 FC',  pct: 11,  c: '#e1306c' },
  ];
  return (
    <MockupCard>
      <MockupHeader title="Ventes par canal" subtitle="Ce mois · Total 1 442 000 FC" />
      <div style={{ padding: '8px 0 4px' }}>
        {channels.map(({ name, val, pct, c }, i) => (
          <div key={name} style={{ padding: '12px 18px', borderBottom: i < channels.length - 1 ? '1px solid rgba(15,13,11,0.05)' : 'none', animation: `slideRow .4s ${i * 0.1}s ease both` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: c }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: INK }}>{name}</span>
              </div>
              <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', color: INK2, fontWeight: 500 }}>{val}</span>
            </div>
            <div style={{ height: 6, borderRadius: 100, background: 'rgba(15,13,11,0.07)', overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 100, background: c, width: `${pct}%`, animation: `barGrow .7s ${i * 0.1 + 0.15}s ease both`, opacity: 0.85 }} />
            </div>
          </div>
        ))}
      </div>
      <div style={{ padding: '12px 18px', borderTop: '1px solid rgba(15,13,11,0.07)', display: 'flex', gap: 8 }}>
        {['Semaine','Mois','Année'].map((t, i) => (
          <div key={t} style={{ padding: '5px 12px', borderRadius: 100, background: i === 1 ? INDIGO : 'rgba(15,13,11,0.06)', color: i === 1 ? '#fff' : INK2, fontSize: 11, fontWeight: 600, cursor: 'default' }}>{t}</div>
        ))}
      </div>
    </MockupCard>
  );
}

// Analytics mockup
function AnalyticsMockup() {
  const bars = [42, 68, 55, 88, 72, 61, 79, 91, 58, 74, 83, 95];
  return (
    <MockupCard>
      <MockupHeader title="Analytique" subtitle="Performances · Ce mois" />
      <div style={{ padding: '14px 18px 0', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
        {[
          { label: 'Marge moyenne', val: '34%',       c: INDIGO },
          { label: 'ROI Publicité',  val: '2.8×',      c: '#22c55e' },
          { label: 'CPA moyen',      val: '2 400 FC',  c: AMBER },
        ].map(({ label, val, c }, i) => (
          <div key={label} style={{ padding: '12px', borderRadius: 12, background: BG, animation: `popIn .5s ${i * 0.1}s ease both` }}>
            <div style={{ fontSize: 10, color: INK2, marginBottom: 6, letterSpacing: '0.03em' }}>{label}</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: c, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums' }}>{val}</div>
          </div>
        ))}
      </div>
      <div style={{ padding: '14px 18px' }}>
        <div style={{ padding: '12px', borderRadius: 12, background: BG }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 10, color: INK2, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>CA vs Bénéfice · 12 mois</span>
            <span style={{ fontSize: 10, color: '#22c55e', fontWeight: 700 }}>+18% ce mois</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 60 }}>
            {bars.map((h, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
                <div style={{ width: '100%', borderRadius: '3px 3px 0 0', height: `${h * 0.6}%`, background: `${INDIGO}35`, animation: `barGrow .5s ${i * 0.04}s ease both` }} />
                <div style={{ width: '100%', borderRadius: '3px 3px 0 0', height: `${h * 0.35}%`, background: i === 11 ? '#22c55e' : `${INDIGO}80`, animation: `barGrow .5s ${i * 0.04 + 0.1}s ease both` }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </MockupCard>
  );
}

// WhatsApp mockup
function WhatsAppMockup() {
  return (
    <div style={{ background: '#0d2016', borderRadius: 20, border: '1px solid rgba(37,211,102,0.12)', overflow: 'hidden', boxShadow: '0 16px 56px rgba(0,0,0,0.25)' }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(37,211,102,0.1)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#25d36618', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="#25d366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#c8f0c8' }}>Inbox WhatsApp</div>
          <div style={{ fontSize: 10, color: 'rgba(200,240,200,0.4)' }}>3 conversations en attente</div>
        </div>
      </div>
      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[
          { name: 'Marie K.',      msg: 'Vous avez encore la robe bleue taille M ?', time: '14:32', unread: 2, c: AMBER },
          { name: 'Jean-Pierre M.', msg: 'Ok, je viens chercher demain matin',        time: '13:18', unread: 0, c: '#25d366' },
          { name: 'IA · Auto-reply', msg: 'Oui disponible à 35 $ — livraison ou boutique ?', time: '12:55', unread: 0, c: INDIGO },
        ].map(({ name, msg, time, unread, c }, i) => (
          <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 12, background: 'rgba(255,255,255,0.05)', animation: `waBubble .4s ${i * 0.15}s ease both` }}>
            <div style={{ width: 34, height: 34, borderRadius: '50%', background: `${c}25`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 12, fontWeight: 700, color: c }}>{name[0]}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(200,240,200,0.9)' }}>{name}</span>
                <span style={{ fontSize: 10, color: 'rgba(200,240,200,0.3)' }}>{time}</span>
              </div>
              <span style={{ fontSize: 11, color: 'rgba(200,240,200,0.5)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{msg}</span>
            </div>
            {unread > 0 && <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#25d366', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><span style={{ fontSize: 10, fontWeight: 700, color: '#07130D' }}>{unread}</span></div>}
          </div>
        ))}
      </div>
    </div>
  );
}

// Logistique mockup
function LogistiqueMockup() {
  const orders = [
    { id: '#284', client: 'Amina Diallo',   adresse: 'Gombe, Kinshasa',  statut: 'En route',   c: AMBER,     bg: `${AMBER}12` },
    { id: '#283', client: 'Pascal Nkusu',   adresse: 'Lemba, Kinshasa',  statut: 'Livré',      c: '#22c55e', bg: '#22c55e12' },
    { id: '#282', client: 'Sophie Mbayo',   adresse: 'Lubumbashi',       statut: 'En attente', c: INK2,      bg: 'rgba(15,13,11,0.05)' },
    { id: '#281', client: 'Alain Kasongo',  adresse: 'Matadi',           statut: 'Dispatché',  c: INDIGO,    bg: `${INDIGO}12` },
  ];
  return (
    <MockupCard>
      <MockupHeader title="Commandes · Logistique" subtitle="4 en cours · 12 ce mois" />
      <div style={{ padding: '6px 0' }}>
        {orders.map(({ id, client, adresse, statut, c, bg }, i) => (
          <div key={id} style={{ padding: '12px 18px', borderBottom: i < orders.length - 1 ? '1px solid rgba(15,13,11,0.05)' : 'none', display: 'flex', alignItems: 'center', gap: 12, animation: `slideRow .4s ${i * 0.08}s ease both` }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: c }}>{id}</span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: INK, marginBottom: 2 }}>{client}</div>
              <div style={{ fontSize: 11, color: INK2 }}>{adresse}</div>
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: c, padding: '3px 10px', borderRadius: 100, background: bg }}>{statut}</span>
          </div>
        ))}
      </div>
      <div style={{ padding: '12px 18px', borderTop: '1px solid rgba(15,13,11,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, color: INK2 }}>Portail partenaire</span>
        <div style={{ fontSize: 11, fontWeight: 600, color: INDIGO, padding: '5px 12px', borderRadius: 100, background: `${INDIGO}10`, cursor: 'default' }}>Copier le lien</div>
      </div>
    </MockupCard>
  );
}

// Kayden Zion mockup
function KaydenMockup() {
  return (
    <div style={{ background: WHITE, borderRadius: 20, boxShadow: '0 16px 56px rgba(15,13,11,0.10)', overflow: 'hidden' }}>
      <div style={{ padding: '14px 18px', borderBottom: `1px solid ${INDIGO}12`, display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 38, height: 38, borderRadius: '50%', background: `linear-gradient(135deg,${INDIGO},#a78bfa)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 12, color: '#fff', flexShrink: 0 }}>KZ</div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: INK }}>Kayden Zion</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: '#a78bfa' }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', animation: 'pulse 2s infinite' }} />
            Analyse vos données en temps réel
          </div>
        </div>
      </div>
      <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ width: 26, height: 26, borderRadius: '50%', background: `linear-gradient(135deg,${INDIGO},#a78bfa)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 900, color: '#fff', flexShrink: 0 }}>KZ</div>
          <div style={{ padding: '10px 14px', borderRadius: '4px 14px 14px 14px', background: `${INDIGO}08`, fontSize: 12.5, color: INK, lineHeight: 1.65, maxWidth: 280 }}>
            Votre produit <strong style={{ color: INDIGO }}>Robe Wax M</strong> convertit à <strong style={{ color: INDIGO }}>34%</strong> sur WhatsApp contre 12% en boutique. Augmentez votre budget pub dessus de 40%.
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ padding: '10px 14px', borderRadius: '14px 4px 14px 14px', background: BG, fontSize: 12.5, color: INK, lineHeight: 1.65, maxWidth: 210 }}>
            Et mon ROI pub ce mois-ci ?
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ width: 26, height: 26, borderRadius: '50%', background: `linear-gradient(135deg,${INDIGO},#a78bfa)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 900, color: '#fff', flexShrink: 0 }}>KZ</div>
          <div style={{ padding: '10px 14px', borderRadius: '4px 14px 14px 14px', background: `${INDIGO}08`, display: 'flex', gap: 4, alignItems: 'center' }}>
            {[0, .2, .4].map(d => <div key={d} style={{ width: 7, height: 7, borderRadius: '50%', background: `${INDIGO}50`, animation: `bounce 1.2s ${d}s infinite` }} />)}
          </div>
        </div>
      </div>
      <div style={{ padding: '10px 14px 14px', display: 'flex', gap: 8 }}>
        <div style={{ flex: 1, background: BG, borderRadius: 100, padding: '8px 14px', fontSize: 12, color: INK2 }}>Posez votre question…</div>
        <div style={{ width: 34, height: 34, borderRadius: '50%', background: INDIGO, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </div>
      </div>
    </div>
  );
}

// Boutique mockup
function BoutiqueMockup() {
  const products = [
    { name: 'Robe Wax Taille M',   price: '35 $', img: '#a78bfa' },
    { name: 'Sac Cuir Noir',       price: '58 $', img: INDIGO },
    { name: 'Chaussures T38',      price: '42 $', img: AMBER },
    { name: 'Collier Doré',        price: '18 $', img: '#f472b6' },
  ];
  return (
    <div style={{ background: WHITE, borderRadius: 20, boxShadow: '0 16px 56px rgba(15,13,11,0.10)', overflow: 'hidden' }}>
      {/* Store header */}
      <div style={{ padding: '14px 18px', background: INDIGO, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 900, color: '#fff' }}>MB</div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>Mode Boutique KIN</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)' }}>boutique.kza.app/modeboutique</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ padding: '5px 10px', borderRadius: 100, background: 'rgba(255,255,255,0.15)', fontSize: 10, fontWeight: 600, color: '#fff', cursor: 'default' }}>Reels</div>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>
          </div>
        </div>
      </div>
      {/* Product grid */}
      <div style={{ padding: '12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {products.map(({ name, price, img }, i) => (
          <div key={name} style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(15,13,11,0.07)', animation: `popIn .4s ${i * 0.09}s ease both` }}>
            <div style={{ height: 72, background: `${img}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: `${img}30`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={img} strokeWidth="1.5"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
              </div>
            </div>
            <div style={{ padding: '8px 10px' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: INK, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: INDIGO }}>{price}</span>
                <div style={{ width: 22, height: 22, borderRadius: '50%', background: INDIGO, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
      {/* WhatsApp CTA */}
      <div style={{ padding: '0 12px 12px' }}>
        <div style={{ background: '#25d366', borderRadius: 12, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>Commander via WhatsApp</span>
        </div>
      </div>
    </div>
  );
}

// Feed mockup
function FeedMockup() {
  const slides = [
    { caption: 'Robe Wax Taille M — collection printemps', price: '35 $', accent: '#a78bfa' },
    { caption: 'Sac cuir noir — edition limitée', price: '58 $', accent: INDIGO },
    { caption: 'Chaussures T38 — confort premium', price: '42 $', accent: AMBER },
  ];
  return (
    <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
      {slides.map(({ caption, price, accent }, i) => (
        <div key={i} style={{
          width: 130, height: 230, borderRadius: 18, overflow: 'hidden', position: 'relative',
          background: `linear-gradient(170deg,${accent}30,${accent}08)`,
          border: `1px solid ${accent}20`,
          boxShadow: i === 1 ? `0 20px 48px ${accent}30` : '0 8px 24px rgba(15,13,11,0.08)',
          transform: i === 0 ? 'rotate(-3deg) translateY(12px)' : i === 2 ? 'rotate(3deg) translateY(12px)' : 'scale(1.05)',
          zIndex: i === 1 ? 2 : 1,
          animation: `popIn .5s ${i * 0.15}s ease both`,
          flexShrink: 0,
        }}>
          {/* Video indicator */}
          <div style={{ position: 'absolute', top: 10, left: 10, display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {i === 1
                ? <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 10, paddingBottom: 1 }}>
                    {[7,10,6,9,8].map((h, j) => <div key={j} style={{ width: 2, borderRadius: 1, background: accent, height: h, animation: `bounce 1s ${j * 0.1}s infinite` }} />)}
                  </div>
                : <svg width="8" height="8" viewBox="0 0 24 24" fill="rgba(255,255,255,0.8)"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              }
            </div>
          </div>
          {/* Mute */}
          <div style={{ position: 'absolute', top: 10, right: 10 }}>
            <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
            </div>
          </div>
          {/* Placeholder visual */}
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 48, height: 48, borderRadius: '50%', background: `${accent}25`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: `${accent}40` }} />
          </div>
          {/* Bottom overlay */}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(to top,rgba(0,0,0,0.7),transparent)', padding: '20px 10px 10px' }}>
            <div style={{ fontSize: 10, color: '#fff', lineHeight: 1.4, marginBottom: 6, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{caption}</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: '#fff' }}>{price}</span>
              <div style={{ padding: '4px 8px', borderRadius: 100, background: accent, fontSize: 9, fontWeight: 700, color: '#fff' }}>Commander</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// Content creation mockup
function ContentMockup() {
  return (
    <MockupCard>
      <MockupHeader title="Studio de Création" subtitle="Pub 15s · Jingle IA · Montage" />
      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Pub 15s */}
        <div style={{ borderRadius: 14, background: BG, padding: '12px 14px', animation: 'slideRow .4s ease both' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: `${INDIGO}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={INDIGO} strokeWidth="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: INK }}>Pub 15 secondes</div>
                <div style={{ fontSize: 10, color: INK2 }}>Photo → Vidéo animée</div>
              </div>
            </div>
            <div style={{ fontSize: 10, fontWeight: 700, color: INDIGO, padding: '3px 8px', borderRadius: 100, background: `${INDIGO}10` }}>IA</div>
          </div>
          <div style={{ height: 5, background: 'rgba(15,13,11,0.08)', borderRadius: 100, overflow: 'hidden', marginBottom: 6 }}>
            <div style={{ height: '100%', width: '68%', background: INDIGO, borderRadius: 100, animation: 'barGrow .8s .3s ease both' }} />
          </div>
          <div style={{ fontSize: 10, color: INK2 }}>Rendu 68% · 00:10 / 00:15</div>
        </div>

        {/* Jingle IA */}
        <div style={{ borderRadius: 14, background: BG, padding: '12px 14px', animation: 'slideRow .4s .1s ease both' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: `${AMBER}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={AMBER} strokeWidth="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: INK }}>Jingle IA</div>
              <div style={{ fontSize: 10, color: INK2 }}>Script généré · Voix : Nova</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 3, alignItems: 'center', height: 24 }}>
            {[4,7,5,9,6,8,4,10,7,5,8,6,9,4,7,5,10,6].map((h, i) => (
              <div key={i} style={{ flex: 1, borderRadius: 2, background: `${AMBER}${i < 11 ? 'CC' : '30'}`, animation: `bounce 1s ${i * 0.06}s infinite`, height: h * 2 }} />
            ))}
          </div>
        </div>

        {/* Voice recorder */}
        <div style={{ borderRadius: 14, background: BG, padding: '12px 14px', animation: 'slideRow .4s .2s ease both' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#ef444415', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: INK }}>Voice-over</div>
                <div style={{ fontSize: 10, color: '#ef4444', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#ef4444', animation: 'pulse 1s infinite' }} />
                  Enregistrement…
                </div>
              </div>
            </div>
            <div style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', color: INK2, fontWeight: 600 }}>0:23</div>
          </div>
        </div>
      </div>
    </MockupCard>
  );
}

// Export mockup
function ExportMockup() {
  return (
    <MockupCard>
      <MockupHeader title="Export de rapports" subtitle="Prêts à partager" />
      <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[
          { name: 'Rapport Ventes — Août 2026',    type: 'Excel', size: '48 Ko', c: '#22c55e' },
          { name: 'Bilan Dépenses — Août 2026',    type: 'PDF',   size: '124 Ko', c: '#ef4444' },
          { name: 'Stock Inventaire complet',       type: 'Excel', size: '31 Ko', c: '#22c55e' },
          { name: 'Rapport Partenaire Kinshasa',   type: 'PDF',   size: '88 Ko', c: '#ef4444' },
        ].map(({ name, type, size, c }, i) => (
          <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 12, background: BG, animation: `slideRow .4s ${i * 0.09}s ease both` }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: `${c}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: c }}>{type}</span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: INK, marginBottom: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
              <div style={{ fontSize: 11, color: INK2 }}>{size}</div>
            </div>
            <div style={{ width: 28, height: 28, borderRadius: '50%', border: `1px solid rgba(15,13,11,0.1)`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'default' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={INK2} strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            </div>
          </div>
        ))}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4 }}>
          <div style={{ padding: '10px', borderRadius: 12, background: `${INDIGO}10`, border: `1px solid ${INDIGO}25`, textAlign: 'center', fontSize: 12, fontWeight: 600, color: INDIGO, cursor: 'default' }}>Exporter Excel</div>
          <div style={{ padding: '10px', borderRadius: 12, background: '#ef444410', border: '1px solid #ef444425', textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#ef4444', cursor: 'default' }}>Exporter PDF</div>
        </div>
      </div>
    </MockupCard>
  );
}

// ── Landing ────────────────────────────────────────────────────────────────────

export function Landing() {
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const openAuth = (mode: AuthMode) => { setAuthMode(mode); setShowAuth(true); };

  return (
    <div style={{ background: BG, color: INK, fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif', minHeight: '100vh', overflowX: 'hidden' }}>

      {/* ── Global CSS ── */}
      <style>{`
        @keyframes floatA { 0%,100%{transform:translateY(0) rotate(0deg)} 33%{transform:translateY(-14px) rotate(1deg)} 66%{transform:translateY(-6px) rotate(-1deg)} }
        @keyframes floatB { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-18px)} }
        @keyframes floatC { 0%,100%{transform:translateY(0) scale(1)} 50%{transform:translateY(-10px) scale(1.02)} }
        @keyframes floatD { 0%,100%{transform:translateY(-4px)} 50%{transform:translateY(8px)} }
        @keyframes slideInUp { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
        @keyframes slideRow  { from{opacity:0;transform:translateX(-10px)} to{opacity:1;transform:translateX(0)} }
        @keyframes popIn     { 0%{opacity:0;transform:scale(0.7) translateY(10px)} 70%{transform:scale(1.05) translateY(-2px)} 100%{opacity:1;transform:scale(1) translateY(0)} }
        @keyframes barGrow   { from{width:0} }
        @keyframes pulse     { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes bounce    { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-5px)} }
        @keyframes waBubble  { from{opacity:0;transform:translateX(-12px)} to{opacity:1;transform:translateX(0)} }
        @media (max-width:768px) {
          .hero-grid,.feat-section-grid,.wa-grid { grid-template-columns:1fr !important; gap:36px !important; direction:ltr !important; }
          .hero-scene { display:none !important; }
          .stats-grid { grid-template-columns:repeat(2,1fr) !important; }
        }
      `}</style>

      {/* ── NAVBAR pill ── */}
      <div style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 50, width: 'calc(100% - 48px)', maxWidth: 1040 }}>
        <nav style={{ background: WHITE, borderRadius: 100, boxShadow: '0 4px 32px rgba(15,13,11,0.10)', padding: '10px 10px 10px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: INDIGO, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ color: '#fff', fontWeight: 900, fontSize: 15 }}>K</span>
            </div>
            <span style={{ fontWeight: 800, fontSize: 15, letterSpacing: '-0.02em', color: INK }}>KZA Manager</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button onClick={() => openAuth('login')} style={{ padding: '8px 18px', borderRadius: 100, background: 'transparent', border: 'none', color: INK2, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>Connexion</button>
            <button onClick={() => openAuth('register')} style={{ padding: '10px 22px', borderRadius: 100, background: INDIGO, border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '0.88')} onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
              Commencer
            </button>
          </div>
        </nav>
      </div>

      {/* ── HERO ── */}
      <section style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', padding: '100px 24px 60px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-10%', right: '-5%', width: 600, height: 600, borderRadius: '50%', background: `radial-gradient(circle,${INDIGO}18 0%,transparent 65%)`, pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: '-5%', left: '20%', width: 400, height: 400, borderRadius: '50%', background: `radial-gradient(circle,${AMBER}14 0%,transparent 65%)`, pointerEvents: 'none' }} />

        <div className="hero-grid" style={{ maxWidth: 1100, margin: '0 auto', width: '100%', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, alignItems: 'center' }}>
          <div style={{ animation: 'slideInUp .7s ease both' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 14px', borderRadius: 100, background: `${INDIGO}12`, border: `1px solid ${INDIGO}25`, marginBottom: 28 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: INDIGO, animation: 'pulse 2s infinite' }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: INDIGO }}>Plateforme n°1 pour e-commerçants africains</span>
            </div>
            <h1 style={{ fontSize: 'clamp(40px,5.5vw,68px)', fontWeight: 800, lineHeight: 1.08, letterSpacing: '-0.03em', color: INK, marginBottom: 24 }}>
              Gérez votre<br />business<br /><span style={{ color: INDIGO }}>comme un pro.</span>
            </h1>
            <p style={{ fontSize: 17, lineHeight: 1.7, color: INK2, marginBottom: 36, maxWidth: 420 }}>
              Stock, ventes, WhatsApp CRM et IA business — tout ce qu'il faut pour faire croître votre boutique, en un seul endroit.
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 28 }}>
              <button onClick={() => openAuth('register')} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 28px', borderRadius: 100, background: INDIGO, border: 'none', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', boxShadow: `0 6px 24px ${INDIGO}40`, transition: 'all .2s' }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 12px 36px ${INDIGO}50`; }}
                onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = `0 6px 24px ${INDIGO}40`; }}>
                Créer mon compte gratuit
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </button>
              <button onClick={() => openAuth('login')} style={{ padding: '14px 24px', borderRadius: 100, background: WHITE, border: `1.5px solid rgba(15,13,11,0.12)`, color: INK, fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
                Se connecter
              </button>
            </div>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              {['Gratuit pour démarrer', 'Aucune carte requise', 'Support en français'].map(t => (
                <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: INK2 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  {t}
                </div>
              ))}
            </div>
          </div>

          {/* Hero scene */}
          <div className="hero-scene" style={{ position: 'relative', height: 520 }}>
            {/* Main dashboard */}
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 300, zIndex: 3 }}>
              <div style={{ background: WHITE, borderRadius: 20, boxShadow: '0 24px 64px rgba(15,13,11,0.14)', overflow: 'hidden', animation: 'slideInUp .8s .1s ease both' }}>
                <div style={{ background: INDIGO, padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>Tableau de bord</span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {[.3,.5,.8].map((o, i) => <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: `rgba(255,255,255,${o})` }} />)}
                  </div>
                </div>
                <div style={{ padding: '14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {[
                    { l: "Chiffre d'affaires", v: '847 500', u: 'FC', c: INDIGO },
                    { l: 'Bénéfice net',        v: '312 000', u: 'FC', c: '#22c55e' },
                  ].map(({ l, v, u, c }) => (
                    <div key={l} style={{ padding: '10px 12px', borderRadius: 12, background: BG }}>
                      <div style={{ fontSize: 9, color: INK2, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{l}</div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: c, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>{v} <span style={{ fontSize: 10, fontWeight: 500 }}>{u}</span></div>
                    </div>
                  ))}
                </div>
                <div style={{ padding: '0 14px 14px' }}>
                  <div style={{ background: BG, borderRadius: 12, padding: '10px 12px' }}>
                    <div style={{ fontSize: 9, color: INK2, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Ventes 30 jours · +18%</div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 40 }}>
                      {[55,72,48,88,65,78,42,91,60,75,50,83].map((h, i) => (
                        <div key={i} style={{ flex: 1, borderRadius: '3px 3px 0 0', background: i === 11 ? AMBER : i % 3 === 0 ? INDIGO : `${INDIGO}35`, animation: `barGrow .6s ${i * 0.04}s ease both`, height: `${h}%` }} />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Floating — paiement */}
            <div style={{ position: 'absolute', top: '4%', right: '2%', zIndex: 5, animation: 'popIn .6s .4s ease both, floatB 4s 1s ease-in-out infinite' }}>
              <div style={{ background: WHITE, borderRadius: 16, boxShadow: '0 12px 40px rgba(15,13,11,0.12)', padding: '12px 16px', minWidth: 150 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e' }} />
                  <span style={{ fontSize: 10, color: INK2 }}>Nouveau paiement</span>
                </div>
                <div style={{ fontSize: 18, fontWeight: 800, color: INK, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>+35 $</div>
                <div style={{ fontSize: 10, color: INK2, marginTop: 2 }}>Robe Wax M · WhatsApp</div>
              </div>
            </div>

            {/* Floating — WhatsApp */}
            <div style={{ position: 'absolute', bottom: '18%', left: '-2%', zIndex: 5, animation: 'popIn .6s .7s ease both, floatC 5s 1.3s ease-in-out infinite' }}>
              <div style={{ background: '#0a1f10', borderRadius: 16, boxShadow: '0 12px 40px rgba(0,0,0,0.18)', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, minWidth: 200 }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#25d36620', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="#25d366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#c8f0c8', marginBottom: 2 }}>Marie K. · maintenant</div>
                  <div style={{ fontSize: 11, color: 'rgba(200,240,200,0.6)' }}>Vous avez la taille M ?</div>
                </div>
              </div>
            </div>

            {/* Floating — livraison */}
            <div style={{ position: 'absolute', top: '12%', left: '4%', zIndex: 5, animation: 'popIn .6s 1s ease both, floatD 3.5s 1.6s ease-in-out infinite' }}>
              <div style={{ background: WHITE, borderRadius: 14, boxShadow: '0 8px 32px rgba(15,13,11,0.10)', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 30, height: 30, borderRadius: 10, background: `${AMBER}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={AMBER} strokeWidth="2"><rect x="1" y="3" width="15" height="13"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: INK }}>Commande #284</div>
                  <div style={{ fontSize: 10, color: AMBER, fontWeight: 600 }}>En route · Gombe</div>
                </div>
              </div>
            </div>

            {/* Floating — Kayden */}
            <div style={{ position: 'absolute', bottom: '5%', right: '4%', zIndex: 5, animation: 'popIn .6s 1.3s ease both, floatA 7s 2s ease-in-out infinite' }}>
              <div style={{ background: `linear-gradient(135deg,${INDIGO},#8b80f8)`, borderRadius: 100, boxShadow: `0 8px 28px ${INDIGO}40`, padding: '9px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 900, color: '#fff' }}>KZ</div>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#fff' }}>Kayden Zion analyse vos données…</span>
                <div style={{ display: 'flex', gap: 3 }}>
                  {[0, .2, .4].map(d => <div key={d} style={{ width: 4, height: 4, borderRadius: '50%', background: 'rgba(255,255,255,0.6)', animation: `bounce 1.2s ${d}s infinite` }} />)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── STATS ── */}
      <div style={{ background: WHITE, borderTop: '1px solid rgba(15,13,11,0.07)', borderBottom: '1px solid rgba(15,13,11,0.07)' }}>
        <div className="stats-grid" style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px', display: 'grid', gridTemplateColumns: 'repeat(4,1fr)' }}>
          {[
            { num: '500+',    label: 'Boutiques actives' },
            { num: '10 000+', label: 'Produits suivis' },
            { num: '20',      label: 'Pays africains' },
            { num: '24/7',    label: 'IA disponible' },
          ].map(({ num, label }, i) => (
            <div key={label} style={{ padding: '28px 20px', textAlign: 'center', borderRight: i < 3 ? '1px solid rgba(15,13,11,0.07)' : 'none' }}>
              <div style={{ fontSize: 36, fontWeight: 900, letterSpacing: '-0.04em', color: INK, fontVariantNumeric: 'tabular-nums', marginBottom: 4 }}>{num}</div>
              <div style={{ fontSize: 12, color: INK2 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── STOCK ── */}
      <FeatSection
        tag="Gestion de Stock"
        title={<>Sachez toujours ce<br />que vous avez en stock.</>}
        body="Suivez chaque produit en temps réel. Recevez des alertes automatiques quand un article est bas, gérez plusieurs emplacements et affectez du stock à vos partenaires de livraison."
        bullets={[
          'Alertes stock bas automatiques par produit',
          'Mouvements d\'entrée et sortie tracés',
          'Stock par emplacement partenaire',
          'Historique complet des variations',
        ]}
        mockup={<StockMockup />}
      />

      {/* ── VENTES ── */}
      <FeatSection
        tag="Ventes Multicanal"
        title={<>Tous vos canaux,<br />un seul tableau de bord.</>}
        body="WhatsApp, TikTok, Instagram, boutique physique — enregistrez chaque vente avec son canal, son statut de paiement et votre marge. Comparez ce qui performe vraiment."
        bullets={[
          'Ventes par canal avec graphiques comparatifs',
          'Statut de paiement (payé, en attente, remboursé)',
          'Marge nette calculée automatiquement',
          'Historique client et récapitulatif par produit',
        ]}
        mockup={<VentesMockup />}
        reverse
      />

      {/* ── ANALYTIQUE ── */}
      <FeatSection
        tag="Analytique Avancée"
        title={<>Les chiffres qui<br />comptent vraiment.</>}
        body="Pas juste votre chiffre d'affaires — votre vraie marge, votre ROI pub, votre CPA et la rotation de votre stock. Identifiez ce qui scale et ce qu'il faut arrêter, en un coup d'oeil."
        bullets={[
          'Marge par produit et par catégorie',
          'ROI publicitaire et coût par acquisition',
          'Rotation de stock et produits dormants',
          'Évolution CA vs Bénéfice sur 12 mois',
        ]}
        mockup={<AnalyticsMockup />}
      />

      {/* ── WHATSAPP ── */}
      <FeatSection
        tag="WhatsApp CRM Natif"
        title={<>En RDC, le commerce<br />vit sur <span style={{ color: '#25d366' }}>WhatsApp.</span></>}
        body="Gérez tous vos leads depuis un seul écran. L'IA répond automatiquement quand vous n'êtes pas disponible et crée la commande dans votre dashboard — sans que vous leviez le doigt."
        bullets={[
          'Inbox centralisé — tous vos chats en un endroit',
          'Réponses IA basées sur votre catalogue de produits',
          'Tags, statuts et segments pour organiser vos clients',
          'Automatisations : relances, confirmations, suivi',
        ]}
        cta="Connecter mon WhatsApp"
        onCta={() => openAuth('register')}
        mockup={<WhatsAppMockup />}
        reverse
        dark
      />

      {/* ── LOGISTIQUE ── */}
      <FeatSection
        tag="Logistique"
        title={<>Vos livraisons,<br />zéro friction.</>}
        body="Créez des commandes, affectez des partenaires de livraison et suivez chaque colis en temps réel. Votre livreur accède à ses commandes via un lien sécurisé — sans compte, sans application."
        bullets={[
          'Commandes par statut : en attente, dispatché, livré',
          'Partenaires avec leur propre stock dédié',
          'Portail partenaire public accessible par lien',
          'Notification WhatsApp automatique au livreur',
        ]}
        cta="Essayer gratuitement"
        onCta={() => openAuth('register')}
        mockup={<LogistiqueMockup />}
      />

      {/* ── KAYDEN ZION ── */}
      <FeatSection
        tag="Intelligence Artificielle"
        title={<>Kayden Zion —<br /><span style={{ color: '#a78bfa' }}>votre consultante business.</span></>}
        body="Elle analyse vos vraies données et vous conseille en temps réel. En chat ou en appel vocal. Pas des conseils génériques — des recommandations concrètes basées sur vos marges, vos ventes, vos leads."
        bullets={[
          'Analyse basée sur vos données réelles, pas génériques',
          'Voix naturelle — qualité GPT-4o Voice',
          '5 minutes de consultation vocale toutes les 3h',
          'Recommandations : scale, stop, réinvestir',
        ]}
        cta="Parler à Kayden"
        onCta={() => openAuth('register')}
        mockup={<KaydenMockup />}
        reverse
      />

      {/* ── BOUTIQUE ── */}
      <FeatSection
        tag="Boutique Publique"
        title={<>Votre boutique en ligne,<br />en 2 minutes.</>}
        body="Créez votre boutique publique avec votre lien personnalisé. Vos clients parcourent vos produits, ajoutent au panier et commandent directement via WhatsApp — sans application, sans friction."
        bullets={[
          'Lien unique boutique.kza.app/votre-boutique',
          'Catalogue produits avec prix, photos et catégories',
          'Panier + commande WhatsApp en un clic',
          'Vue Reels pour présenter vos produits en vidéo',
        ]}
        cta="Créer ma boutique"
        onCta={() => openAuth('register')}
        mockup={<BoutiqueMockup />}
        reverse
      />

      {/* ── FEED ── */}
      <FeatSection
        tag="Fil de Contenus"
        title={<>Vos produits présentés<br />comme des <span style={{ color: INDIGO }}>Reels.</span></>}
        body="Un fil de vidéos et photos défilant à la verticale, directement dans votre boutique. Vos clients swipent, découvrent et commandent sans quitter le fil — comme TikTok, mais pour vos ventes."
        bullets={[
          'Format plein écran vertical snap-scroll',
          'Vidéo auto-play et audio toggle intégrés',
          'Lien direct vers le produit avec bouton Commander',
          'Partageable par lien individuel par reel',
        ]}
        cta="Essayer le fil"
        onCta={() => openAuth('register')}
        mockup={<FeedMockup />}
      />

      {/* ── CRÉATION CONTENU ── */}
      <FeatSection
        tag="Studio de Création"
        title={<>Créez votre pub<br />sans agence, sans budget.</>}
        body="Transformez une photo produit en vidéo animée 15 secondes, générez un jingle par IA avec votre script, enregistrez un voice-over et montez vos vidéos — tout depuis le navigateur, sans logiciel."
        bullets={[
          'Photo → Vidéo pub 15s avec effets Ken Burns',
          'Jingle IA : script automatique + synthèse vocale',
          'Voice-over enregistré directement dans l\'app',
          'Montage vidéo : trim, sous-titres et export',
        ]}
        cta="Créer mon premier contenu"
        onCta={() => openAuth('register')}
        mockup={<ContentMockup />}
        reverse
      />

      {/* ── EXPORT ── */}
      <FeatSection
        tag="Export & Rapports"
        title={<>Des rapports prêts<br />en un clic.</>}
        body="Exportez vos données de ventes, dépenses et stock en Excel ou PDF. Rapports formatés pour votre comptable, vos investisseurs ou vos déclarations fiscales."
        bullets={[
          'Export Excel complet : ventes, stock, dépenses',
          'Rapports PDF formatés et prêts à imprimer',
          'Rapport personnalisé par partenaire logistique',
          'Bilan mensuel et annuel automatique',
        ]}
        mockup={<ExportMockup />}
      />

      {/* ── CTA ── */}
      <section style={{ padding: '100px 24px', background: INK, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-30%', left: '50%', transform: 'translateX(-50%)', width: 600, height: 600, borderRadius: '50%', background: `radial-gradient(circle,${INDIGO}20 0%,transparent 70%)`, pointerEvents: 'none' }} />
        <div style={{ maxWidth: 680, margin: '0 auto', textAlign: 'center', position: 'relative' }}>
          <h2 style={{ fontSize: 'clamp(32px,5vw,60px)', fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1.05, color: WHITE, marginBottom: 20 }}>
            Tout votre business.<br /><span style={{ color: AMBER }}>Un seul endroit.</span>
          </h2>
          <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7, marginBottom: 40 }}>
            Rejoignez des centaines d'entrepreneurs en RDC et en Afrique qui font croître leur boutique avec KZA Manager.
          </p>
          <button onClick={() => openAuth('register')} style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '16px 36px', borderRadius: 100, background: AMBER, border: 'none', color: INK, fontSize: 15, fontWeight: 800, cursor: 'pointer', boxShadow: `0 12px 40px ${AMBER}40`, transition: 'all .2s' }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 20px 56px ${AMBER}50`; }}
            onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = `0 12px 40px ${AMBER}40`; }}>
            Créer mon compte — c'est gratuit
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </button>
          <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 24, marginTop: 28 }}>
            {['Aucune carte requise', 'Support en français', 'Données sécurisées'].map(t => (
              <span key={t} style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)' }}>{t}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ padding: '24px', background: INK, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: INDIGO, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ color: '#fff', fontSize: 12, fontWeight: 900 }}>K</span>
            </div>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.4)' }}>KZA Manager</span>
          </div>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)' }}>Conçu pour les entrepreneurs en RDC et en Afrique</p>
          <div style={{ display: 'flex', gap: 16 }}>
            <button onClick={() => openAuth('login')} style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', background: 'none', border: 'none', cursor: 'pointer' }}>Connexion</button>
            <button onClick={() => openAuth('register')} style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', background: 'none', border: 'none', cursor: 'pointer' }}>S'inscrire</button>
          </div>
        </div>
      </footer>

      {showAuth && <AuthModal initialMode={authMode} onClose={() => setShowAuth(false)} />}
    </div>
  );
}
