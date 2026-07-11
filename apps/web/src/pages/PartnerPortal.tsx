import { useState, useEffect } from 'react';
import { ChevronRight, Package, Truck, X, MapPin, Calendar } from 'lucide-react';
import { logisticsApi, type ManualOrder } from '../api/logistics';

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending:    { label: 'En attente',  color: 'bg-gray-100 text-gray-600' },
  dispatched: { label: 'Dispatché',   color: 'bg-blue-100 text-blue-700' },
  delivered:  { label: 'Livré',        color: 'bg-green-100 text-green-700' },
  returned:   { label: 'Retourné',    color: 'bg-orange-100 text-orange-700' },
  cancelled:  { label: 'Annulé',      color: 'bg-red-100 text-red-600' },
};

interface LocationStockEntry {
  id: string;
  productId: string;
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
  location: {
    id: string;
    name: string;
    stocks: LocationStockEntry[];
  } | null;
  orders: ManualOrder[];
}

interface Props {
  token: string;
}

export function PartnerPortal({ token }: Props) {
  const [data, setData] = useState<PartnerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [deliverModal, setDeliverModal] = useState<{ orderId: string } | null>(null);
  const [deliveryPersonName, setDeliveryPersonName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    load();
  }, [token]);

  async function load() {
    setLoading(true);
    setError(false);
    try {
      const res = await logisticsApi.partnerPortal.getOrders(token);
      if (!res || !res.id) { setError(true); return; }
      setData(res as PartnerData);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(orderId: string, status: string, personName?: string) {
    if (!data) return;
    setSubmitting(true);
    try {
      await logisticsApi.partnerPortal.updateOrderStatus(token, orderId, { status, deliveryPersonName: personName });
      setData(d => d ? {
        ...d,
        orders: d.orders.map(o => o.id === orderId
          ? { ...o, status, deliveryPersonName: personName ?? o.deliveryPersonName }
          : o)
      } : d);
    } catch { /* ignore */ }
    finally { setSubmitting(false); }
  }

  async function confirmDelivered() {
    if (!deliverModal) return;
    await updateStatus(deliverModal.orderId, 'delivered', deliveryPersonName || undefined);
    setDeliverModal(null);
    setDeliveryPersonName('');
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <span className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !data) {
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

  const activeOrders = data.orders.filter(o => o.status !== 'cancelled');

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-indigo-600 text-white px-4 py-6">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-3 mb-1">
            <Truck size={24} />
            <h1 className="text-xl font-black">{data.name}</h1>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/20`}>
              {data.type === 'COMPANY' ? 'Entreprise' : 'Indépendant'}
            </span>
          </div>
          {data.city && (
            <p className="text-indigo-200 text-sm flex items-center gap-1">
              <MapPin size={12} /> {data.city}
            </p>
          )}
          <p className="text-indigo-200 text-xs mt-1">
            {activeOrders.length} commande{activeOrders.length !== 1 ? 's' : ''} active{activeOrders.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Stock emplacement */}
        {data.location?.stocks && data.location.stocks.length > 0 && (
          <div>
            <h2 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
              <Package size={14} /> Stock disponible — {data.location.name}
            </h2>
            <div className="grid grid-cols-2 gap-2">
              {data.location.stocks.map(s => (
                <div key={s.id} className="bg-white rounded-xl p-3 border border-gray-100 shadow-sm">
                  <p className="text-xs text-gray-500 mb-0.5">{s.product.name}</p>
                  <p className="text-2xl font-black text-gray-900">{s.quantity}</p>
                  <p className="text-[10px] text-gray-400">unités</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Commandes */}
        <div>
          <h2 className="text-sm font-bold text-gray-700 mb-3">Mes commandes assignées</h2>
          {activeOrders.length === 0 && (
            <div className="text-center py-10 text-gray-400">
              <Truck size={32} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">Aucune commande pour le moment.</p>
            </div>
          )}
          <div className="space-y-3">
            {activeOrders.map(o => {
              const st = STATUS_LABELS[o.status] ?? STATUS_LABELS.pending;
              return (
                <div key={o.id} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-black text-indigo-600 text-sm">#{String(o.orderNumber).padStart(4, '0')}</span>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
                      </div>
                      <p className="font-bold text-gray-900">{o.customerName}</p>
                      <p className="text-xs text-gray-400 mb-0.5">
                        {new Date(o.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </p>
                      <p className="text-sm text-gray-500">{o.city} — {o.address}</p>
                      {o.customerPhone && <p className="text-xs text-gray-400">{o.customerPhone}</p>}
                      {o.scheduledAt && (
                        <p className="text-xs text-indigo-600 mt-1 flex items-center gap-1">
                          <Calendar size={10} /> Livraison prévue : {new Date(o.scheduledAt).toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      )}

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

                      <div className="flex gap-3 mt-2 text-xs font-semibold flex-wrap">
                        <span className="text-gray-900">${Number(o.totalAmount).toLocaleString('fr-FR')}</span>
                        <span className="text-gray-500">{Number(o.deliveryFee).toLocaleString('fr-FR')} FC livraison</span>
                      </div>
                      {o.deliveryPersonName && (
                        <p className="text-xs text-green-600 mt-1">👤 {o.deliveryPersonName}</p>
                      )}
                    </div>

                    <div className="flex flex-col gap-1.5 shrink-0">
                      {o.status === 'pending' && (
                        <button onClick={() => updateStatus(o.id, 'dispatched')} disabled={submitting}
                          className="flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-semibold hover:bg-blue-100 transition-colors">
                          <ChevronRight size={12} /> Dispatcher
                        </button>
                      )}
                      {o.status === 'dispatched' && (
                        <button onClick={() => { setDeliverModal({ orderId: o.id }); setDeliveryPersonName(''); }} disabled={submitting}
                          className="flex items-center gap-1 px-3 py-1.5 bg-green-50 text-green-700 rounded-lg text-xs font-semibold hover:bg-green-100 transition-colors">
                          <ChevronRight size={12} /> Livré
                        </button>
                      )}
                      {(o.status === 'pending' || o.status === 'dispatched') && (
                        <button onClick={() => updateStatus(o.id, 'returned')} disabled={submitting}
                          className="px-3 py-1.5 bg-orange-50 text-orange-700 rounded-lg text-xs font-semibold hover:bg-orange-100 transition-colors">
                          Retourné
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Modal confirmation livraison */}
      {deliverModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="font-bold text-gray-900">Confirmer la livraison</h2>
              <button onClick={() => setDeliverModal(null)} className="p-1.5 rounded-lg hover:bg-gray-100">
                <X size={18} className="text-gray-500" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-sm text-gray-600">Nom du livreur ayant effectué la livraison (optionnel).</p>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Nom du livreur</label>
                <input
                  type="text" value={deliveryPersonName}
                  onChange={e => setDeliveryPersonName(e.target.value)}
                  placeholder="ex: Jean-Paul"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>
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
