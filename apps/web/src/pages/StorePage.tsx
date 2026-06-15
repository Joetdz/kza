import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import {
  Store, Copy, ExternalLink, Check, Package, ChevronRight,
  ToggleLeft, ToggleRight, Loader2, ShoppingBag, Clock, CheckCircle,
  XCircle, Truck,
} from 'lucide-react';

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

export function StorePage() {
  const [tab, setTab] = useState<'config' | 'products' | 'share' | 'orders'>('config');
  const [store, setStore] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [visibleIds, setVisibleIds] = useState<Set<string>>(new Set());
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '',
    description: '',
    whatsappPhone: '',
    primaryColor: '#6366f1',
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
          active: s.active,
        });
        setVisibleIds(new Set(s.visibleProductIds ?? []));
        // Pre-fill phone from WA session if not set
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
  }, [tab, store]);

  const saveConfig = async () => {
    if (!form.name.trim() || !form.whatsappPhone.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      const s = await api<any>('/store/my', {
        method: 'PUT',
        body: JSON.stringify(form),
      });
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
    await api(`/store/my/orders/${orderId}`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status } : o));
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
    { key: 'config', label: 'Configuration' },
    { key: 'products', label: 'Produits' },
    { key: 'share', label: 'Lien & Partage' },
    { key: 'orders', label: 'Commandes' },
  ] as const;

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
      <div className="flex gap-1 bg-gray-100 p-1 rounded-2xl mb-6">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
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
                  style={{ background: c.value }}
                  title={c.label} />
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between pt-2">
            <div>
              <p className="text-sm font-medium text-gray-700">Boutique active</p>
              <p className="text-xs text-gray-400">Les clients peuvent visiter et commander</p>
            </div>
            <button onClick={() => setForm(f => ({ ...f, active: !f.active }))}
              className="transition-colors">
              {form.active
                ? <ToggleRight size={32} className="text-indigo-600" />
                : <ToggleLeft size={32} className="text-gray-300" />}
            </button>
          </div>
          {saveError && (
            <div className="bg-red-50 border border-red-100 rounded-xl px-3 py-2.5 text-sm text-red-600">
              {saveError}
            </div>
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
                <div key={p.id} className="flex items-center gap-3 p-3 hover:bg-gray-50 transition-colors cursor-pointer"
                  onClick={() => toggleProduct(p.id)}>
                  <div className="w-12 h-12 rounded-xl bg-gray-100 overflow-hidden shrink-0 flex items-center justify-center">
                    {imgUrl
                      ? <img src={imgUrl} alt={p.name} className="w-full h-full object-cover" />
                      : <Package size={18} className="text-gray-300" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 text-sm truncate">{p.name}</p>
                    <p className="text-xs text-gray-400">{p.sellingPrice.toLocaleString('fr-FR')} FC · Stock : {p.quantity}</p>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${selected ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300'}`}>
                    {selected && <Check size={11} color="white" strokeWidth={3} />}
                  </div>
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
                <p className="text-xs text-indigo-600">Copiez ce lien et envoyez-le à vos clients par WhatsApp, Instagram, Facebook ou SMS. Ils verront directement vos produits disponibles et pourront commander.</p>
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
                      {item.name} × {item.qty} — {(item.qty * item.unitPrice).toLocaleString('fr-FR')} FC
                    </p>
                  ))}
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-gray-900">{order.totalAmount.toLocaleString('fr-FR')} FC</p>
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
