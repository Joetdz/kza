import { useState, useEffect, useRef } from 'react';
import { Package, Truck, X, MapPin, Users, ShoppingBag, LogOut, Trash2, Plus, KeyRound, Calendar, DollarSign, Phone, MessageCircle, FileText, Printer } from 'lucide-react';
import type { DailyReport, DailyReportSummary, DailyReportOrder } from '../api/logistics';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api';
import { logisticsApi, type ManualOrder, type DeliveryAgent, type PartnerFinances } from '../api/logistics';

const ALL_STATUSES: { value: string; label: string; color: string }[] = [
  { value: 'pending',        label: 'En attente',                    color: 'bg-gray-100 text-gray-600' },
  { value: 'called',         label: 'Client appelé',                 color: 'bg-sky-100 text-sky-700' },
  { value: 'messaged',       label: 'Client contacté par message',   color: 'bg-violet-100 text-violet-700' },
  { value: 'confirmed',      label: 'Confirmation client',           color: 'bg-teal-100 text-teal-700' },
  { value: 'support_needed', label: 'Besoin de support',             color: 'bg-amber-100 text-amber-700' },
  { value: 'dispatched',     label: 'Dispatché',                     color: 'bg-blue-100 text-blue-700' },
  { value: 'postponed',      label: 'Reporté',                       color: 'bg-purple-100 text-purple-700' },
  { value: 'delivered',      label: 'Livré',                         color: 'bg-green-100 text-green-700' },
  { value: 'returned',       label: 'Retourné',                      color: 'bg-orange-100 text-orange-700' },
  { value: 'fake',           label: 'Fausse commande',               color: 'bg-stone-100 text-stone-600' },
  { value: 'cancelled',      label: 'Annulé',                        color: 'bg-red-100 text-red-600' },
];

function statusInfo(value: string) {
  return ALL_STATUSES.find(s => s.value === value) ?? ALL_STATUSES[0];
}

function authKey(token: string) { return `kza_partner_auth_${token}`; }

function isAuthed(token: string): boolean {
  try {
    const raw = localStorage.getItem(authKey(token));
    if (!raw) return false;
    const { at } = JSON.parse(raw);
    return Date.now() - at < 30 * 24 * 60 * 60 * 1000; // 30 days
  } catch { return false; }
}

function saveAuth(token: string) {
  localStorage.setItem(authKey(token), JSON.stringify({ at: Date.now() }));
}

function clearAuth(token: string) {
  localStorage.removeItem(authKey(token));
}

// ── Interfaces ────────────────────────────────────────────────────────────────

interface LocationStockEntry {
  id: string;
  quantity: number;
  product: { id: string; name: string };
}

interface PartnerData {
  id: string;
  name: string;
  phone: string | null;
  city: string | null;
  type: string;
  token: string;
  hasPin: boolean;
  businessName?: string | null;
  location: { id: string; name: string; stocks: LocationStockEntry[] } | null;
  agents: DeliveryAgent[];
  orders: ManualOrder[];
}

// ── Main component ────────────────────────────────────────────────────────────

export function PartnerPortal({ token }: { token: string }) {
  const [phase, setPhase] = useState<'loading' | 'login' | 'portal'>('loading');
  const [hasPin, setHasPin] = useState(false);
  const [data, setData] = useState<PartnerData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => { init(); }, [token]);

  async function init() {
    if (isAuthed(token)) {
      await loadPortal();
    } else {
      // Peek to know if PIN is set
      try {
        const res = await logisticsApi.partnerPortal.getOrders(token);
        if (!res || !res.id) { setError(true); return; }
        setHasPin(res.hasPin);
        setPhase('login');
      } catch { setError(true); }
    }
  }

  async function loadPortal() {
    try {
      const res = await logisticsApi.partnerPortal.getOrders(token);
      if (!res || !res.id) { setError(true); return; }
      setData(res as PartnerData);
      setPhase('portal');
    } catch { setError(true); }
  }

  function onLoginSuccess() {
    saveAuth(token);
    loadPortal();
  }

  function logout() {
    clearAuth(token);
    setPhase('login');
    setData(null);
  }

  if (error) return <ErrorPage />;
  if (phase === 'loading') return <Spinner />;
  if (phase === 'login') return <LoginScreen token={token} hasPin={hasPin} onSuccess={onLoginSuccess} />;
  if (!data) return <Spinner />;
  return <Portal data={data} token={token} onLogout={logout} />;
}

// ── Login screen ──────────────────────────────────────────────────────────────

function LoginScreen({ token, hasPin, onSuccess }: { token: string; hasPin: boolean; onSuccess: () => void }) {
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pin.length < 4) { setErrMsg('Le PIN doit avoir au moins 4 chiffres'); return; }
    if (!hasPin && pin !== confirm) { setErrMsg('Les PINs ne correspondent pas'); return; }
    setLoading(true);
    setErrMsg('');
    try {
      const res = await logisticsApi.partnerPortal.auth(token, pin);
      if (res.ok) { onSuccess(); }
      else { setErrMsg(res.error === 'wrong_pin' ? 'PIN incorrect. Réessayez.' : 'Lien invalide.'); }
    } catch { setErrMsg('Erreur de connexion. Réessayez.'); }
    finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-slate-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-xl w-full max-w-sm p-8">
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center">
            <KeyRound size={28} className="text-indigo-600" />
          </div>
        </div>
        <h1 className="text-xl font-black text-gray-900 text-center mb-1">Portail Partenaire</h1>
        <p className="text-sm text-gray-500 text-center mb-6">
          {hasPin ? 'Entrez votre PIN pour accéder à vos commandes.' : 'Créez votre PIN de connexion (minimum 4 chiffres).'}
        </p>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              {hasPin ? 'Votre PIN' : 'Choisir un PIN'}
            </label>
            <input
              ref={inputRef}
              type="password"
              inputMode="numeric"
              maxLength={8}
              value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
              placeholder="••••"
              className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-center text-2xl tracking-[0.5em] outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>

          {!hasPin && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Confirmer le PIN</label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={8}
                value={confirm}
                onChange={e => setConfirm(e.target.value.replace(/\D/g, ''))}
                placeholder="••••"
                className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-center text-2xl tracking-[0.5em] outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
          )}

          {errMsg && <p className="text-xs text-red-500 text-center">{errMsg}</p>}

          <button type="submit" disabled={loading}
            className="w-full py-3 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
            {loading ? '...' : hasPin ? 'Se connecter' : 'Créer mon PIN'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Portal ────────────────────────────────────────────────────────────────────

type PortalTab = 'orders' | 'team' | 'stock' | 'finances' | 'reports';

function Portal({ data: initialData, token, onLogout }: {
  data: PartnerData;
  token: string;
  onLogout: () => void;
}) {
  const [data, setData] = useState(initialData);
  const [tab, setTab] = useState<PortalTab>('orders');
  const [deliverModal, setDeliverModal] = useState<{ orderId: string } | null>(null);
  const [deliveryPersonName, setDeliveryPersonName] = useState('');
  const [collectedUsd, setCollectedUsd] = useState('');
  const [collectedCdf, setCollectedCdf] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => { setData(initialData); }, [initialData]);

  async function changeStatus(orderId: string, status: string, personName?: string) {
    setUpdatingId(orderId);
    try {
      await logisticsApi.partnerPortal.updateOrderStatus(token, orderId, { status, deliveryPersonName: personName });
      setData(d => ({
        ...d,
        orders: d.orders.map(o => o.id === orderId
          ? { ...o, status, deliveryPersonName: personName ?? o.deliveryPersonName }
          : o),
      }));
    } catch { /* ignore */ }
    finally { setUpdatingId(null); }
  }

  function handleStatusSelect(orderId: string, newStatus: string) {
    if (newStatus === 'delivered') {
      setDeliverModal({ orderId });
      setDeliveryPersonName('');
    } else {
      changeStatus(orderId, newStatus);
    }
  }

  async function confirmDelivered() {
    if (!deliverModal) return;
    setSubmitting(true);
    try {
      await logisticsApi.partnerPortal.updateOrderStatus(token, deliverModal.orderId, {
        status: 'delivered',
        deliveryPersonName: deliveryPersonName || undefined,
        collectedUsd: collectedUsd ? Number(collectedUsd) : undefined,
        collectedCdf: collectedCdf ? Number(collectedCdf) : undefined,
      });
      setData(d => ({
        ...d,
        orders: d.orders.map(o => o.id === deliverModal!.orderId
          ? { ...o, status: 'delivered', deliveryPersonName: deliveryPersonName || o.deliveryPersonName }
          : o),
      }));
      setDeliverModal(null);
      setDeliveryPersonName('');
      setCollectedUsd('');
      setCollectedCdf('');
    } finally { setSubmitting(false); }
  }

  const activeOrders = data.orders.filter(o => o.status !== 'cancelled' && o.status !== 'fake');

  const tabs: { id: PortalTab; label: string; icon: typeof ShoppingBag; count?: number }[] = [
    { id: 'orders',   label: 'Commandes', icon: ShoppingBag, count: activeOrders.length },
    { id: 'team',     label: 'Mon équipe', icon: Users,       count: data.agents?.length ?? 0 },
    { id: 'stock',    label: 'Stock',      icon: Package },
    { id: 'finances', label: 'Finances',   icon: DollarSign },
    { id: 'reports',  label: 'Rapports',   icon: FileText },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-indigo-600 text-white px-4 pt-6 pb-0">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <Truck size={20} />
                <h1 className="text-lg font-black">{data.name}</h1>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/20">
                  {data.type === 'COMPANY' ? 'Entreprise' : 'Indépendant'}
                </span>
              </div>
              {data.city && (
                <p className="text-indigo-200 text-xs flex items-center gap-1">
                  <MapPin size={10} /> {data.city}
                </p>
              )}
            </div>
            <button onClick={onLogout} className="flex items-center gap-1.5 text-xs text-indigo-200 hover:text-white mt-1">
              <LogOut size={14} /> Déconnexion
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1">
            {tabs.map(({ id, label, icon: Icon, count }) => (
              <button key={id} onClick={() => setTab(id)}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold rounded-t-xl transition-all
                  ${tab === id ? 'bg-gray-50 text-indigo-700' : 'text-indigo-200 hover:text-white'}`}>
                <Icon size={13} />
                {label}
                {count !== undefined && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full
                    ${tab === id ? 'bg-indigo-100 text-indigo-600' : 'bg-white/20'}`}>
                    {count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 py-5">
        {tab === 'orders' && (
          <OrdersTab
            orders={data.orders}
            agents={data.agents ?? []}
            token={token}
            partnerName={data.name}
            businessName={data.businessName}
            updatingId={updatingId}
            onStatusChange={handleStatusSelect}
            onOrderUpdate={updated => setData(d => ({
              ...d,
              orders: d.orders.map(o => o.id === updated.id ? { ...o, ...updated } : o),
            }))}
          />
        )}
        {tab === 'team' && (
          <TeamTab token={token} agents={data.agents ?? []}
            onAgentsChange={agents => setData(d => ({ ...d, agents }))} />
        )}
        {tab === 'stock' && (
          <StockTab location={data.location} />
        )}
        {tab === 'finances' && (
          <FinancesTab token={token} />
        )}
        {tab === 'reports' && (
          <ReportsTab token={token} partnerName={data.name} />
        )}
      </div>

      {/* Delivery confirm modal */}
      {deliverModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="font-bold text-gray-900">Confirmer la livraison</h2>
              <button onClick={() => { setDeliverModal(null); setCollectedUsd(''); setCollectedCdf(''); }}
                className="p-1.5 rounded-lg hover:bg-gray-100"><X size={18} className="text-gray-500" /></button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-sm text-gray-600 font-medium">Montants encaissés à la livraison</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Montant ($)</label>
                  <div className="relative">
                    <input type="text" inputMode="decimal" value={collectedUsd}
                      onChange={e => setCollectedUsd(e.target.value)} placeholder="0"
                      className="w-full border border-gray-200 rounded-xl pl-3 pr-6 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-400" />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-bold">$</span>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Montant (FC)</label>
                  <div className="relative">
                    <input type="number" min="0" step="1" value={collectedCdf}
                      onChange={e => setCollectedCdf(e.target.value)} placeholder="0"
                      className="w-full border border-gray-200 rounded-xl pl-3 pr-7 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-400" />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-bold">FC</span>
                  </div>
                </div>
              </div>
              <input
                type="text" value={deliveryPersonName}
                onChange={e => setDeliveryPersonName(e.target.value)}
                placeholder="Nom du livreur (optionnel)"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-400"
              />
              <div className="flex gap-2 pt-1">
                <button onClick={() => { setDeliverModal(null); setCollectedUsd(''); setCollectedCdf(''); }}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50">
                  Annuler
                </button>
                <button onClick={confirmDelivered} disabled={submitting}
                  className="flex-1 py-2.5 rounded-xl bg-green-600 text-white text-sm font-semibold hover:bg-green-700 disabled:opacity-50">
                  {submitting ? '...' : 'Confirmer livré'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Orders Tab ────────────────────────────────────────────────────────────────

function buildWaMessage(o: ManualOrder, partnerName: string, businessName: string | null, agents: DeliveryAgent[]): string {
  const agent = agents.find(a => a.id === o.agentId);
  const productNames = o.items.map(i => i.product.name).join(', ');
  const boutique = businessName ?? partnerName;

  const livreurLine = agent
    ? `Votre livreur est *${agent.name}*${agent.phone ? ` (📱 ${agent.phone})` : ''} — il est en route et vous contactera sous peu.`
    : o.deliveryPersonName
    ? `Votre livreur *${o.deliveryPersonName}* est en route et vous contactera sous peu.`
    : `Notre livreur est en route et vous contactera sous peu.`;

  return [
    `Bonjour *${o.customerName}* 👋`,
    ``,
    `C'est le service de livraison *${partnerName}*.`,
    `Votre commande *(${productNames})* passée chez *${boutique}* est prise en charge.`,
    ``,
    livreurLine,
    ``,
    `Merci de votre confiance ! 🚚`,
  ].join('\n');
}

function OrdersTab({ orders, agents, token, partnerName, businessName, updatingId, onStatusChange, onOrderUpdate }: {
  orders: ManualOrder[];
  agents: DeliveryAgent[];
  token: string;
  partnerName: string;
  businessName: string | null | undefined;
  updatingId: string | null;
  onStatusChange: (id: string, status: string) => void;
  onOrderUpdate: (order: ManualOrder) => void;
}) {
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<Record<string, string>>({});
  const [waFeedback, setWaFeedback] = useState<string | null>(null);
  const [rescheduleOrderId, setRescheduleOrderId] = useState<string | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduling, setRescheduling] = useState(false);

  async function handleReschedule() {
    if (!rescheduleOrderId) return;
    setRescheduling(true);
    try {
      const updated = await logisticsApi.partnerPortal.reschedule(token, rescheduleOrderId, rescheduleDate || null);
      onOrderUpdate(updated);
      setRescheduleOrderId(null);
      setRescheduleDate('');
    } catch { /* ignore */ }
    finally { setRescheduling(false); }
  }

  async function handleAssign(orderId: string) {
    const agentId = selectedAgent[orderId] ?? null;
    setAssigningId(orderId);
    setWaFeedback(null);
    try {
      const updated = await logisticsApi.partnerPortal.assignAgent(token, orderId, agentId || null);
      onOrderUpdate(updated);
      const agent = agents.find(a => a.id === agentId);
      if (agent?.phone) setWaFeedback(orderId);
    } catch { /* ignore */ }
    finally { setAssigningId(null); setTimeout(() => setWaFeedback(null), 3000); }
  }

  if (orders.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <Truck size={36} className="mx-auto mb-2 opacity-40" />
        <p className="text-sm">Aucune commande assignée.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {orders.map(o => {
        const st = statusInfo(o.status);
        const isTerminal = ['delivered', 'cancelled', 'fake'].includes(o.status);
        const currentAgentId = selectedAgent[o.id] ?? o.agentId ?? '';
        const currentAgent = agents.find(a => a.id === o.agentId);

        return (
          <div key={o.id} className={`bg-white rounded-2xl p-4 border border-gray-100 shadow-sm transition-opacity ${updatingId === o.id || assigningId === o.id ? 'opacity-60' : ''}`}>
            {/* Header */}
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-black text-indigo-600 text-sm">#{String(o.orderNumber).padStart(4, '0')}</span>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
                {currentAgent && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600">
                    👤 {currentAgent.name}
                  </span>
                )}
              </div>
              <p className="text-[10px] text-gray-400 shrink-0">
                {new Date(o.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
              </p>
            </div>

            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-bold text-gray-900">{o.customerName}</p>
                {o.customerPhone && <p className="text-xs text-gray-400">{o.customerPhone}</p>}
              </div>
              {o.customerPhone && (
                <div className="flex gap-1.5 shrink-0">
                  <a href={`tel:${o.customerPhone}`}
                    className="p-2 rounded-xl bg-green-50 text-green-600 hover:bg-green-100 transition-colors"
                    title="Appeler le client">
                    <Phone size={14} />
                  </a>
                  <a href={`https://wa.me/${o.customerPhone.replace(/\D/g, '')}?text=${encodeURIComponent(buildWaMessage(o, partnerName, businessName ?? null, agents))}`}
                    target="_blank" rel="noopener noreferrer"
                    className="p-2 rounded-xl bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors"
                    title="Contacter le client par WhatsApp">
                    <MessageCircle size={14} />
                  </a>
                </div>
              )}
            </div>
            <p className="text-sm text-gray-500">{o.city} — {o.address}</p>

            {o.scheduledAt && (
              <p className="text-xs text-indigo-600 mt-1">
                📅 Livraison prévue : {new Date(o.scheduledAt).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </p>
            )}

            {/* Items */}
            <div className="mt-2 space-y-1.5">
              {o.items.map(item => (
                <div key={item.id} className="flex items-center gap-2">
                  {item.product.imageUrl ? (
                    <img src={item.product.imageUrl} alt={item.product.name}
                      className="w-8 h-8 rounded-lg object-cover border border-gray-100 shrink-0" />
                  ) : (
                    <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                      <Package size={12} className="text-gray-300" />
                    </div>
                  )}
                  <p className="text-xs text-gray-600">
                    <span className="font-medium">{item.product.name}</span> × {item.quantity}
                  </p>
                </div>
              ))}
            </div>

            {/* Amounts */}
            <div className="flex gap-3 mt-2 text-xs flex-wrap items-center">
              <span className="font-bold text-gray-900">${Number(o.totalAmount).toLocaleString('fr-FR')} <span className="font-normal text-gray-400">produits</span></span>
              <span className="text-gray-300">+</span>
              <span className="font-semibold text-amber-600">{Number(o.deliveryFee).toLocaleString('fr-FR')} FC <span className="font-normal text-amber-500">livraison</span></span>
            </div>

            {o.deliveryPersonName && (
              <p className="text-xs text-green-600 mt-1">👤 {o.deliveryPersonName}</p>
            )}

            {/* Agent assignment */}
            {agents.length > 0 && !isTerminal && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <label className="block text-[10px] font-semibold text-gray-400 mb-1.5">Assigner à un agent</label>
                <div className="flex gap-2">
                  <select
                    value={currentAgentId}
                    onChange={e => setSelectedAgent(s => ({ ...s, [o.id]: e.target.value }))}
                    className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
                  >
                    <option value="">— Aucun agent</option>
                    {agents.map(a => (
                      <option key={a.id} value={a.id}>
                        {a.name}{a.phone ? ` (${a.phone})` : ''}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => handleAssign(o.id)}
                    disabled={assigningId === o.id}
                    className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white rounded-xl text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50 shrink-0"
                  >
                    {assigningId === o.id ? '...' : (
                      agents.find(a => a.id === currentAgentId)?.phone ? '📲 Assigner' : 'Assigner'
                    )}
                  </button>
                </div>
                {waFeedback === o.id && (
                  <p className="text-xs text-green-600 mt-1.5 font-medium">✓ Assigné + notification WA envoyée</p>
                )}
              </div>
            )}

            {/* Status selector */}
            {!isTerminal && (
              <div className="mt-2 space-y-2">
                <div>
                  <label className="block text-[10px] font-semibold text-gray-400 mb-1">Changer le statut</label>
                  <select
                    value={o.status}
                    disabled={updatingId === o.id}
                    onChange={e => onStatusChange(o.id, e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
                  >
                    {ALL_STATUSES.map(s => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={() => { setRescheduleOrderId(o.id); setRescheduleDate(o.scheduledAt ? o.scheduledAt.slice(0, 16) : ''); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 text-purple-700 rounded-xl text-xs font-semibold hover:bg-purple-100 w-full justify-center"
                >
                  <Calendar size={12} /> Reporter la livraison
                </button>
              </div>
            )}
          </div>
        );
      })}

      {/* ── Modal Reporter ── */}
      {rescheduleOrderId && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-900 flex items-center gap-2"><Calendar size={16} /> Reporter la livraison</h3>
              <button onClick={() => { setRescheduleOrderId(null); setRescheduleDate(''); }} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Nouvelle date et heure</label>
              <input type="datetime-local" value={rescheduleDate}
                onChange={e => setRescheduleDate(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-400" />
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => { setRescheduleOrderId(null); setRescheduleDate(''); }}
                className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">
                Annuler
              </button>
              <button onClick={handleReschedule} disabled={rescheduling}
                className="flex-1 px-4 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-semibold hover:bg-purple-700 disabled:opacity-50">
                {rescheduling ? '...' : 'Confirmer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Team Tab ──────────────────────────────────────────────────────────────────

function TeamTab({ token, agents, onAgentsChange }: {
  token: string;
  agents: DeliveryAgent[];
  onAgentsChange: (agents: DeliveryAgent[]) => void;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [adding, setAdding] = useState(false);
  const [showForm, setShowForm] = useState(false);

  async function addAgent(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setAdding(true);
    try {
      const agent = await logisticsApi.partnerPortal.addAgent(token, { name: name.trim(), phone: phone.trim() || undefined });
      onAgentsChange([...agents, agent]);
      setName(''); setPhone(''); setShowForm(false);
    } catch { /* ignore */ }
    finally { setAdding(false); }
  }

  async function removeAgent(agentId: string) {
    if (!confirm('Supprimer cet agent ?')) return;
    await logisticsApi.partnerPortal.removeAgent(token, agentId);
    onAgentsChange(agents.filter(a => a.id !== agentId));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-gray-700">{agents.length} agent{agents.length !== 1 ? 's' : ''}</p>
        <button onClick={() => setShowForm(f => !f)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-xl text-xs font-semibold hover:bg-indigo-700">
          <Plus size={13} /> Ajouter un agent
        </button>
      </div>

      {showForm && (
        <form onSubmit={addAgent} className="bg-white rounded-2xl p-4 border border-indigo-200 shadow-sm space-y-3">
          <p className="text-xs font-bold text-gray-700">Nouvel agent</p>
          <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Nom complet *" required
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-400" />
          <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="Téléphone (optionnel)"
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-400" />
          <div className="flex gap-2">
            <button type="button" onClick={() => setShowForm(false)}
              className="flex-1 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50">
              Annuler
            </button>
            <button type="submit" disabled={adding}
              className="flex-1 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
              {adding ? '...' : 'Ajouter'}
            </button>
          </div>
        </form>
      )}

      <div className="space-y-2">
        {agents.map(agent => (
          <div key={agent.id} className="bg-white rounded-2xl px-4 py-3 border border-gray-100 shadow-sm flex items-center gap-3">
            <div className="w-9 h-9 bg-indigo-100 rounded-full flex items-center justify-center shrink-0">
              <span className="text-indigo-600 font-bold text-sm">{agent.name[0].toUpperCase()}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 text-sm">{agent.name}</p>
              {agent.phone && <p className="text-xs text-gray-500">{agent.phone}</p>}
            </div>
            <button onClick={() => removeAgent(agent.id)} className="p-1.5 text-gray-300 hover:text-red-400 transition-colors">
              <Trash2 size={15} />
            </button>
          </div>
        ))}
        {agents.length === 0 && !showForm && (
          <div className="text-center py-8 text-gray-400">
            <Users size={32} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm">Aucun agent pour le moment.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Stock Tab ─────────────────────────────────────────────────────────────────

function StockTab({ location }: { location: PartnerData['location'] }) {
  if (!location || !location.stocks || location.stocks.length === 0) {
    return (
      <div className="text-center py-10 text-gray-400">
        <Package size={32} className="mx-auto mb-2 opacity-40" />
        <p className="text-sm">Aucun stock affecté à votre emplacement.</p>
      </div>
    );
  }
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 mb-3 flex items-center gap-1">
        <MapPin size={11} /> {location.name}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {location.stocks.map(s => (
          <div key={s.id} className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
            <p className="text-xs text-gray-500 mb-1 truncate">{s.product.name}</p>
            <p className="text-3xl font-black text-gray-900">{s.quantity}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">unités disponibles</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Reports Tab ───────────────────────────────────────────────────────────────

const RPT_STATUS: Record<string, { label: string; color: string }> = {
  delivered: { label: 'Livré',      color: 'text-green-600' },
  returned:  { label: 'Retourné',   color: 'text-orange-500' },
  cancelled: { label: 'Annulé',     color: 'text-red-500' },
  fake:      { label: 'Fausse cmd', color: 'text-stone-500' },
  pending:   { label: 'En attente', color: 'text-gray-500' },
  dispatched:{ label: 'En cours',   color: 'text-blue-500' },
  postponed: { label: 'Reporté',    color: 'text-purple-500' },
};

type HistoryPeriod = 'today' | 'yesterday' | '7d' | 'month' | 'prevmonth' | 'custom';

function periodRange(p: HistoryPeriod, customFrom: string, customTo: string): { from: string; to: string } {
  const today = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const addDays = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
  if (p === 'today')     return { from: fmt(today), to: fmt(today) };
  if (p === 'yesterday') return { from: fmt(addDays(today, -1)), to: fmt(addDays(today, -1)) };
  if (p === '7d')        return { from: fmt(addDays(today, -6)), to: fmt(today) };
  if (p === 'month')     return { from: fmt(new Date(today.getFullYear(), today.getMonth(), 1)), to: fmt(today) };
  if (p === 'prevmonth') {
    const f = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const t = new Date(today.getFullYear(), today.getMonth(), 0);
    return { from: fmt(f), to: fmt(t) };
  }
  return { from: customFrom, to: customTo };
}

function exportCsv(report: DailyReport) {
  const obs = (o: DailyReportOrder) => o.notes ?? o.items.map(i => `${i.quantity} ${i.name}`).join(', ');
  const usd = (o: DailyReportOrder) => o.collectedUsd > 0 ? o.collectedUsd : o.totalAmount;
  const rows = [
    ['N°','Zone','Adresse','Agent','Montant $','Montant FC','Observation','Frais course','Statut'],
    ...report.orders.map(o => [
      o.num, o.city, o.address, o.agentName ?? '', usd(o),
      o.collectedCdf > 0 ? o.collectedCdf : '', obs(o), o.deliveryFee,
      RPT_STATUS[o.status]?.label ?? o.status,
    ]),
    [],
    ['TOTAL','','','', report.summary.totalCollectedUsd, report.summary.totalCollectedCdf, '', report.summary.totalDeliveryFees, ''],
    ['Solde','','','', report.summary.soldeUsd, report.summary.soldeCdf, '', '', ''],
    ['Solde Cumulé','','','', report.cumulativeSolde.soldeUsd, report.cumulativeSolde.soldeCdf, '', '', ''],
  ];
  const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `rapport-${report.date}.csv`; a.click();
}

function exportPdf(report: DailyReport, partnerName: string) {
  const dateLabel = new Date(report.date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const obs = (o: DailyReportOrder) => o.notes ?? o.items.map(i => `${i.quantity} ${i.name}`).join(', ');
  const usdStr = (o: DailyReportOrder) => o.collectedUsd > 0 ? `$${o.collectedUsd.toLocaleString('fr-FR')}` : o.totalAmount > 0 ? `$${o.totalAmount.toLocaleString('fr-FR')}` : '—';
  const rows = report.orders.map(o => `
    <tr>
      <td>${o.num}</td><td>${o.city}</td><td>${o.agentName ?? '—'}</td>
      <td>${usdStr(o)}</td><td>${o.collectedCdf > 0 ? o.collectedCdf.toLocaleString('fr-FR') : '—'}</td>
      <td>${obs(o)}</td><td>${o.deliveryFee > 0 ? o.deliveryFee.toLocaleString('fr-FR') : '—'}</td>
      <td>${RPT_STATUS[o.status]?.label ?? o.status}</td>
    </tr>`).join('');
  const stockRows = report.stock.map(s => `<tr><td>${s.productName}</td><td>${s.stockStart}</td><td>${s.delivered}</td><td>${s.entries}</td><td><strong>${s.stockCurrent}</strong></td></tr>`).join('');
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Rapport ${report.date}</title>
  <style>body{font-family:Arial,sans-serif;font-size:11px;margin:20px;color:#111}h1{font-size:15px;text-align:center;text-transform:capitalize}h2{font-size:12px;margin-top:18px;border-bottom:1px solid #ccc;padding-bottom:4px}table{width:100%;border-collapse:collapse;margin-top:8px}th{background:#e5e7eb;padding:5px 6px;text-align:left;font-size:10px}td{padding:4px 6px;border-bottom:1px solid #f3f4f6}.total-row{background:#fef9c3;font-weight:bold}.solde-row{background:#fef08a;font-weight:bold}.cumul-row{background:#fecaca;font-weight:800;color:#991b1b}.stats{display:flex;gap:8px;margin-top:12px}.stat{flex:1;text-align:center;background:#f3f4f6;border-radius:8px;padding:8px}.stat .val{font-size:20px;font-weight:900}.stat .lbl{font-size:9px;color:#6b7280;margin-top:2px}@media print{body{margin:10px}}</style>
  </head><body>
  <h1>Rapport Journalier — ${partnerName}</h1>
  <p style="text-align:center;color:#6b7280;font-size:12px;text-transform:capitalize">${dateLabel}</p>
  <h2>Commandes</h2>
  <table><thead><tr><th>N°</th><th>Zone</th><th>Agent</th><th>Montant $</th><th>Montant FC</th><th>Observation</th><th>Frais course</th><th>Statut</th></tr></thead>
  <tbody>${rows}
    <tr class="total-row"><td colspan="3">TOTAL</td><td>$${report.summary.totalCollectedUsd.toLocaleString('fr-FR')}</td><td>${report.summary.totalCollectedCdf.toLocaleString('fr-FR')}</td><td>—</td><td>${report.summary.totalDeliveryFees.toLocaleString('fr-FR')}</td><td></td></tr>
    <tr class="solde-row"><td colspan="3">Solde</td><td>$${report.summary.soldeUsd.toLocaleString('fr-FR')}</td><td>${report.summary.soldeCdf.toLocaleString('fr-FR')}</td><td colspan="3"></td></tr>
    <tr class="cumul-row"><td colspan="3">Solde Cumulé</td><td>$${report.cumulativeSolde.soldeUsd.toLocaleString('fr-FR')}</td><td>${report.cumulativeSolde.soldeCdf.toLocaleString('fr-FR')}</td><td colspan="3"></td></tr>
  </tbody></table>
  <div class="stats">
    <div class="stat"><div class="val">${report.summary.total}</div><div class="lbl">Total</div></div>
    <div class="stat" style="background:#dcfce7"><div class="val" style="color:#166534">${report.summary.delivered}</div><div class="lbl">Livrées</div></div>
    <div class="stat" style="background:#ffedd5"><div class="val" style="color:#9a3412">${report.summary.failed}</div><div class="lbl">Échouées</div></div>
    <div class="stat" style="background:#fee2e2"><div class="val" style="color:#991b1b">${report.summary.cancelled}</div><div class="lbl">Annulées</div></div>
    <div class="stat" style="background:#e0e7ff"><div class="val" style="color:#3730a3">${report.summary.successRate}%</div><div class="lbl">Taux réussite</div></div>
  </div>
  ${report.stock.length > 0 ? `<h2>Rapport Stock</h2><table><thead><tr><th>Produit</th><th>Stock début</th><th>Livré</th><th>Entrées</th><th>Stock actuel</th></tr></thead><tbody>${stockRows}<tr class="total-row"><td>Total</td><td>${report.stock.reduce((s,x)=>s+x.stockStart,0)}</td><td>${report.stock.reduce((s,x)=>s+x.delivered,0)}</td><td>0</td><td><strong>${report.stock.reduce((s,x)=>s+x.stockCurrent,0)}</strong></td></tr></tbody></table>` : ''}
  </body></html>`;
  const w = window.open('', '_blank');
  if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 300); }
}

function ReportsTab({ token, partnerName }: { token: string; partnerName: string }) {
  const [view, setView] = useState<'daily' | 'history'>('daily');

  // ── Daily view ──────────────────────────────
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [report, setReport] = useState<DailyReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  async function generateReport() {
    if (!date) return;
    setLoading(true);
    setReport(null);
    setReportError(null);
    try {
      const r = await logisticsApi.partnerPortal.getDailyReport(token, date);
      setReport(r);
    } catch (e: any) {
      setReportError(e?.message ?? 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }

  // ── History view ─────────────────────────────
  const [period, setPeriod] = useState<HistoryPeriod>('month');
  const [customFrom, setCustomFrom] = useState(() => new Date(Date.now() - 30*24*60*60*1000).toISOString().slice(0,10));
  const [customTo, setCustomTo]     = useState(() => new Date().toISOString().slice(0,10));
  const [history, setHistory]       = useState<DailyReportSummary[]>([]);
  const [histLoading, setHistLoading] = useState(false);

  async function loadHistory(p: HistoryPeriod, cf = customFrom, ct = customTo) {
    const { from, to } = periodRange(p, cf, ct);
    setHistLoading(true);
    try { setHistory(await logisticsApi.partnerPortal.getReportsHistory(token, from, to)); }
    catch { setHistory([]); }
    finally { setHistLoading(false); }
  }

  useEffect(() => { if (view === 'history') loadHistory(period); }, [view]);

  const dateLabel = date
    ? new Date(date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : '';

  const PERIOD_CHIPS: { id: HistoryPeriod; label: string }[] = [
    { id: 'today',     label: "Aujourd'hui" },
    { id: 'yesterday', label: 'Hier' },
    { id: '7d',        label: '7 derniers jours' },
    { id: 'month',     label: 'Ce mois' },
    { id: 'prevmonth', label: 'Mois précédent' },
    { id: 'custom',    label: 'Personnalisé' },
  ];

  return (
    <div className="space-y-4">
      {/* View toggle */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-2xl w-fit">
        {(['daily','history'] as const).map(v => (
          <button key={v} onClick={() => setView(v)}
            className={`px-4 py-1.5 rounded-xl text-xs font-semibold transition-all
              ${view === v ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {v === 'daily' ? 'Rapport journalier' : 'Historique'}
          </button>
        ))}
      </div>

      {/* ── DAILY VIEW ── */}
      {view === 'daily' && (
        <div className="space-y-4">
          <div className="flex gap-2 items-center flex-wrap">
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400 bg-white" />
            <button onClick={generateReport} disabled={loading}
              className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
              {loading ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <FileText size={14} />}
              Générer
            </button>
            {report && (
              <>
                <button onClick={() => exportPdf(report, partnerName)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-red-50 text-red-600 rounded-xl text-xs font-semibold hover:bg-red-100">
                  <Printer size={13} /> PDF
                </button>
                <button onClick={() => exportCsv(report)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-green-50 text-green-700 rounded-xl text-xs font-semibold hover:bg-green-100">
                  <FileText size={13} /> Excel
                </button>
              </>
            )}
          </div>

          {!report && !loading && !reportError && (
            <div className="text-center py-12 text-gray-400">
              <FileText size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">Choisissez une date et appuyez sur Générer.</p>
            </div>
          )}

          {reportError && (
            <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 text-sm text-red-700">
              Erreur : {reportError}
            </div>
          )}

          {loading && (
            <div className="flex justify-center py-10">
              <span className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
            </div>
          )}

          {!loading && report && (
            <div className="space-y-4">
              <h2 className="font-black text-gray-900 text-center capitalize text-base">{dateLabel}</h2>

              {/* Orders table */}
              {report.orders.length > 0 ? (
                <div>
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Commandes</h3>
                  <div className="overflow-x-auto rounded-2xl border border-gray-100 shadow-sm">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 text-gray-500">
                        <tr>{['N°','Zone','Agent','$','FC','Observation','Frais','Statut'].map(h => (
                          <th key={h} className="px-2 py-2 text-left font-semibold whitespace-nowrap">{h}</th>
                        ))}</tr>
                      </thead>
                      <tbody>
                        {report.orders.map(o => {
                          const st = RPT_STATUS[o.status] ?? { label: o.status, color: 'text-gray-500' };
                          const obs = o.notes ?? o.items.map(i => `${i.quantity} ${i.name}`).join(', ');
                          return (
                            <tr key={o.id} className="border-t border-gray-100">
                              <td className="px-2 py-2 font-bold text-indigo-600">{o.num}</td>
                              <td className="px-2 py-2 text-gray-700">{o.city}</td>
                              <td className="px-2 py-2 text-gray-500">{o.agentName ?? '—'}</td>
                              <td className="px-2 py-2 font-semibold">{o.collectedUsd > 0 ? `$${o.collectedUsd.toLocaleString('fr-FR')}` : o.totalAmount > 0 ? `$${o.totalAmount.toLocaleString('fr-FR')}` : '—'}</td>
                              <td className="px-2 py-2">{o.collectedCdf > 0 ? o.collectedCdf.toLocaleString('fr-FR') : '—'}</td>
                              <td className="px-2 py-2 text-gray-500 max-w-[100px] truncate">{obs}</td>
                              <td className="px-2 py-2">{o.deliveryFee > 0 ? o.deliveryFee.toLocaleString('fr-FR') : '—'}</td>
                              <td className={`px-2 py-2 font-semibold ${st.color}`}>{st.label}</td>
                            </tr>
                          );
                        })}
                        <tr className="border-t-2 border-gray-300 bg-yellow-50 font-black text-xs">
                          <td colSpan={3} className="px-2 py-2">TOTAL</td>
                          <td className="px-2 py-2">${report.summary.totalCollectedUsd.toLocaleString('fr-FR')}</td>
                          <td className="px-2 py-2">{report.summary.totalCollectedCdf.toLocaleString('fr-FR')}</td>
                          <td className="px-2 py-2">—</td>
                          <td className="px-2 py-2">{report.summary.totalDeliveryFees.toLocaleString('fr-FR')}</td>
                          <td></td>
                        </tr>
                        <tr className="bg-yellow-100 font-bold text-xs">
                          <td colSpan={3} className="px-2 py-1.5">Solde</td>
                          <td className="px-2 py-1.5">${report.summary.soldeUsd.toLocaleString('fr-FR')}</td>
                          <td className="px-2 py-1.5">{report.summary.soldeCdf.toLocaleString('fr-FR')}</td>
                          <td colSpan={3}></td>
                        </tr>
                        <tr className="bg-red-100 font-black text-xs text-red-800">
                          <td colSpan={3} className="px-2 py-1.5">Solde Cumulé</td>
                          <td className="px-2 py-1.5">${report.cumulativeSolde.soldeUsd.toLocaleString('fr-FR')}</td>
                          <td className="px-2 py-1.5">{report.cumulativeSolde.soldeCdf.toLocaleString('fr-FR')}</td>
                          <td colSpan={3}></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <p className="text-center text-sm text-gray-400 py-6">Aucune commande pour cette journée.</p>
              )}

              {/* Stats */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Total',       val: report.summary.total,       bg: 'bg-gray-100 text-gray-700' },
                  { label: 'Livrées',     val: report.summary.delivered,   bg: 'bg-green-100 text-green-700' },
                  { label: 'Échouées',    val: report.summary.failed,      bg: 'bg-orange-100 text-orange-700' },
                  { label: 'Annulées',    val: report.summary.cancelled,   bg: 'bg-red-100 text-red-600' },
                  { label: 'En attente',  val: report.summary.pending,     bg: 'bg-blue-100 text-blue-700' },
                  { label: 'Taux réussite', val: `${report.summary.successRate}%`, bg: 'bg-indigo-100 text-indigo-700' },
                ].map(({ label, val, bg }) => (
                  <div key={label} className={`rounded-2xl p-3 text-center ${bg}`}>
                    <p className="text-lg font-black">{val}</p>
                    <p className="text-[10px] font-semibold mt-0.5">{label}</p>
                  </div>
                ))}
              </div>

              {/* Stock */}
              {report.stock.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Rapport Stock</h3>
                  <div className="overflow-x-auto rounded-2xl border border-gray-100 shadow-sm">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 text-gray-500">
                        <tr>{['Produit','Stock début','Livré','Entrées','Stock actuel'].map(h => (
                          <th key={h} className="px-3 py-2 text-left font-semibold">{h}</th>
                        ))}</tr>
                      </thead>
                      <tbody>
                        {report.stock.map(s => (
                          <tr key={s.productName} className="border-t border-gray-100">
                            <td className="px-3 py-2 font-medium text-gray-700">{s.productName}</td>
                            <td className="px-3 py-2 text-center">{s.stockStart}</td>
                            <td className="px-3 py-2 text-center text-red-600 font-semibold">{s.delivered}</td>
                            <td className="px-3 py-2 text-center text-green-600">{s.entries}</td>
                            <td className="px-3 py-2 text-center font-black text-gray-900">{s.stockCurrent}</td>
                          </tr>
                        ))}
                        <tr className="border-t-2 border-gray-300 bg-yellow-50 font-bold">
                          <td className="px-3 py-2">Total</td>
                          <td className="px-3 py-2 text-center">{report.stock.reduce((s,x)=>s+x.stockStart,0)}</td>
                          <td className="px-3 py-2 text-center text-red-600">{report.stock.reduce((s,x)=>s+x.delivered,0)}</td>
                          <td className="px-3 py-2 text-center text-green-600">0</td>
                          <td className="px-3 py-2 text-center font-black">{report.stock.reduce((s,x)=>s+x.stockCurrent,0)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── HISTORY VIEW ── */}
      {view === 'history' && (
        <div className="space-y-4">
          {/* Period chips */}
          <div className="flex gap-1.5 flex-wrap">
            {PERIOD_CHIPS.map(c => (
              <button key={c.id} onClick={() => { setPeriod(c.id); if (c.id !== 'custom') loadHistory(c.id); }}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all border
                  ${period === c.id ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                {c.label}
              </button>
            ))}
          </div>

          {period === 'custom' && (
            <div className="flex gap-2 items-center flex-wrap">
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400 bg-white" />
              <span className="text-gray-400 text-sm">→</span>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400 bg-white" />
              <button onClick={() => loadHistory('custom', customFrom, customTo)}
                className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700">
                Appliquer
              </button>
            </div>
          )}

          {histLoading && (
            <div className="flex justify-center py-8">
              <span className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
            </div>
          )}

          {!histLoading && history.length === 0 && (
            <p className="text-center text-sm text-gray-400 py-8">Aucun rapport sur cette période.</p>
          )}

          {!histLoading && history.length > 0 && (
            <div className="overflow-x-auto rounded-2xl border border-gray-100 shadow-sm">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>{['Date','Cmds','Livrées','Échecs','CA $','CA FC','Frais','Solde $','Solde FC'].map(h => (
                    <th key={h} className="px-2 py-2 text-left font-semibold whitespace-nowrap">{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {history.map(row => (
                    <tr key={row.date} className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer"
                      onClick={() => { setView('daily'); setDate(row.date); setReport(null); }}>
                      <td className="px-2 py-2 font-semibold text-indigo-600">
                        {new Date(row.date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' })}
                      </td>
                      <td className="px-2 py-2">{row.total}</td>
                      <td className="px-2 py-2 text-green-600 font-semibold">{row.delivered}</td>
                      <td className="px-2 py-2 text-orange-500">{row.failed}</td>
                      <td className="px-2 py-2 font-semibold">${row.totalCollectedUsd.toLocaleString('fr-FR')}</td>
                      <td className="px-2 py-2">{row.totalCollectedCdf.toLocaleString('fr-FR')}</td>
                      <td className="px-2 py-2 text-gray-500">{row.totalDeliveryFees.toLocaleString('fr-FR')}</td>
                      <td className="px-2 py-2 font-bold">${row.soldeUsd.toLocaleString('fr-FR')}</td>
                      <td className="px-2 py-2 font-bold">{row.soldeCdf.toLocaleString('fr-FR')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!histLoading && history.length > 0 && (
            <p className="text-[10px] text-gray-400 text-center">Cliquez sur une ligne pour voir le rapport complet de ce jour.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Finances Tab ──────────────────────────────────────────────────────────────

function FinancesTab({ token }: { token: string }) {
  const [finances, setFinances] = useState<PartnerFinances | null>(null);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('FC');
  const [notes, setNotes] = useState('');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formMsg, setFormMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { fetchFinances(); }, []);

  async function fetchFinances() {
    setLoading(true);
    try {
      const data = await logisticsApi.partnerPortal.getFinances(token);
      setFinances(data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) return;
    setSubmitting(true);
    setFormMsg('');
    try {
      let proofUrl: string | undefined;
      if (proofFile) {
        const fd = new FormData();
        fd.append('file', proofFile);
        const res = await fetch(`${BASE_URL}/upload`, { method: 'POST', body: fd });
        if (res.ok) {
          const json = await res.json();
          proofUrl = json.url;
        }
      }
      await logisticsApi.partnerPortal.createPayment(token, {
        amount: Number(amount),
        currency,
        proofUrl,
        notes: notes.trim() || undefined,
      });
      setAmount(''); setNotes(''); setProofFile(null);
      if (fileRef.current) fileRef.current.value = '';
      setFormMsg('Versement soumis. En attente de confirmation.');
      await fetchFinances();
    } catch {
      setFormMsg('Erreur lors de la soumission. Réessayez.');
    } finally { setSubmitting(false); }
  }

  function paymentBadge(status: string) {
    if (status === 'confirmed') return 'bg-green-100 text-green-700';
    if (status === 'rejected') return 'bg-red-100 text-red-600';
    return 'bg-amber-100 text-amber-700';
  }

  function paymentLabel(status: string) {
    if (status === 'confirmed') return 'Confirmé';
    if (status === 'rejected') return 'Rejeté';
    return 'En attente';
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <span className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!finances) {
    return <p className="text-center text-sm text-gray-400 py-12">Impossible de charger les données.</p>;
  }

  return (
    <div className="space-y-5">
      {/* Balance summary */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm text-center">
          <p className="text-[10px] font-semibold text-gray-400 mb-1">Total dû</p>
          <p className="text-base font-black text-gray-900">{Number(finances.totalOwed).toLocaleString('fr-FR')}</p>
          <p className="text-[10px] text-gray-400">FC</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm text-center">
          <p className="text-[10px] font-semibold text-gray-400 mb-1">Total payé</p>
          <p className="text-base font-black text-green-700">{Number(finances.totalPaid).toLocaleString('fr-FR')}</p>
          <p className="text-[10px] text-gray-400">FC</p>
        </div>
        <div className={`rounded-2xl p-4 border shadow-sm text-center ${finances.balance > 0 ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'}`}>
          <p className="text-[10px] font-semibold text-gray-500 mb-1">Solde</p>
          <p className={`text-base font-black ${finances.balance > 0 ? 'text-amber-700' : 'text-green-700'}`}>
            {Number(finances.balance).toLocaleString('fr-FR')}
          </p>
          <p className="text-[10px] text-gray-400">FC</p>
        </div>
      </div>

      {/* New versement form */}
      <div className="bg-white rounded-2xl p-4 border border-indigo-200 shadow-sm">
        <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
          <DollarSign size={15} className="text-indigo-600" /> Déclarer un versement
        </h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex gap-2">
            <input
              type="number" min="1" step="any" value={amount} required
              onChange={e => setAmount(e.target.value)}
              placeholder="Montant *"
              className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-400"
            />
            <select value={currency} onChange={e => setCurrency(e.target.value)}
              className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-400 bg-white">
              <option value="FC">FC</option>
              <option value="USD">USD</option>
            </select>
          </div>
          <input
            type="text" value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Notes (optionnel)"
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Preuve de paiement (photo)</label>
            <input
              ref={fileRef} type="file" accept="image/*"
              onChange={e => setProofFile(e.target.files?.[0] ?? null)}
              className="w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
            />
          </div>
          {formMsg && (
            <p className={`text-xs font-medium ${formMsg.includes('soumis') ? 'text-green-600' : 'text-red-500'}`}>{formMsg}</p>
          )}
          <button type="submit" disabled={submitting || !amount}
            className="w-full py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
            {submitting ? '...' : 'Soumettre le versement'}
          </button>
        </form>
      </div>

      {/* Delivered orders breakdown */}
      {(finances.deliveredOrders?.length ?? 0) > 0 && (
        <div>
          <h3 className="text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">Commandes livrées</h3>
          <div className="space-y-2">
            {finances.deliveredOrders?.map(o => (
              <div key={o.id} className="bg-white rounded-xl px-4 py-3 border border-gray-100 shadow-sm flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-gray-900">#{String(o.orderNumber).padStart(4, '0')} — {o.customerName}</p>
                  <p className="text-xs text-gray-400">{new Date(o.createdAt).toLocaleDateString('fr-FR')}</p>
                </div>
                <span className="text-sm font-bold text-gray-700 shrink-0">{Number(o.totalAmount).toLocaleString('fr-FR')} FC</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Payment history */}
      <div>
        <h3 className="text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">Historique des versements</h3>
        {(finances.payments?.length ?? 0) === 0 ? (
          <p className="text-center text-sm text-gray-400 py-6">Aucun versement pour le moment.</p>
        ) : (
          <div className="space-y-2">
            {finances.payments?.map(p => (
              <div key={p.id} className="bg-white rounded-xl px-4 py-3 border border-gray-100 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${paymentBadge(p.status)}`}>
                      {paymentLabel(p.status)}
                    </span>
                    <span className="text-sm font-bold text-gray-900">
                      {Number(p.amount).toLocaleString('fr-FR')} {p.currency}
                    </span>
                  </div>
                  <span className="text-xs text-gray-400">
                    {new Date(p.createdAt).toLocaleDateString('fr-FR')}
                  </span>
                </div>
                {p.notes && <p className="text-xs text-gray-500 mt-1">{p.notes}</p>}
                {p.proofUrl && (
                  <a href={p.proofUrl} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-indigo-600 hover:underline mt-1 block">
                    Voir la preuve
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <span className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
    </div>
  );
}

function ErrorPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center p-8 max-w-sm">
        <Truck size={40} className="text-gray-300 mx-auto mb-3" />
        <p className="text-gray-700 font-semibold mb-1">Portail introuvable</p>
        <p className="text-gray-400 text-sm">Ce lien n'est pas valide ou a expiré.</p>
      </div>
    </div>
  );
}
