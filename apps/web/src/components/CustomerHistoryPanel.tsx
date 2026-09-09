import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Package, Loader2, TrendingUp, Calendar, MapPin } from 'lucide-react';
import { logisticsApi, type CustomerPurchaseHistory } from '../api/logistics';
import { ScrollLock } from './ui/ScrollLock';

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending:        { label: 'En attente',      color: 'bg-gray-100 text-gray-600' },
  called:         { label: 'Appelé',          color: 'bg-sky-100 text-sky-700' },
  messaged:       { label: 'Contacté',        color: 'bg-violet-100 text-violet-700' },
  confirmed:      { label: 'Confirmé',        color: 'bg-teal-100 text-teal-700' },
  support_needed: { label: 'Support',         color: 'bg-amber-100 text-amber-700' },
  dispatched:     { label: 'Assigné',         color: 'bg-blue-100 text-blue-700' },
  postponed:      { label: 'Reporté',         color: 'bg-purple-100 text-purple-700' },
  delivered:      { label: 'Livré',           color: 'bg-green-100 text-green-700' },
  returned:       { label: 'Retourné',        color: 'bg-orange-100 text-orange-700' },
  fake:           { label: 'Fausse commande', color: 'bg-stone-100 text-stone-600' },
  cancelled:      { label: 'Annulé',          color: 'bg-red-100 text-red-600' },
};

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });

const fmtMoney = (n: number) => Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 2 });

export function CustomerHistoryPanel({ phone, onClose }: { phone: string; onClose: () => void }) {
  const [data, setData] = useState<CustomerPurchaseHistory | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    logisticsApi
      .getCustomerHistory(phone)
      .then(res => { if (!cancelled) setData(res); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [phone]);

  // Rendered into document.body: the pages that open this sit inside containers with
  // their own stacking/overflow context, which would otherwise clip a fixed overlay.
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
      <ScrollLock />
      <div className="bg-gray-50 w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl max-h-[92vh] sm:max-h-[85vh] flex flex-col shadow-xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 bg-white border-b border-gray-100 sm:rounded-t-2xl rounded-t-2xl shrink-0">
          <div className="min-w-0">
            <h2 className="font-bold text-gray-900 truncate">
              {loading ? 'Chargement…' : data?.customerName ?? 'Client'}
            </h2>
            <p className="text-xs text-gray-500">{phone}</p>
          </div>
          <button onClick={onClose} className="p-2 -mr-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 shrink-0">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4">
          {loading ? (
            <div className="py-16 flex justify-center text-gray-400">
              <Loader2 size={22} className="animate-spin" />
            </div>
          ) : !data ? (
            <p className="py-16 text-center text-sm text-gray-500">
              Aucune commande confirmée pour ce client.
            </p>
          ) : (
            <>
              {/* Key figures */}
              <div className="grid grid-cols-3 gap-3 mb-5">
                <div className="bg-white rounded-2xl border border-gray-100 px-3 py-2.5">
                  <p className="text-[11px] text-gray-400 font-semibold">Commandes</p>
                  <p className="text-lg font-black text-gray-900">{data.orderCount}</p>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 px-3 py-2.5">
                  <p className="text-[11px] text-gray-400 font-semibold">Livrées</p>
                  <p className="text-lg font-black text-green-600">{data.deliveredCount}</p>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 px-3 py-2.5">
                  <p className="text-[11px] text-gray-400 font-semibold">Total livré</p>
                  <p className="text-lg font-black text-indigo-600">{fmtMoney(data.totalSpent)}</p>
                </div>
              </div>

              <p className="text-xs text-gray-400 mb-5 flex items-center gap-1.5">
                <Calendar size={12} />
                Client depuis le {fmtDate(data.firstOrderAt)} · dernière commande le {fmtDate(data.lastOrderAt)}
              </p>

              {/* What they buy */}
              {data.topProducts.length > 0 && (
                <section className="mb-5">
                  <h3 className="text-xs font-bold text-gray-700 mb-2 flex items-center gap-1.5">
                    <TrendingUp size={13} className="text-indigo-600" /> Ce qu'il commande
                  </h3>
                  <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50">
                    {data.topProducts.map((p, i) => (
                      <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                        {p.imageUrl
                          ? <img src={p.imageUrl} alt={p.name} className="w-9 h-9 rounded-lg object-cover border border-gray-100 shrink-0" />
                          : <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center shrink-0"><Package size={14} className="text-gray-300" /></div>}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                          <p className="text-[11px] text-gray-400">
                            sur {p.orders} commande{p.orders > 1 ? 's' : ''}
                          </p>
                        </div>
                        <span className="text-sm font-bold text-gray-700 shrink-0">×{p.quantity}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Order timeline */}
              <section>
                <h3 className="text-xs font-bold text-gray-700 mb-2">Historique</h3>
                <div className="space-y-2">
                  {data.orders.map(o => {
                    const st = STATUS_LABELS[o.status] ?? STATUS_LABELS.pending;
                    return (
                      <div key={o.id} className="bg-white rounded-2xl border border-gray-100 px-4 py-3">
                        <div className="flex items-center gap-2 flex-wrap mb-1.5">
                          <span className="font-black text-indigo-600 text-xs">
                            #{String(o.orderNumber).padStart(4, '0')}
                          </span>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${st.color}`}>
                            {st.label}
                          </span>
                          <span className="text-[11px] text-gray-400">{fmtDate(o.createdAt)}</span>
                          <span className="ml-auto text-sm font-bold text-gray-900">{fmtMoney(o.totalAmount)}</span>
                        </div>

                        {o.items.length > 0 && (
                          <ul className="space-y-0.5 mb-1.5">
                            {o.items.map((it, i) => (
                              <li key={i} className="text-xs text-gray-600">
                                {it.quantity} × {it.name}
                                <span className="text-gray-400"> — {fmtMoney(it.unitPrice)}</span>
                              </li>
                            ))}
                          </ul>
                        )}

                        <p className="text-[11px] text-gray-400 flex items-center gap-1">
                          <MapPin size={10} /> {o.city}{o.address ? ` — ${o.address}` : ''}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </section>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
