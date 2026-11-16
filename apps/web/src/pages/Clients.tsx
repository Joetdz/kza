import { useState, useEffect, useMemo } from 'react';
import { Phone, MessageCircle, Search, RefreshCw, History, Users } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { ListSkeleton } from '../components/ui/Skeleton';
import { PageHeader, Stat, EmptyState } from '../components/ui/Page';
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
    <div className="space-y-5 overflow-x-hidden">
      <PageHeader
        title="Clients"
        subtitle={`${orders.length} commande${orders.length > 1 ? 's' : ''} · les clients et leur historique`}
        actions={
          <Button variant="secondary" onClick={load} disabled={loading} title="Actualiser">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Actualiser</span>
          </Button>
        }
      />

      {/* Repeat-purchase summary */}
      {repeat.customers > 0 && (
        <div className="grid grid-cols-3 gap-3 stagger">
          <Stat label="Clients" value={String(repeat.customers)} />
          <Stat label="Ont recommandé" value={String(repeat.returning)} tone="warning" />
          <Stat label="Taux de réachat" value={`${repeat.rate} %`} tone="positive" />
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-4 pointer-events-none" />
        <input
          type="search" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher par nom, téléphone, adresse…"
          className="input pl-10"
        />
      </div>

      {/* Filter chips */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
        {FILTERS.map(f => (
          <button key={f.value} onClick={() => setFilter(f.value)} aria-pressed={filter === f.value} className="chip !py-1.5 !text-xs">
            {f.label}
            {counts[f.value] !== undefined && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${filter === f.value ? 'bg-white/20 text-white' : f.color}`}>
                {counts[f.value]}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading && orders.length === 0 ? (
        <ListSkeleton count={5} />
      ) : (
        <>
          <p className="text-xs text-fg-3">{filtered.length} résultat{filtered.length !== 1 ? 's' : ''}</p>
          {filtered.length === 0 ? (
            <EmptyState icon={Users} title="Aucun client trouvé"
              text={search || filter !== 'all' ? 'Essaie un autre nom, numéro ou statut.' : 'Les clients apparaissent ici dès leur première commande.'} />
          ) : (
            <div key={`${filter}-${search}`} className="space-y-2 stagger">
              {filtered.map(o => {
                const st = STATUS_LABELS[o.status] ?? STATUS_LABELS.pending;
                const isPostponed = !!o.scheduledAt && o.status !== 'delivered' && o.status !== 'cancelled';
                return (
                  <article key={o.id} className="card card-hover p-4">
                    <div className="flex items-start gap-3">
                      {/* Initials */}
                      <div className="w-10 h-10 rounded-full bg-indigo-600/10 text-indigo-700 font-bold text-sm flex items-center justify-center shrink-0">
                        {o.customerName.trim().charAt(0).toUpperCase() || '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        {/* Name + status */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-fg truncate">{o.customerName}</p>
                          <span className="text-[11px] font-semibold text-fg-4 tabular-nums">#{String(o.orderNumber).padStart(4, '0')}</span>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
                          {isPostponed && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700">
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

                        {o.customerPhone && <p className="text-sm text-fg-2 tabular-nums mt-0.5">{o.customerPhone}</p>}

                        <p className="text-xs text-fg-3 mt-0.5">
                          {o.city} — {o.address} · {new Date(o.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </p>

                        <p className="text-xs text-fg-3 mt-1 line-clamp-2">
                          {o.items.map(i => `${i.product.name} ×${i.quantity}`).join(', ')}
                        </p>

                        <div className="flex items-center gap-3 mt-2 text-xs flex-wrap">
                          <span className="font-bold text-fg tabular-nums">${Number(o.totalAmount).toLocaleString('fr-FR')}</span>
                          <span className="text-amber-700 tabular-nums">{Number(o.deliveryFee).toLocaleString('fr-FR')} FC livraison</span>
                          {o.partner && <span className="text-fg-4">via {o.partner.name}</span>}
                        </div>
                      </div>

                      {/* Quick actions */}
                      {o.customerPhone && (
                        <div className="flex flex-col sm:flex-row gap-1 shrink-0">
                          <a href={`tel:${o.customerPhone}`} className="icon-btn text-emerald-600 hover:bg-emerald-50" title="Appeler" aria-label="Appeler">
                            <Phone size={16} />
                          </a>
                          <a href={waLink(o.customerPhone)} target="_blank" rel="noopener noreferrer"
                            className="icon-btn text-emerald-600 hover:bg-emerald-50" title="WhatsApp" aria-label="Écrire sur WhatsApp">
                            <MessageCircle size={16} />
                          </a>
                          <button onClick={() => setHistoryPhone(o.customerPhone!)}
                            className="icon-btn text-indigo-600 hover:bg-indigo-600/10" title="Historique d'achat" aria-label="Historique d'achat">
                            <History size={16} />
                          </button>
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}

      {historyPhone && (
        <CustomerHistoryPanel phone={historyPhone} onClose={() => setHistoryPhone(null)} />
      )}
    </div>
  );
}
