import { useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  Package, ShoppingCart, CreditCard, BarChart3,
  MessageSquare, BrainCircuit, ArrowRight, Check,
  Zap, Shield, TrendingUp, Globe,
  ChevronRight, X, Store,
} from 'lucide-react';

type AuthMode = 'login' | 'register';

const FEATURES = [
  {
    icon: Package,
    color: '#6366f1',
    bg: '#eef2ff',
    title: 'Gestion de Stock',
    desc: 'Suivez vos produits en temps réel, recevez des alertes stock bas et gérez vos mouvements.',
  },
  {
    icon: ShoppingCart,
    color: '#10b981',
    bg: '#ecfdf5',
    title: 'Suivi des Ventes',
    desc: 'Enregistrez chaque vente par canal (WhatsApp, TikTok, Boutique...) avec statut de paiement.',
  },
  {
    icon: CreditCard,
    color: '#f59e0b',
    bg: '#fffbeb',
    title: 'Gestion des Dépenses',
    desc: 'Catégorisez vos dépenses (pub, transport, stock) et calculez votre bénéfice net réel.',
  },
  {
    icon: BarChart3,
    color: '#8b5cf6',
    bg: '#f5f3ff',
    title: 'Analytique avancée',
    desc: 'Visualisez vos tendances, comparez vos périodes et identifiez vos meilleures opportunités.',
  },
  {
    icon: MessageSquare,
    color: '#25d366',
    bg: '#f0fdf4',
    title: 'CRM WhatsApp',
    desc: 'Gérez vos leads, automatisez vos réponses avec l\'IA et convertissez plus de prospects.',
  },
  {
    icon: BrainCircuit,
    color: '#6366f1',
    bg: 'linear-gradient(135deg, #eef2ff, #f5f3ff)',
    title: 'Kayden Zion IA',
    desc: 'Votre experte IA en développement business. Analyse vos données et vous conseille par chat ou appel vocal.',
    badge: 'Nouveau',
  },
];

const STEPS = [
  {
    num: '01',
    title: 'Créez votre compte',
    desc: 'Inscription en 30 secondes. Aucune carte bancaire requise.',
    color: '#6366f1',
  },
  {
    num: '02',
    title: 'Ajoutez vos données',
    desc: 'Importez ou saisissez vos produits, ventes et dépenses.',
    color: '#8b5cf6',
  },
  {
    num: '03',
    title: 'Kayden vous conseille',
    desc: 'L\'IA analyse tout et vous donne des recommandations actionnables.',
    color: '#a855f7',
  },
];

const STATS = [
  { label: 'Boutiques actives', value: '500+', Icon: Store },
  { label: 'Produits gérés', value: '10 000+', Icon: Package },
  { label: 'WhatsApp CRM intégré', value: 'Natif', Icon: MessageSquare },
  { label: 'IA Business', value: '24/7', Icon: BrainCircuit },
];

const PHONE_COUNTRIES = [
  { name: 'RD Congo', dial: '+243' },
  { name: 'Côte d\'Ivoire', dial: '+225' },
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

type InputMethod = 'email' | 'phone';

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

  const switchMode = (m: AuthMode) => {
    setMode(m); setError(null); setInfo(null); setOtpSent(false); setShowReset(false);
  };

  const handleGoogle = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: (import.meta.env.VITE_APP_URL ?? window.location.origin) + '/' },
    });
    if (error) { setError(error.message); setLoading(false); }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError(null); setInfo(null);
    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
    } else {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) setError(error.message);
      else setInfo('Vérifiez votre email pour confirmer votre compte.');
    }
    setLoading(false);
  };

  const handleSendOtp = async () => {
    setLoading(true); setError(null);
    const { error } = await supabase.auth.signInWithOtp({ phone: fullPhone });
    if (error) setError(error.message);
    else { setOtpSent(true); setInfo('Code envoyé par SMS.'); }
    setLoading(false);
  };

  const handleVerifyOtp = async () => {
    setLoading(true); setError(null);
    const { error } = await supabase.auth.verifyOtp({ phone: fullPhone, token: otp, type: 'sms' });
    if (error) setError(error.message);
    setLoading(false);
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: `${window.location.origin}/#/reset-password`,
    });
    if (error) setError(error.message);
    else setResetSent(true);
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-xl flex items-center justify-center">
              <span className="text-white text-sm font-black">K</span>
            </div>
            <span className="font-bold text-gray-900">KZA Manager</span>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 transition-colors">
            <X size={18} className="text-gray-400" />
          </button>
        </div>

        <div className="p-6">
          {showReset ? (
            <div className="space-y-4">
              <button onClick={() => setShowReset(false)} className="text-sm text-gray-400 hover:text-gray-600 mb-2">
                &larr; Retour
              </button>
              <div>
                <p className="font-semibold text-gray-900 mb-1">Mot de passe oublié ?</p>
                <p className="text-sm text-gray-500">Entrez votre email, nous vous enverrons un lien de réinitialisation.</p>
              </div>
              {resetSent ? (
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 text-sm text-emerald-700">
                  Email envoyé. Vérifiez votre boîte de réception.
                </div>
              ) : (
                <form onSubmit={handleReset} className="space-y-3">
                  <input type="email" required value={resetEmail} onChange={e => setResetEmail(e.target.value)}
                    placeholder="votre@email.com"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                  {error && <div className="bg-red-50 border border-red-100 rounded-xl px-3 py-2 text-sm text-red-600">{error}</div>}
                  <button type="submit" disabled={loading}
                    className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white py-2.5 rounded-xl text-sm font-medium transition-colors">
                    {loading && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                    Envoyer le lien
                  </button>
                </form>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
                {(['login', 'register'] as AuthMode[]).map(m => (
                  <button key={m} onClick={() => switchMode(m)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${mode === m ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                    {m === 'login' ? 'Connexion' : 'Créer un compte'}
                  </button>
                ))}
              </div>

              <button onClick={handleGoogle} disabled={loading}
                className="w-full flex items-center justify-center gap-3 border border-gray-200 rounded-xl py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 transition-colors">
                <svg width="18" height="18" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                {mode === 'login' ? 'Continuer avec Google' : 'Créer un compte avec Google'}
              </button>

              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-gray-200" />
                <span className="text-xs text-gray-400">ou</span>
                <div className="flex-1 h-px bg-gray-200" />
              </div>

              <div className="flex gap-1 p-1 rounded-xl bg-gray-100">
                {(['email', 'phone'] as InputMethod[]).map(m => (
                  <button key={m} onClick={() => { setInputMethod(m); setError(null); setOtpSent(false); }}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${inputMethod === m ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
                    {m === 'email' ? 'Email' : 'Téléphone'}
                  </button>
                ))}
              </div>

              {inputMethod === 'email' && (
                <form onSubmit={handleEmailSubmit} className="space-y-3">
                  <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="vous@exemple.com"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                  <div>
                    <input type="password" required value={password} onChange={e => setPassword(e.target.value)}
                      placeholder="Mot de passe" minLength={6}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                    {mode === 'login' && (
                      <button type="button" onClick={() => { setShowReset(true); setError(null); }}
                        className="text-xs text-indigo-500 hover:text-indigo-700 mt-1.5 text-right w-full transition-colors">
                        Mot de passe oublié ?
                      </button>
                    )}
                  </div>
                  {error && <div className="bg-red-50 border border-red-100 rounded-xl px-3 py-2 text-sm text-red-600">{error}</div>}
                  {info && <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2 text-sm text-emerald-700">{info}</div>}
                  <button type="submit" disabled={loading}
                    className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white py-2.5 rounded-xl text-sm font-medium transition-colors">
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
                        <select value={dialCode} onChange={e => setDialCode(e.target.value)}
                          className="border border-gray-200 rounded-xl px-2 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-white shrink-0">
                          {PHONE_COUNTRIES.map(c => (
                            <option key={c.dial} value={c.dial}>{c.name} ({c.dial})</option>
                          ))}
                        </select>
                        <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                          placeholder="8XXXXXXXX"
                          className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                      </div>
                      {error && <div className="bg-red-50 border border-red-100 rounded-xl px-3 py-2 text-sm text-red-600">{error}</div>}
                      <button onClick={handleSendOtp} disabled={loading || phone.length < 7}
                        className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white py-2.5 rounded-xl text-sm font-medium transition-colors">
                        {loading && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                        Envoyer le code SMS
                      </button>
                    </>
                  ) : (
                    <>
                      {info && <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2 text-sm text-emerald-700">{info}</div>}
                      <input type="text" value={otp} onChange={e => setOtp(e.target.value)}
                        placeholder="Code à 6 chiffres" maxLength={6}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 text-center text-xl tracking-widest font-mono" />
                      {error && <div className="bg-red-50 border border-red-100 rounded-xl px-3 py-2 text-sm text-red-600">{error}</div>}
                      <button onClick={handleVerifyOtp} disabled={loading || otp.length !== 6}
                        className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white py-2.5 rounded-xl text-sm font-medium transition-colors">
                        {loading && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                        Confirmer le code
                      </button>
                      <button onClick={() => { setOtpSent(false); setOtp(''); setError(null); setInfo(null); }}
                        className="text-xs text-gray-400 hover:text-gray-600 text-center w-full transition-colors">
                        Changer de numéro
                      </button>
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

export function Landing() {
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('login');

  const openAuth = (mode: AuthMode) => { setAuthMode(mode); setShowAuth(true); };

  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>

      {/* ── NAVBAR ── */}
      <nav className="fixed top-0 left-0 right-0 z-40 bg-white/90 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center shadow-md">
              <span className="text-white font-black text-lg">K</span>
            </div>
            <span className="font-black text-gray-900 text-lg">KZA Manager</span>
          </div>
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">Fonctionnalités</a>
            <a href="#how" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">Comment ça marche</a>
            <a href="#kayden" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">Kayden Zion IA</a>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => openAuth('login')}
              className="text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors px-3 py-1.5">
              Se connecter
            </button>
            <button onClick={() => openAuth('register')}
              className="text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 transition-colors px-4 py-2 rounded-xl shadow-sm">
              Commencer
            </button>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="relative pt-24 pb-20 overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 40%, #4c1d95 70%, #2e1065 100%)' }}>
        {/* Decorative blobs */}
        <div className="absolute top-20 left-10 w-72 h-72 rounded-full opacity-10"
          style={{ background: '#6366f1', filter: 'blur(80px)' }} />
        <div className="absolute bottom-10 right-10 w-96 h-96 rounded-full opacity-10"
          style={{ background: '#8b5cf6', filter: 'blur(100px)' }} />

        <div className="max-w-6xl mx-auto px-6 relative z-10">
          <div className="max-w-3xl">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-6 text-xs font-medium text-indigo-200"
              style={{ background: 'rgba(99,102,241,0.25)', border: '1px solid rgba(99,102,241,0.4)' }}>
              <div className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
              Plateforme pour e-commerçants en RDC
            </div>

            {/* Title */}
            <h1 className="text-5xl md:text-6xl font-black text-white leading-tight mb-6">
              Gérez votre business.<br />
              <span style={{ color: '#a5b4fc' }}>Développez vos ventes.</span>
            </h1>

            <p className="text-xl text-indigo-200 mb-10 leading-relaxed max-w-xl">
              Stock, ventes, dépenses, CRM WhatsApp et IA business — tout en un seul endroit. Conçu pour les entrepreneurs en RDC et en Afrique.
            </p>

            {/* CTAs */}
            <div className="flex flex-wrap gap-4 mb-12">
              <button onClick={() => openAuth('register')}
                className="flex items-center gap-2 px-6 py-3.5 bg-white text-indigo-700 font-bold rounded-2xl shadow-xl hover:shadow-2xl hover:scale-105 transition-all text-sm">
                Commencer gratuitement
                <ArrowRight size={16} />
              </button>
              <button onClick={() => openAuth('login')}
                className="flex items-center gap-2 px-6 py-3.5 text-white font-medium rounded-2xl border border-white/30 hover:bg-white/10 transition-all text-sm">
                J'ai déjà un compte
                <ChevronRight size={16} />
              </button>
            </div>

            {/* Trust badges */}
            <div className="flex flex-wrap gap-6 text-sm text-indigo-300">
              {['Gratuit pour démarrer', 'Aucune carte requise', 'Support en français'].map(t => (
                <div key={t} className="flex items-center gap-1.5">
                  <Check size={14} className="text-emerald-400" />
                  <span>{t}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Dashboard mockup */}
          <div className="mt-16 relative">
            <div className="rounded-2xl overflow-hidden shadow-2xl border border-white/10"
              style={{ background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(10px)' }}>
              {/* Fake browser bar */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-400 opacity-70" />
                  <div className="w-3 h-3 rounded-full bg-yellow-400 opacity-70" />
                  <div className="w-3 h-3 rounded-full bg-green-400 opacity-70" />
                </div>
                <div className="flex-1 mx-4 bg-white/10 rounded-md py-1 px-3 text-xs text-white/40">
                  app.kzamanager.com
                </div>
              </div>
              {/* Fake dashboard */}
              <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'Chiffre d\'affaires', val: '847 500 FC', color: '#6366f1', icon: TrendingUp },
                  { label: 'Bénéfice net', val: '312 000 FC', color: '#10b981', icon: Zap },
                  { label: 'Produits en stock', val: '47', color: '#f59e0b', icon: Package },
                  { label: 'Leads WhatsApp', val: '128', color: '#25d366', icon: MessageSquare },
                ].map(({ label, val, color, icon: Icon }) => (
                  <div key={label} className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.07)' }}>
                    <div className="w-8 h-8 rounded-lg mb-2 flex items-center justify-center" style={{ background: `${color}22` }}>
                      <Icon size={16} style={{ color }} />
                    </div>
                    <p className="text-xs text-white/50 mb-0.5">{label}</p>
                    <p className="font-bold text-white text-sm">{val}</p>
                  </div>
                ))}
              </div>
              {/* Fake chart bar */}
              <div className="px-6 pb-6">
                <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.05)' }}>
                  <p className="text-xs text-white/40 mb-3">Ventes par canal (30 jours)</p>
                  <div className="flex items-end gap-2 h-16">
                    {[65, 40, 85, 55, 70, 45, 90, 60, 75, 50].map((h, i) => (
                      <div key={i} className="flex-1 rounded-sm opacity-70 transition-all"
                        style={{ height: `${h}%`, background: i % 3 === 0 ? '#6366f1' : i % 3 === 1 ? '#8b5cf6' : '#a855f7' }} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
            {/* Glow */}
            <div className="absolute -inset-4 rounded-3xl opacity-20 blur-2xl -z-10"
              style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }} />
          </div>
        </div>
      </section>

      {/* ── STATS ── */}
      <section className="py-12 border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {STATS.map(({ label, value, Icon }) => (
              <div key={label} className="text-center">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center mx-auto mb-2">
                  <Icon size={20} className="text-indigo-500" />
                </div>
                <p className="text-2xl font-black text-gray-900">{value}</p>
                <p className="text-sm text-gray-500 mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" className="py-20 bg-gray-50">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-14">
            <p className="text-sm font-semibold text-indigo-600 uppercase tracking-wider mb-3">Fonctionnalités</p>
            <h2 className="text-4xl font-black text-gray-900">Tout ce dont vous avez besoin</h2>
            <p className="text-gray-500 mt-3 max-w-lg mx-auto">Une plateforme complète pour gérer, analyser et développer votre business e-commerce.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map(({ icon: Icon, color, bg, title, desc, badge }) => (
              <div key={title}
                className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-md hover:-translate-y-0.5 transition-all">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                    style={{ background: bg }}>
                    <Icon size={22} style={{ color }} />
                  </div>
                  {badge && (
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full text-indigo-600"
                      style={{ background: '#eef2ff' }}>
                      {badge}
                    </span>
                  )}
                </div>
                <h3 className="font-bold text-gray-900 mb-2">{title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── KAYDEN ZION ── */}
      <section id="kayden" className="py-20 overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)' }}>
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            {/* Text */}
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-6 text-xs font-medium text-indigo-300"
                style={{ background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.3)' }}>
                <BrainCircuit size={12} className="text-indigo-400" />
                Intelligence artificielle avancée
              </div>
              <h2 className="text-4xl font-black text-white mb-4">
                Rencontrez<br />
                <span style={{ color: '#a5b4fc' }}>Kayden Zion</span>
              </h2>
              <p className="text-indigo-200 leading-relaxed mb-8">
                Votre experte IA en développement business. Elle analyse vos données en temps réel et vous conseille comme une vraie consultante — par chat ou en appel vocal interactif.
              </p>
              <div className="space-y-3 mb-8">
                {[
                  'Analyses basées sur vos vraies données',
                  'Voix naturelle (qualité ChatGPT)',
                  '5 min de consultation vocale toutes les 3h',
                  'Conseils stratégiques actionnables',
                ].map(item => (
                  <div key={item} className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-full bg-indigo-500/20 flex items-center justify-center shrink-0">
                      <Check size={11} className="text-indigo-400" />
                    </div>
                    <span className="text-sm text-indigo-200">{item}</span>
                  </div>
                ))}
              </div>
              <button onClick={() => openAuth('register')}
                className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-2xl transition-all text-sm">
                Parler à Kayden Zion
                <ArrowRight size={16} />
              </button>
            </div>

            {/* Avatar card */}
            <div className="flex justify-center">
              <div className="relative">
                {/* Glow */}
                <div className="absolute inset-0 rounded-3xl blur-3xl opacity-30"
                  style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }} />
                <div className="relative rounded-3xl p-8 text-center"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(99,102,241,0.3)', backdropFilter: 'blur(20px)' }}>
                  {/* Avatar */}
                  <div className="relative inline-block mb-4">
                    <div className="absolute inset-0 rounded-full animate-ping opacity-20"
                      style={{ background: '#6366f1', scale: '1.2' }} />
                    <div className="w-28 h-28 rounded-full flex items-center justify-center text-white text-5xl font-black shadow-2xl relative z-10"
                      style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
                      KZ
                    </div>
                  </div>
                  <p className="text-white font-bold text-xl">Kayden Zion</p>
                  <p className="text-indigo-300 text-sm mb-4">Experte en développement business</p>
                  {/* Mock chat bubble */}
                  <div className="text-left rounded-2xl px-4 py-3 text-sm text-indigo-100"
                    style={{ background: 'rgba(99,102,241,0.2)' }}>
                    "Bonjour ! J'ai analysé vos ventes du mois. Vos leads WhatsApp convertissent à 23% — je vous suggère de..."
                  </div>
                  {/* Badges */}
                  <div className="flex flex-wrap gap-2 mt-4 justify-center">
                    {['Chat texte', 'Appel vocal', 'Données live'].map(b => (
                      <span key={b} className="text-xs px-2.5 py-1 rounded-full text-indigo-300"
                        style={{ background: 'rgba(99,102,241,0.2)' }}>
                        {b}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how" className="py-20">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-14">
            <p className="text-sm font-semibold text-indigo-600 uppercase tracking-wider mb-3">Simple & rapide</p>
            <h2 className="text-4xl font-black text-gray-900">Comment ça marche ?</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {STEPS.map(({ num, title, desc, color }) => (
              <div key={num} className="text-center">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-white font-black text-xl mx-auto mb-4 shadow-lg"
                  style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }}>
                  {num}
                </div>
                <h3 className="font-bold text-gray-900 text-lg mb-2">{title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

    

      {/* ── CTA FINAL ── */}
      <section className="py-24" style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
        <div className="max-w-3xl mx-auto px-6 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-8 text-xs font-medium text-indigo-200"
            style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)' }}>
            <div className="w-1.5 h-1.5 rounded-full bg-white" />
            Rejoignez des centaines d'entrepreneurs
          </div>
          <h2 className="text-4xl font-black text-white mb-4">
            Gérez tout. Vendez plus.
          </h2>
          <p className="text-indigo-200 text-lg mb-10">
            KZA Manager réunit tout ce dont vous avez besoin pour piloter votre business en RDC — en un seul endroit.
          </p>
          <button onClick={() => openAuth('register')}
            className="inline-flex items-center gap-3 px-8 py-4 bg-white text-indigo-700 font-bold rounded-2xl shadow-2xl hover:shadow-3xl hover:scale-105 transition-all text-base">
            Créer mon compte gratuitement
            <ArrowRight size={18} />
          </button>
          <div className="flex justify-center gap-6 mt-8 text-sm text-indigo-300">
            {['Gratuit pour démarrer', 'Données sécurisées', 'Support en français'].map(t => (
              <div key={t} className="flex items-center gap-1.5">
                <Shield size={12} />
                <span>{t}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="py-8 border-t border-gray-100">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center">
              <span className="text-white text-xs font-black">K</span>
            </div>
            <span className="font-bold text-gray-700 text-sm">KZA Manager</span>
          </div>
          <p className="text-xs text-gray-400 flex items-center gap-1">
            <Globe size={12} />
            Conçu pour les entrepreneurs en RDC et en Afrique
          </p>
          <div className="flex gap-4 text-xs text-gray-400">
            <button onClick={() => openAuth('login')} className="hover:text-gray-600 transition-colors">Connexion</button>
            <button onClick={() => openAuth('register')} className="hover:text-gray-600 transition-colors">S'inscrire</button>
          </div>
        </div>
      </footer>

      {/* Auth modal */}
      {showAuth && <AuthModal initialMode={authMode} onClose={() => setShowAuth(false)} />}
    </div>
  );
}
