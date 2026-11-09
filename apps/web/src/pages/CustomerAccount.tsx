import { useEffect, useState } from 'react';
import { ArrowLeft, Loader2, LogOut, MapPin, Package, Settings, Star, Store, Trash2, User } from 'lucide-react';
import {
  cachedCustomer, customerApi, customerToken, LAST_STORE_KEY,
  type Customer, type CustomerAddress, type CustomerOrder, type FollowedStore,
} from '../api/customer';
import { CITY_COMMUNES } from './PublicStore';
import { links } from '../lib/links';

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api';

// Same words as the merchant sees: the Logistics statuses.
const STATUS: Record<string, { label: string; className: string }> = {
  pending:    { label: 'En attente',      className: 'bg-amber-50 text-amber-700' },
  confirmed:  { label: 'Confirmée',       className: 'bg-indigo-50 text-indigo-700' },
  dispatched: { label: 'Chez le livreur', className: 'bg-blue-50 text-blue-700' },
  postponed:  { label: 'Reportée',        className: 'bg-violet-50 text-violet-700' },
  delivered:  { label: 'Livrée',          className: 'bg-emerald-50 text-emerald-700' },
  returned:   { label: 'Retournée',       className: 'bg-orange-50 text-orange-700' },
  cancelled:  { label: 'Annulée',         className: 'bg-red-50 text-red-600' },
  fake:       { label: 'Annulée',         className: 'bg-red-50 text-red-600' },
};

const input = 'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300 bg-white';
const primaryBtn = 'w-full py-3 rounded-2xl bg-indigo-600 text-white font-bold text-sm disabled:opacity-60 flex items-center justify-center gap-2';

/** "#/compte?boutique=slug&tel=…&mode=signup" → its parameters. */
function hashParams() {
  const query = window.location.hash.split('?')[1] ?? '';
  return new URLSearchParams(query);
}

function readStoredSlug() {
  try { return localStorage.getItem(LAST_STORE_KEY); } catch { return null; }
}

// ── Sign-in, sign-up, forgotten password ─────────────────────────────────────

type AuthMode = 'login' | 'signup' | 'reset';

function AuthView({ storeSlug, onSignedIn }: { storeSlug: string | null; onSignedIn: (c: Customer) => void }) {
  const params = hashParams();
  const [mode, setMode] = useState<AuthMode>(params.get('mode') === 'signup' ? 'signup' : 'login');
  const [phone, setPhone] = useState(params.get('tel') ?? '');
  const [name, setName] = useState(params.get('nom') ?? '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const switchMode = (m: AuthMode) => {
    setMode(m); setCodeSent(false); setCode(''); setPassword(''); setConfirm(''); setError(null); setInfo(null);
  };

  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError(null);
    try { await action(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const sendCode = () => run(async () => {
    if (mode === 'signup' && name.trim().length < 2) throw new Error('Indique ton nom.');
    await customerApi.requestCode(phone, mode === 'signup' ? 'signup' : 'reset', storeSlug);
    setCodeSent(true);
    setInfo('Code envoyé sur ton WhatsApp. Il expire dans 10 minutes.');
  });

  const submit = () => run(async () => {
    if (mode === 'login') return onSignedIn(await customerApi.login(phone, password));
    if (password !== confirm) throw new Error('Les deux mots de passe ne sont pas identiques.');
    onSignedIn(mode === 'signup'
      ? await customerApi.signup({ phone, code, name, password })
      : await customerApi.resetPassword({ phone, code, password }));
  });

  const title = mode === 'login' ? 'Connexion' : mode === 'signup' ? 'Créer mon compte' : 'Mot de passe oublié';

  return (
    <div className="space-y-5">
      <div className="text-center">
        <div className="w-14 h-14 mx-auto rounded-full bg-indigo-100 flex items-center justify-center mb-3">
          <User size={26} className="text-indigo-600" />
        </div>
        <h1 className="text-xl font-black text-gray-900">{title}</h1>
        <p className="text-sm text-gray-500 mt-1">
          {mode === 'login'
            ? 'Retrouve tes commandes, tes adresses et les boutiques que tu suis.'
            : 'On t\'envoie un code sur WhatsApp pour vérifier ton numéro.'}
        </p>
      </div>

      <form className="space-y-3" onSubmit={e => { e.preventDefault(); (mode === 'login' || codeSent) ? submit() : sendCode(); }}>
        {mode === 'signup' && (
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Ton nom" autoComplete="name"
            disabled={codeSent} className={input} />
        )}
        <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Numéro WhatsApp (ex. 0812345678)"
          inputMode="tel" autoComplete="tel" disabled={mode !== 'login' && codeSent} className={input} />

        {mode !== 'login' && codeSent && (
          <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="Code à 6 chiffres reçu sur WhatsApp" inputMode="numeric" autoComplete="one-time-code"
            className={`${input} tracking-[0.4em] text-center font-bold`} />
        )}
        {(mode === 'login' || codeSent) && (
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
            placeholder={mode === 'login' ? 'Mot de passe' : 'Nouveau mot de passe (6 caractères min.)'}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'} className={input} />
        )}
        {mode !== 'login' && codeSent && (
          <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
            placeholder="Confirme le mot de passe" autoComplete="new-password" className={input} />
        )}

        {info && !error && <p className="text-xs text-emerald-700 bg-emerald-50 rounded-xl px-3 py-2">{info}</p>}
        {error && <p className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2" role="alert">{error}</p>}

        <button type="submit" disabled={busy} className={primaryBtn}>
          {busy && <Loader2 size={16} className="animate-spin" />}
          {mode === 'login' ? 'Se connecter' : codeSent ? (mode === 'signup' ? 'Créer mon compte' : 'Changer le mot de passe') : 'Recevoir le code'}
        </button>
        {mode !== 'login' && codeSent && (
          <button type="button" onClick={sendCode} disabled={busy} className="w-full text-xs text-indigo-600 font-semibold py-1">
            Renvoyer un code
          </button>
        )}
      </form>

      <div className="text-center text-sm space-y-2">
        {mode === 'login' ? (
          <>
            <button onClick={() => switchMode('reset')} className="text-indigo-600 font-semibold">Mot de passe oublié ?</button>
            <p className="text-gray-500">Pas encore de compte ? <button onClick={() => switchMode('signup')} className="text-indigo-600 font-semibold">Créer un compte</button></p>
          </>
        ) : (
          <p className="text-gray-500">Déjà un compte ? <button onClick={() => switchMode('login')} className="text-indigo-600 font-semibold">Se connecter</button></p>
        )}
      </div>
    </div>
  );
}

// ── Signed-in account ────────────────────────────────────────────────────────

type Tab = 'orders' | 'following' | 'addresses' | 'settings';

function OrdersTab() {
  const [orders, setOrders] = useState<CustomerOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { customerApi.orders().then(setOrders).catch(e => setError(e.message)); }, []);

  if (error) return <p className="text-sm text-red-600 text-center py-8">{error}</p>;
  if (!orders) return <Loader2 size={22} className="animate-spin text-gray-300 mx-auto my-10" />;
  if (orders.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-10">Aucune commande pour l'instant.</p>;
  }
  return (
    <div className="space-y-3">
      {orders.map(o => {
        const st = STATUS[o.status] ?? STATUS.pending;
        return (
          <div key={o.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="min-w-0">
                <a href={links.store(o.store.slug)} className="font-bold text-gray-900 text-sm hover:underline">{o.store.name}</a>
                <p className="text-xs text-gray-400">
                  {new Date(o.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })} · Réf. {o.ref}
                </p>
              </div>
              <span className={`shrink-0 text-[11px] font-semibold px-2 py-1 rounded-lg ${st.className}`}>{st.label}</span>
            </div>
            <div className="space-y-0.5 mb-2">
              {o.items.map((i, k) => (
                <p key={k} className="text-xs text-gray-600">{i.name} × {i.qty}</p>
              ))}
            </div>
            <p className="text-sm font-bold text-gray-900">
              {o.totalAmount.toLocaleString('fr-FR')} {o.store.currency}
              {o.deliveryFee > 0 && <span className="text-xs font-semibold text-orange-600"> + {o.deliveryFee.toLocaleString('fr-FR')} FC livraison</span>}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function FollowingTab({ customer }: { customer: Customer }) {
  const [stores, setStores] = useState<FollowedStore[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { customerApi.following().then(setStores).catch(e => setError(e.message)); }, []);

  const unfollow = async (slug: string) => {
    const before = stores;
    setStores(s => s?.filter(x => x.slug !== slug) ?? null);
    const res = await fetch(`${BASE}/store/${slug}/follow`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visitorId: customer.visitorId, following: false }),
    }).catch(() => null);
    if (!res?.ok) setStores(before);
  };

  if (error) return <p className="text-sm text-red-600 text-center py-8">{error}</p>;
  if (!stores) return <Loader2 size={22} className="animate-spin text-gray-300 mx-auto my-10" />;
  if (stores.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-10">Tu ne suis aucune boutique. Touche le « + » sur un Reel pour t'abonner.</p>;
  }
  return (
    <div className="space-y-2">
      {stores.map(s => (
        <div key={s.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 flex items-center gap-3">
          <a href={links.store(s.slug)} className="flex items-center gap-3 flex-1 min-w-0">
            <span className="w-11 h-11 rounded-full overflow-hidden shrink-0 flex items-center justify-center text-white font-black"
              style={{ background: s.primaryColor }}>
              {s.logoUrl ? <img src={s.logoUrl} alt="" className="w-full h-full object-cover" /> : s.name.charAt(0).toUpperCase()}
            </span>
            <span className="min-w-0">
              <span className="block font-semibold text-gray-900 text-sm truncate">{s.name}</span>
              <span className="block text-xs text-gray-400">{s.followers} abonné{s.followers > 1 ? 's' : ''}</span>
            </span>
          </a>
          <button onClick={() => unfollow(s.slug)} className="shrink-0 px-3 py-1.5 rounded-xl bg-gray-100 text-gray-600 text-xs font-semibold">
            Se désabonner
          </button>
        </div>
      ))}
    </div>
  );
}

const EMPTY_ADDRESS = { label: '', city: '', commune: '', avenue: '', reference: '' };

function AddressesTab() {
  const [addresses, setAddresses] = useState<CustomerAddress[] | null>(null);
  const [form, setForm] = useState(EMPTY_ADDRESS);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => customerApi.addresses().then(setAddresses).catch(e => setError(e.message));
  useEffect(() => { load(); }, []);

  const act = async (action: () => Promise<unknown>) => {
    setBusy(true); setError(null);
    try { await action(); await load(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const communes = CITY_COMMUNES[form.city];
  if (!addresses) return <Loader2 size={22} className="animate-spin text-gray-300 mx-auto my-10" />;

  return (
    <div className="space-y-3">
      {addresses.length === 0 && !adding && (
        <p className="text-sm text-gray-400 text-center py-6">Enregistre ton adresse pour commander plus vite.</p>
      )}
      {addresses.map(a => (
        <div key={a.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 flex items-start gap-3">
          <MapPin size={18} className="text-indigo-500 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900">
              {a.label || a.city}
              {a.isDefault && <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600">Par défaut</span>}
            </p>
            <p className="text-xs text-gray-500">{[a.city, a.commune, a.avenue].filter(Boolean).join(', ')}</p>
            {a.reference && <p className="text-xs text-gray-400">Repère : {a.reference}</p>}
            {!a.isDefault && (
              <button onClick={() => act(() => customerApi.updateAddress(a.id, { isDefault: true }))} disabled={busy}
                className="mt-1 text-xs text-indigo-600 font-semibold">Utiliser par défaut</button>
            )}
          </div>
          <button onClick={() => act(() => customerApi.removeAddress(a.id))} disabled={busy}
            aria-label="Supprimer l'adresse" className="p-2 rounded-lg bg-red-50 text-red-400 shrink-0">
            <Trash2 size={14} />
          </button>
        </div>
      ))}

      {adding ? (
        <form className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-2"
          onSubmit={e => { e.preventDefault(); act(async () => { await customerApi.addAddress(form); setForm(EMPTY_ADDRESS); setAdding(false); }); }}>
          <input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder="Nom (ex. Maison, Bureau)" className={input} />
          <input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value, commune: '' }))} placeholder="Ville *"
            list="kza-cities" className={input} />
          <datalist id="kza-cities">{Object.keys(CITY_COMMUNES).map(c => <option key={c} value={c} />)}</datalist>
          {communes ? (
            <select value={form.commune} onChange={e => setForm(f => ({ ...f, commune: e.target.value }))} className={input}>
              <option value="">Commune</option>
              {communes.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          ) : (
            <input value={form.commune} onChange={e => setForm(f => ({ ...f, commune: e.target.value }))} placeholder="Commune / quartier" className={input} />
          )}
          <input value={form.avenue} onChange={e => setForm(f => ({ ...f, avenue: e.target.value }))} placeholder="Avenue et numéro" className={input} />
          <input value={form.reference} onChange={e => setForm(f => ({ ...f, reference: e.target.value }))} placeholder="Point de repère" className={input} />
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={() => setAdding(false)} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-600 text-sm font-semibold">Annuler</button>
            <button type="submit" disabled={busy || !form.city.trim()} className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold disabled:opacity-60">Enregistrer</button>
          </div>
        </form>
      ) : addresses.length < 10 && (
        <button onClick={() => setAdding(true)} className="w-full py-3 rounded-2xl border-2 border-dashed border-gray-200 text-sm font-semibold text-gray-500">
          + Ajouter une adresse
        </button>
      )}
      {error && <p className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2" role="alert">{error}</p>}
    </div>
  );
}

function SettingsTab({ customer, onChange }: { customer: Customer; onChange: (c: Customer) => void }) {
  const [name, setName] = useState(customer.name);
  const [categories, setCategories] = useState<string[]>([]);
  const [chosen, setChosen] = useState<string[]>(customer.preferredCategories);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { customerApi.categories().then(setCategories).catch(() => {}); }, []);

  const act = async (action: () => Promise<Customer>, success: string) => {
    setBusy(true); setMessage(null);
    try { onChange(await action()); setMessage({ ok: true, text: success }); }
    catch (e) { setMessage({ ok: false, text: (e as Error).message }); }
    finally { setBusy(false); }
  };

  const toggle = (c: string) => setChosen(list => list.includes(c) ? list.filter(x => x !== c) : [...list, c]);

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
        <p className="text-sm font-bold text-gray-900">Mes préférences</p>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Ton nom" className={input} />
        {categories.length > 0 && (
          <div>
            <p className="text-xs text-gray-500 mb-2">Ce que j'aime voir</p>
            <div className="flex flex-wrap gap-2">
              {categories.map(c => (
                <button key={c} type="button" onClick={() => toggle(c)} aria-pressed={chosen.includes(c)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${chosen.includes(c) ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-gray-200 text-gray-600'}`}>
                  {c}
                </button>
              ))}
            </div>
          </div>
        )}
        <button disabled={busy} onClick={() => act(() => customerApi.updateMe({ name, preferredCategories: chosen }), 'Préférences enregistrées.')}
          className={primaryBtn}>Enregistrer</button>
      </div>

      <form className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3"
        onSubmit={e => { e.preventDefault(); act(async () => { const c = await customerApi.changePassword(current, next); setCurrent(''); setNext(''); return c; }, 'Mot de passe changé. Tes autres appareils sont déconnectés.'); }}>
        <p className="text-sm font-bold text-gray-900">Changer le mot de passe</p>
        <input type="password" value={current} onChange={e => setCurrent(e.target.value)} placeholder="Mot de passe actuel" autoComplete="current-password" className={input} />
        <input type="password" value={next} onChange={e => setNext(e.target.value)} placeholder="Nouveau mot de passe" autoComplete="new-password" className={input} />
        <button type="submit" disabled={busy || !current || !next} className={primaryBtn}>Changer</button>
      </form>

      {message && (
        <p className={`text-xs rounded-xl px-3 py-2 ${message.ok ? 'text-emerald-700 bg-emerald-50' : 'text-red-600 bg-red-50'}`} role="status">{message.text}</p>
      )}
    </div>
  );
}

function AccountView({ customer, onChange, onLogout }: { customer: Customer; onChange: (c: Customer) => void; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>('orders');
  const tabs: { key: Tab; label: string; Icon: typeof Package }[] = [
    { key: 'orders', label: 'Commandes', Icon: Package },
    { key: 'following', label: 'Abonnements', Icon: Star },
    { key: 'addresses', label: 'Adresses', Icon: MapPin },
    { key: 'settings', label: 'Réglages', Icon: Settings },
  ];
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-full bg-indigo-600 text-white font-black text-lg flex items-center justify-center shrink-0">
          {customer.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-black text-gray-900 truncate">{customer.name}</p>
          <p className="text-xs text-gray-400">{customer.phone}</p>
        </div>
        <button onClick={onLogout} className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-100 text-gray-600 text-xs font-semibold">
          <LogOut size={14} /> Déconnexion
        </button>
      </div>

      <div className="grid grid-cols-4 gap-1 bg-gray-100 p-1 rounded-2xl">
        {tabs.map(({ key, label, Icon }) => (
          <button key={key} onClick={() => setTab(key)} aria-pressed={tab === key}
            className={`flex flex-col items-center gap-0.5 py-2 rounded-xl text-[11px] font-semibold ${tab === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      {tab === 'orders' && <OrdersTab />}
      {tab === 'following' && <FollowingTab customer={customer} />}
      {tab === 'addresses' && <AddressesTab />}
      {tab === 'settings' && <SettingsTab customer={customer} onChange={onChange} />}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function CustomerAccount() {
  const storeSlug = hashParams().get('boutique') ?? readStoredSlug();
  const [customer, setCustomer] = useState<Customer | null>(() => (customerToken() ? cachedCustomer() : null));
  const [checking, setChecking] = useState(() => !!customerToken());

  // The session may have ended elsewhere (password changed): /me says so.
  useEffect(() => {
    if (!customerToken()) return;
    customerApi.me().then(setCustomer).catch(() => setCustomer(null)).finally(() => setChecking(false));
  }, []);

  const signedIn = (c: Customer) => {
    setCustomer(c);
    // Back to the store after signing up from it, as the visitor expects.
    if (storeSlug && hashParams().get('retour') === '1') window.location.hash = links.store(storeSlug);
  };

  const logout = async () => {
    await customerApi.logout();
    setCustomer(null);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 bg-white border-b border-gray-100">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center gap-3">
          {storeSlug ? (
            <a href={links.store(storeSlug)} className="flex items-center gap-1.5 text-sm font-semibold text-gray-600">
              <ArrowLeft size={16} /> Boutique
            </a>
          ) : (
            <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-600"><Store size={16} /> Mon compte</span>
          )}
        </div>
      </header>
      <main className="max-w-md mx-auto px-4 py-6">
        {checking && !customer ? (
          <Loader2 size={26} className="animate-spin text-gray-300 mx-auto my-16" />
        ) : customer ? (
          <AccountView customer={customer} onChange={setCustomer} onLogout={logout} />
        ) : (
          <AuthView storeSlug={storeSlug} onSignedIn={signedIn} />
        )}
      </main>
    </div>
  );
}
