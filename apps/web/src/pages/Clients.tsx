import { useState, useEffect, useMemo } from 'react';
import { Phone, MessageCircle, Package, Search, RefreshCw, History } from 'lucide-react';
import { logisticsApi, type ManualOrder } from '../api/logistics';
import { CustomerHistoryPanel } from '../components/CustomerHistoryPanel';

const FILTERS: { value: string; label: string; color: string }[] = [
  { value: 'all',           label: 'Tous',            color: 'bg-gray-100 text-gray-700' },
  { value: 'pending',       label: 'En attente',      color: 'bg-gray-100 text-gray-600' },
  { value: 'dispatched',    label: 'Assigné',         color: 'bg-blue-100 text-blue-700' },
  { value: 'delivered',     label: 'Livré',           color: 'bg-green-100 text-green-700' },
  { value: 'postponed',     label: 'À relancer',      color: 'bg-purple-100 text-purple-700' },
  { value: 'returned',      label: 'Retourné',        color: 'bg-orange-100 text-orange-700' },
  { value: 'fake',          label: 'Fausse commande', color: 'bg-stone-100 text-stone-600' },
  { value: 'cancelled',     label: 'Annulé',          color: 'bg-red-100 text-red-600' },
];

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending:        { label: 'En attente',             color: 'bg-gray-100 text-gray-600' },
  called:         { label: 'Appelé',                 color: 'bg-sky-100 text-sky-700' },
  messaged:       { label: 'Contacté',               color: 'bg-violet-100 text-violet-700' },
  confirmed:      { label: 'Confirmé',               color: 'bg-teal-100 text-teal-700' },
  support_needed: { label: 'Support',                color: 'bg-amber-100 text-amber-700' },
  dispatched:     { label: 'Assigné',                color: 'bg-blue-100 text-blue-700' },
  postponed:      { label: 'Reporté',                color: 'bg-purple-100 text-purple-700' },
  delivered:      { label: 'Livré',                  color: 'bg-green-100 text-green-700' },
  returned:       { label: 'Retourné',               color: 'bg-orange-100 text-orange-700' },
  fake:           { label: 'Fausse commande',        color: 'bg-stone-100 text-stone-600' },
  cancelled:      { label: 'Annulé',                 color: 'bg-red-100 text-red-600' },
};

function waLink(phone: string) {
  const digits = phone.replace(/\D/g, '');
  return `https://wa.me/${digits}`;
}

export function Clients() {
  const [orders, setOrders] = useState<ManualOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [historyPhone, setHistoryPhone] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try { setOrders(await logisticsApi.getOrders()); }
    catch { /* ignore */ }
    finally { setLoading(false); }
  }

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: orders.length };
    for (const o of orders) {
      const key = o.status === 'postponed' ? 'postponed' : o.status;
      map[key] = (map[key] ?? 0) + 1;
    }
    return map;
  }, [orders]);

  // Repeat rate: share of customers who came back at least once. Built from the ranks
  // the server computed, so it uses the same normalized-phone matching.
  const repeat = useMemo(() => {
    const totalPerCustomer = new Map<string, number>();
    for (const o of orders) {
      if (o.isDraft || !o.customerOrderCount) continue;
      // customerOrderCount is identical for every order of the same customer, so keying
      // on phone collapses them to one entry.
      totalPerCustomer.set(o.customerPhone ?? o.id, o.customerOrderCount);
    }
    const customers = totalPerCustomer.size;
    const returning = [...totalPerCustomer.values()].filter(n => n > 1).length;
    return {
      customers,
      returning,
      rate: customers > 0 ? Math.round((returning / customers) * 100) : 0,
    };
  }, [orders]);

  const filtered = useMemo(() => {
    let list = orders;
    if (filter !== 'all') {
      list = list.filter(o => {
        if (filter === 'postponed') return o.status === 'postponed' || !!o.scheduledAt;
        return o.status === filter;
      });
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(o =>
        o.customerName.toLowerCase().includes(q) ||
        (o.customerPhone ?? '').includes(q) ||
        o.address.toLowerCase().includes(q) ||
        o.city.toLowerCase().includes(q)
      );
    }
    return list;
  }, [orders, filter, search]);


  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-black text-gray-900">Clients</h1>
          <button onClick={load} disabled={loading}
            className="p-2 text-gray-400 hover:text-indigo-600 transition-colors disabled:opacity-50">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Repeat-purchase summary */}
        {repeat.customers > 0 && (
          <div className="grid grid-cols-3 gap-3 mb-5">
            <div className="bg-white rounded-2xl border border-gray-100 px-4 py-3">
              <p className="text-[11px] text-gray-400 font-semibold">Clients</p>
              <p className="text-xl font-black text-gray-900">{repeat.customers}</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 px-4 py-3">
              <p className="text-[11px] text-gray-400 font-semibold">Ont recommandé</p>
              <p className="text-xl font-black text-amber-600">{repeat.returning}</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 px-4 py-3">
              <p className="text-[11px] text-gray-400 font-semibold">Taux de réachat</p>
              <p className="text-xl font-black text-indigo-600">{repeat.rate}%</p>
            </div>
          </div>
        )}

        {/* Search */}
        <div className="relative mb-4">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher par nom, téléphone, adresse..."
            className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
          />
        </div>

        {/* Filter chips */}
        <div className="flex gap-2 flex-wrap mb-5">
          {FILTERS.map(f => (
            <button key={f.value} onClick={() => setFilter(f.value)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border
                ${filter === f.value
                  ? 'border-indigo-400 bg-indigo-50 text-indigo-700 shadow-sm'
                  : 'border-transparent bg-white text-gray-600 hover:bg-gray-100'
                }`}>
              {f.label}
              {counts[f.value] !== undefined && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${f.color}`}>
                  {counts[f.value]}
                </span>
              )}
            </button>
          ))}
        </div>

        {loading && (
          <div className="text-center py-12 text-gray-400 text-sm">Chargement...</div>
        )}

        {!loading && (
          <>
            <p className="text-xs text-gray-400 mb-3">{filtered.length} résultat{filtered.length !== 1 ? 's' : ''}</p>
            <div className="space-y-2">
              {filtered.map(o => {
                const st = STATUS_LABELS[o.status] ?? STATUS_LABELS.pending;
                const isPostponed = !!o.scheduledAt && o.status !== 'delivered' && o.status !== 'cancelled';
                return (
                  <div key={o.id} className="bg-white rounded-2xl px-4 py-3 border border-gray-100 shadow-sm">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        {/* Name + status */}
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <span className="font-black text-indigo-600 text-xs">#{String(o.orderNumber).padStart(4, '0')}</span>
                          <p className="font-bold text-gray-900">{o.customerName}</p>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
                          {isPostponed && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-50 text-purple-600">
                              📅 {new Date(o.scheduledAt!).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                            </span>
                          )}
                          {/* Rank in this customer's history — only worth showing past the first */}
                          {!!o.customerOrderRank && o.customerOrderRank > 1 && (
                            <span
                              className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700"
                              title={`${o.customerOrderCount} commande${(o.customerOrderCount ?? 0) > 1 ? 's' : ''} au total pour ce client`}
                            >
                              🔁 {o.customerOrderRank}ᵉ commande
                            </span>
                          )}
                        </div>

                        {/* Phone */}
                        {o.customerPhone && (
                          <p className="text-sm text-gray-500 font-medium">{o.customerPhone}</p>
                        )}

                        {/* Location + date */}
                        <p className="text-xs text-gray-400">
                          {o.city} — {o.address} · {new Date(o.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </p>

                        {/* Items summary */}
                        <p className="text-xs text-gray-500 mt-0.5">
                          {o.items.map(i => `${i.product.name} ×${i.quantity}`).join(', ')}
                        </p>

                        {/* Amount */}
                        <div className="flex items-center gap-3 mt-1 text-xs">
                          <span className="font-bold text-gray-700">${Number(o.totalAmount).toLocaleString('fr-FR')}</span>
                          <span className="text-amber-600">{Number(o.deliveryFee).toLocaleString('fr-FR')} FC livraison</span>
                          {o.partner && <span className="text-gray-400">via {o.partner.name}</span>}
                        </div>
                      </div>

                      {/* Quick actions */}
                      {o.customerPhone && (
                        <div className="flex gap-1.5 shrink-0">
                          <a href={`tel:${o.customerPhone}`}
                            className="p-2 rounded-xl bg-green-50 text-green-600 hover:bg-green-100 transition-colors"
                            title="Appeler">
                            <Phone size={14} />
                          </a>
                          <a href={waLink(o.customerPhone)} target="_blank" rel="noopener noreferrer"
                            className="p-2 rounded-xl bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors"
                            title="WhatsApp">
                            <MessageCircle size={14} />
                          </a>
                          <button onClick={() => setHistoryPhone(o.customerPhone!)}
                            className="p-2 rounded-xl bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors"
                            title="Historique d'achat">
                            <History size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {filtered.length === 0 && !loading && (
                <div className="text-center py-12 text-gray-400">
                  <Package size={32} className="mx-auto mb-2 opacity-40" />
                  <p className="text-sm">Aucun client trouvé.</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {historyPhone && (
        <CustomerHistoryPanel phone={historyPhone} onClose={() => setHistoryPhone(null)} />
      )}
    </div>
  );
}
