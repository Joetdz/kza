import { useState, useEffect, useRef } from 'react';
import { Package, Truck, X, MapPin, Users, ShoppingBag, LogOut, Trash2, Plus, KeyRound } from 'lucide-react';
import { logisticsApi, type ManualOrder, type DeliveryAgent } from '../api/logistics';

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

type PortalTab = 'orders' | 'team' | 'stock';

function Portal({ data: initialData, token, onLogout }: {
  data: PartnerData;
  token: string;
  onLogout: () => void;
}) {
  const [data, setData] = useState(initialData);
  const [tab, setTab] = useState<PortalTab>('orders');
  const [deliverModal, setDeliverModal] = useState<{ orderId: string } | null>(null);
  const [deliveryPersonName, setDeliveryPersonName] = useState('');
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
      await changeStatus(deliverModal.orderId, 'delivered', deliveryPersonName || undefined);
      setDeliverModal(null);
      setDeliveryPersonName('');
    } finally { setSubmitting(false); }
  }

  const activeOrders = data.orders.filter(o => o.status !== 'cancelled' && o.status !== 'fake');

  const tabs: { id: PortalTab; label: string; icon: typeof ShoppingBag; count?: number }[] = [
    { id: 'orders', label: 'Commandes', icon: ShoppingBag, count: activeOrders.length },
    { id: 'team',   label: 'Mon équipe', icon: Users,       count: data.agents?.length ?? 0 },
    { id: 'stock',  label: 'Stock',      icon: Package },
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
      </div>

      {/* Delivery confirm modal */}
      {deliverModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="font-bold text-gray-900">Confirmer la livraison</h2>
              <button onClick={() => setDeliverModal(null)}
                className="p-1.5 rounded-lg hover:bg-gray-100"><X size={18} className="text-gray-500" /></button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-sm text-gray-600">Nom du livreur ayant effectué la livraison (optionnel).</p>
              <input
                type="text" value={deliveryPersonName}
                onChange={e => setDeliveryPersonName(e.target.value)}
                placeholder="ex: Jean-Paul"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-400"
              />
              <div className="flex gap-2 pt-1">
                <button onClick={() => setDeliverModal(null)}
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

function OrdersTab({ orders, agents, token, updatingId, onStatusChange, onOrderUpdate }: {
  orders: ManualOrder[];
  agents: DeliveryAgent[];
  token: string;
  updatingId: string | null;
  onStatusChange: (id: string, status: string) => void;
  onOrderUpdate: (order: ManualOrder) => void;
}) {
  const [assigningId, setAssigningId] = useState<string | null>(null);
  // selectedAgent[orderId] = agentId chosen in the select (before confirming)
  const [selectedAgent, setSelectedAgent] = useState<Record<string, string>>({});
  const [waFeedback, setWaFeedback] = useState<string | null>(null);

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

            <p className="font-bold text-gray-900">{o.customerName}</p>
            <p className="text-sm text-gray-500">{o.city} — {o.address}</p>
            {o.customerPhone && <p className="text-xs text-gray-400">{o.customerPhone}</p>}

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
              <div className="mt-2">
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
            )}
          </div>
        );
      })}
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
