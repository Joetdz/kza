import { useState, useEffect } from 'react';
import { Plus, Trash2, MapPin, Truck, ShoppingBag, ChevronRight, X, Package, AlertCircle, MessageCircle, BarChart2, Link, Printer, Edit2, Check, Calendar } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useStore } from '../store/useStore';
import { logisticsApi, type StockLocation, type DeliveryPartner, type ManualOrder, type PartnerReport } from '../api/logistics';
import { CitySelect } from '../components/CitySelect';

const ADMIN_EMAILS = (import.meta.env.VITE_ADMIN_EMAILS ?? '')
  .split(',').map((e: string) => e.trim().toLowerCase()).filter(Boolean);

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending:    { label: 'En attente',  color: 'bg-gray-100 text-gray-600' },
  dispatched: { label: 'Assigné',      color: 'bg-blue-100 text-blue-700' },
  delivered:  { label: 'Livré',        color: 'bg-green-100 text-green-700' },
  returned:   { label: 'Retourné',    color: 'bg-orange-100 text-orange-700' },
  cancelled:  { label: 'Annulé',      color: 'bg-red-100 text-red-600' },
};

function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return null;
  return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function orderNum(n: number) {
  return '#' + String(n).padStart(4, '0');
}

export function Logistics() {
  const { user } = useAuth();
  const { products } = useStore();
  const isAdmin = !!user?.email && ADMIN_EMAILS.includes(user.email.toLowerCase());

  const [tab, setTab] = useState<'locations' | 'partners' | 'orders'>('locations');
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [partners, setPartners] = useState<DeliveryPartner[]>([]);
  const [orders, setOrders] = useState<ManualOrder[]>([]);
  const [loading, setLoading] = useState(false);

  // Modals
  const [showLocModal, setShowLocModal] = useState(false);
  const [showPartnerModal, setShowPartnerModal] = useState(false);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [stockModal, setStockModal] = useState<StockLocation | null>(null);
  const [reportModal, setReportModal] = useState<DeliveryPartner | null>(null);
  const [deliverModal, setDeliverModal] = useState<{ orderId: string } | null>(null);
  const [deliveryPersonName, setDeliveryPersonName] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Partner phone inline edit
  const [editPhoneId, setEditPhoneId] = useState<string | null>(null);
  const [editPhoneVal, setEditPhoneVal] = useState('');

  // Partner WA group selection
  const [groupPickerId, setGroupPickerId] = useState<string | null>(null);
  const [waGroups, setWaGroups] = useState<{ id: string; name: string; participants: number }[]>([]);
  const [waGroupsLoading, setWaGroupsLoading] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');

  // Location form
  const [locForm, setLocForm] = useState({ name: '', city: '', address: '' });

  // Partner form
  const [partnerForm, setPartnerForm] = useState({ name: '', phone: '', city: '', type: 'COMPANY' });

  // Order form
  const [orderForm, setOrderForm] = useState({
    customerName: '', customerPhone: '', city: '', address: '',
    deliveryFee: '', notes: '', partnerId: '', locationId: '', scheduledAt: '',
  });
  const [orderItems, setOrderItems] = useState<{ productId: string; quantity: string; unitPrice: string }[]>([
    { productId: '', quantity: '1', unitPrice: '' },
  ]);

  // Stock allocation
  const [stockAllocations, setStockAllocations] = useState<Record<string, string>>({});
  const [stockLoading, setStockLoading] = useState(false);

  // Report
  const [reportPeriod, setReportPeriod] = useState<'daily' | 'weekly' | 'monthly'>('monthly');
  const [reportData, setReportData] = useState<PartnerReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { if (isAdmin) refresh(); }, [isAdmin]);

  async function refresh() {
    setLoading(true);
    try {
      const [locs, parts, ords] = await Promise.all([
        logisticsApi.getLocations(),
        logisticsApi.getPartners(),
        logisticsApi.getOrders(),
      ]);
      setLocations(locs);
      setPartners(parts);
      setOrders(ords);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  // ── Locations ────────────────────────────────────────────────────

  async function handleCreateLocation() {
    if (!locForm.name || !locForm.city) return;
    setSubmitting(true);
    try {
      await logisticsApi.createLocation(locForm);
      setLocForm({ name: '', city: '', address: '' });
      setShowLocModal(false);
      setLocations(await logisticsApi.getLocations());
    } catch { /* ignore */ }
    finally { setSubmitting(false); }
  }

  async function handleDeleteLocation(id: string) {
    if (!confirm('Supprimer cet emplacement ?')) return;
    await logisticsApi.deleteLocation(id);
    setLocations(l => l.filter(x => x.id !== id));
  }

  async function openStockModal(loc: StockLocation) {
    setStockModal(loc);
    setStockLoading(true);
    try {
      const stocks = await logisticsApi.getLocationStock(loc.id);
      const map: Record<string, string> = {};
      for (const s of stocks) map[s.productId] = String(s.quantity);
      setStockAllocations(map);
    } catch { /* ignore */ }
    finally { setStockLoading(false); }
  }

  async function handleSaveStock() {
    if (!stockModal) return;
    setSubmitting(true);
    try {
      const entries = Object.entries(stockAllocations).filter(([, q]) => q !== '' && Number(q) >= 0);
      await Promise.all(entries.map(([productId, quantity]) =>
        logisticsApi.setLocationStock(stockModal.id, { productId, quantity: Number(quantity) })
      ));
      setStockModal(null);
      setLocations(await logisticsApi.getLocations());
    } catch { /* ignore */ }
    finally { setSubmitting(false); }
  }

  // ── Partners ─────────────────────────────────────────────────────

  async function handleCreatePartner() {
    if (!partnerForm.name) return;
    setSubmitting(true);
    try {
      const p = await logisticsApi.createPartner(partnerForm);
      setPartnerForm({ name: '', phone: '', city: '', type: 'COMPANY' });
      setShowPartnerModal(false);
      setPartners(prev => [...prev, p]);
      setLocations(await logisticsApi.getLocations());
    } catch { /* ignore */ }
    finally { setSubmitting(false); }
  }

  async function handleDeletePartner(id: string) {
    if (!confirm('Supprimer ce partenaire et son emplacement lié ?')) return;
    await logisticsApi.deletePartner(id);
    const [locs, parts] = await Promise.all([logisticsApi.getLocations(), logisticsApi.getPartners()]);
    setLocations(locs);
    setPartners(parts);
  }

  async function savePartnerPhone(id: string) {
    await logisticsApi.updatePartner(id, { phone: editPhoneVal });
    setPartners(prev => prev.map(p => p.id === id ? { ...p, phone: editPhoneVal } : p));
    setEditPhoneId(null);
  }

  async function openGroupPicker(partner: DeliveryPartner) {
    setGroupPickerId(partner.id);
    setSelectedGroupId(partner.whatsappGroupId ?? '');
    setWaGroupsLoading(true);
    try { setWaGroups(await logisticsApi.getWaGroups()); } catch { /* ignore */ }
    finally { setWaGroupsLoading(false); }
  }

  async function savePartnerGroup(id: string) {
    await logisticsApi.updatePartner(id, { whatsappGroupId: selectedGroupId || null });
    setPartners(prev => prev.map(p => p.id === id ? { ...p, whatsappGroupId: selectedGroupId || null } : p));
    setGroupPickerId(null);
  }

  function copyPartnerLink(partner: DeliveryPartner) {
    const url = `${window.location.origin}/#/partenaire/${partner.token}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(partner.id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  }

  async function openReport(partner: DeliveryPartner) {
    setReportModal(partner);
    setReportData(null);
    setReportLoading(true);
    try {
      setReportData(await logisticsApi.getPartnerReport(partner.id, reportPeriod));
    } catch { /* ignore */ }
    finally { setReportLoading(false); }
  }

  async function changeReportPeriod(period: 'daily' | 'weekly' | 'monthly') {
    setReportPeriod(period);
    if (!reportModal) return;
    setReportLoading(true);
    try {
      setReportData(await logisticsApi.getPartnerReport(reportModal.id, period));
    } catch { /* ignore */ }
    finally { setReportLoading(false); }
  }

  // ── Orders ───────────────────────────────────────────────────────

  async function handleCreateOrder() {
    const validItems = orderItems.filter(i => i.productId && Number(i.quantity) > 0);
    if (!orderForm.customerName || !orderForm.city || !orderForm.address || validItems.length === 0) return;
    setSubmitting(true);
    try {
      const o = await logisticsApi.createOrder({
        ...orderForm,
        deliveryFee: Number(orderForm.deliveryFee) || 0,
        partnerId: orderForm.partnerId || undefined,
        locationId: orderForm.locationId || undefined,
        scheduledAt: orderForm.scheduledAt || undefined,
        items: validItems.map(i => ({
          productId: i.productId,
          quantity: Number(i.quantity),
          unitPrice: Number(i.unitPrice) || products.find(p => p.id === i.productId)?.sellingPrice || 0,
        })),
      });
      setOrders(prev => [o, ...prev]);
      setShowOrderModal(false);
      resetOrderForm();
    } catch { /* ignore */ }
    finally { setSubmitting(false); }
  }

  function resetOrderForm() {
    setOrderForm({ customerName: '', customerPhone: '', city: '', address: '', deliveryFee: '', notes: '', partnerId: '', locationId: '', scheduledAt: '' });
    setOrderItems([{ productId: '', quantity: '1', unitPrice: '' }]);
  }

  async function handleStatusChange(id: string, status: string, personName?: string) {
    await logisticsApi.updateStatus(id, status, personName);
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status, deliveryPersonName: personName ?? o.deliveryPersonName } : o));
  }

  async function confirmDelivered() {
    if (!deliverModal) return;
    setSubmitting(true);
    try {
      await handleStatusChange(deliverModal.orderId, 'delivered', deliveryPersonName || undefined);
      setDeliverModal(null);
      setDeliveryPersonName('');
    } finally { setSubmitting(false); }
  }

  async function handleDeleteOrder(id: string) {
    if (!confirm('Supprimer cette commande ?')) return;
    await logisticsApi.deleteOrder(id);
    setOrders(prev => prev.filter(o => o.id !== id));
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center p-8">
          <AlertCircle size={40} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">Accès réservé à l'administrateur</p>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'locations', label: 'Emplacements', icon: MapPin },
    { id: 'partners',  label: 'Partenaires',  icon: Truck },
    { id: 'orders',    label: 'Commandes',    icon: ShoppingBag },
  ] as const;

  return (
    <div className="min-h-screen bg-gray-50 lg:pl-64">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-black text-gray-900 mb-6">Logistique</h1>

        <div className="flex gap-1 bg-gray-100 p-1 rounded-2xl mb-6 w-fit">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all
                ${tab === id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              <Icon size={15} />{label}
            </button>
          ))}
        </div>

        {loading && <div className="text-center py-12 text-gray-400 text-sm">Chargement...</div>}

        {/* ── EMPLACEMENTS ── */}
        {!loading && tab === 'locations' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <p className="text-sm text-gray-500">{locations.length} emplacement{locations.length !== 1 ? 's' : ''}</p>
              <button onClick={() => setShowLocModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors">
                <Plus size={15} /> Ajouter
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {locations.map(loc => (
                <div key={loc.id} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <p className="font-bold text-gray-900">{loc.name}</p>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${loc.type === 'OWN' ? 'bg-indigo-50 text-indigo-600' : 'bg-orange-50 text-orange-600'}`}>
                          {loc.type === 'OWN' ? 'Propre' : 'Partenaire'}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500">{loc.city}{loc.address ? ` — ${loc.address}` : ''}</p>
                      {loc.partner && <p className="text-xs text-gray-400 mt-0.5">via {loc.partner.name}</p>}
                      {loc.stocks && loc.stocks.length > 0 && (
                        <div className="mt-2 space-y-0.5">
                          {loc.stocks.map(s => (
                            <p key={s.id} className="text-xs text-gray-500">
                              {s.product.name} : <strong className="text-gray-700">{s.quantity}</strong> unités
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-1 shrink-0 ml-2">
                      <button onClick={() => openStockModal(loc)}
                        className="p-1.5 text-indigo-400 hover:text-indigo-600 transition-colors" title="Gérer le stock">
                        <Package size={15} />
                      </button>
                      {loc.type === 'OWN' && (
                        <button onClick={() => handleDeleteLocation(loc.id)} className="p-1.5 text-gray-300 hover:text-red-400 transition-colors">
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {locations.length === 0 && (
                <p className="col-span-2 text-center py-8 text-gray-400 text-sm">Aucun emplacement.</p>
              )}
            </div>
          </div>
        )}

        {/* ── PARTENAIRES ── */}
        {!loading && tab === 'partners' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <p className="text-sm text-gray-500">{partners.length} partenaire{partners.length !== 1 ? 's' : ''}</p>
              <button onClick={() => setShowPartnerModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors">
                <Plus size={15} /> Ajouter
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {partners.map(p => (
                <div key={p.id} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <p className="font-bold text-gray-900">{p.name}</p>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${p.type === 'COMPANY' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'}`}>
                          {p.type === 'COMPANY' ? 'Entreprise' : 'Indépendant'}
                        </span>
                      </div>

                      {/* Phone inline edit */}
                      {editPhoneId === p.id ? (
                        <div className="flex gap-1.5 mt-1">
                          <input
                            type="tel" value={editPhoneVal}
                            onChange={e => setEditPhoneVal(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') savePartnerPhone(p.id); if (e.key === 'Escape') setEditPhoneId(null); }}
                            autoFocus
                            placeholder="+243..."
                            className="flex-1 border border-indigo-300 rounded-lg px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-indigo-400"
                          />
                          <button onClick={() => savePartnerPhone(p.id)} className="p-1.5 bg-green-500 text-white rounded-lg hover:bg-green-600">
                            <Check size={13} />
                          </button>
                          <button onClick={() => setEditPhoneId(null)} className="p-1.5 bg-gray-200 text-gray-600 rounded-lg hover:bg-gray-300">
                            <X size={13} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <p className="text-sm text-gray-500">{p.phone ?? <span className="text-gray-300 italic text-xs">Aucun numéro WA</span>}</p>
                          <button onClick={() => { setEditPhoneId(p.id); setEditPhoneVal(p.phone ?? ''); }}
                            className="p-0.5 text-gray-300 hover:text-indigo-500 transition-colors" title="Modifier le numéro WhatsApp">
                            <Edit2 size={11} />
                          </button>
                        </div>
                      )}

                      {/* WA Group picker */}
                      {groupPickerId === p.id ? (
                        <div className="mt-2 space-y-1.5">
                          <label className="block text-[10px] font-semibold text-gray-400">Groupe WhatsApp</label>
                          {waGroupsLoading ? (
                            <p className="text-xs text-gray-400">Chargement des groupes...</p>
                          ) : (
                            <select value={selectedGroupId}
                              onChange={e => setSelectedGroupId(e.target.value)}
                              className="w-full border border-indigo-300 rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-indigo-400 bg-white">
                              <option value="">— Aucun groupe (envoyer au numéro)</option>
                              {waGroups.map(g => (
                                <option key={g.id} value={g.id}>{g.name} ({g.participants} membres)</option>
                              ))}
                            </select>
                          )}
                          <div className="flex gap-1.5">
                            <button onClick={() => savePartnerGroup(p.id)}
                              className="flex-1 py-1 bg-green-500 text-white rounded-lg text-xs font-semibold hover:bg-green-600">
                              Enregistrer
                            </button>
                            <button onClick={() => setGroupPickerId(null)}
                              className="py-1 px-2 bg-gray-100 text-gray-600 rounded-lg text-xs hover:bg-gray-200">
                              Annuler
                            </button>
                          </div>
                        </div>
                      ) : p.whatsappGroupId ? (
                        <div className="flex items-center gap-1 mt-1">
                          <p className="text-xs text-green-600">📢 Groupe WA configuré</p>
                          <button onClick={() => openGroupPicker(p)} className="p-0.5 text-gray-300 hover:text-indigo-500">
                            <Edit2 size={10} />
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => openGroupPicker(p)}
                          className="mt-1 text-xs text-gray-400 hover:text-indigo-500 flex items-center gap-1">
                          <MessageCircle size={10} /> Configurer groupe WA
                        </button>
                      )}

                      {p.city && <p className="text-xs text-gray-400 mt-1">{p.city}</p>}
                      {p.location && (
                        <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                          <MapPin size={10} /> {p.location.name}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col gap-1 shrink-0 ml-2">
                      <button onClick={() => openReport(p)}
                        className="p-1.5 text-amber-400 hover:text-amber-600 transition-colors" title="Rapport">
                        <BarChart2 size={15} />
                      </button>
                      <button onClick={() => copyPartnerLink(p)}
                        className="p-1.5 text-indigo-400 hover:text-indigo-600 transition-colors" title="Copier lien portail">
                        <Link size={15} />
                      </button>
                      <button onClick={() => handleDeletePartner(p.id)} className="p-1.5 text-gray-300 hover:text-red-400 transition-colors">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                  {copiedId === p.id && (
                    <p className="text-xs text-green-600 mt-2 font-medium">✓ Lien portail copié !</p>
                  )}
                </div>
              ))}
              {partners.length === 0 && (
                <p className="col-span-2 text-center py-8 text-gray-400 text-sm">Aucun partenaire de livraison.</p>
              )}
            </div>
          </div>
        )}

        {/* ── COMMANDES ── */}
        {!loading && tab === 'orders' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <p className="text-sm text-gray-500">{orders.length} commande{orders.length !== 1 ? 's' : ''}</p>
              <button onClick={() => setShowOrderModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors">
                <Plus size={15} /> Nouvelle commande
              </button>
            </div>
            <div className="space-y-3">
              {orders.map(o => {
                const st = STATUS_LABELS[o.status] ?? STATUS_LABELS.pending;
                return (
                  <div key={o.id} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        {/* Header */}
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-black text-indigo-600 text-sm">{orderNum(o.orderNumber)}</span>
                          <p className="font-bold text-gray-900">{o.customerName}</p>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
                        </div>
                        <p className="text-xs text-gray-400 mb-1">
                          {new Date(o.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </p>
                        <p className="text-sm text-gray-600">{o.city} — {o.address}</p>
                        {o.customerPhone && <p className="text-xs text-gray-400">{o.customerPhone}</p>}

                        {/* Scheduled delivery */}
                        {o.scheduledAt && (
                          <p className="text-xs text-indigo-600 mt-1 flex items-center gap-1">
                            <Calendar size={10} /> Livraison prévue : {fmtDateTime(o.scheduledAt)}
                          </p>
                        )}

                        {/* Products with images */}
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
                                <span className="text-gray-400"> @ ${Number(item.unitPrice).toLocaleString('fr-FR')}</span>
                              </p>
                            </div>
                          ))}
                        </div>

                        <div className="flex items-center gap-3 mt-2 text-xs flex-wrap">
                          <span className="font-bold text-gray-900" title="Montant produits">${Number(o.totalAmount).toLocaleString('fr-FR')}</span>
                          <span className="text-gray-400">+</span>
                          <span className="text-amber-600 font-semibold" title="Frais de livraison — appartient au partenaire">{Number(o.deliveryFee).toLocaleString('fr-FR')} FC <span className="font-normal text-amber-500">(livraison)</span></span>
                          {o.partner && <span className="text-gray-500">via {o.partner.name}</span>}
                          {o.location && <span className="text-gray-500">📦 {o.location.name}</span>}
                          {o.deliveryPersonName && <span className="text-green-600">👤 {o.deliveryPersonName}</span>}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex flex-col gap-1.5 shrink-0">
                        {o.status === 'pending' && (
                          <button onClick={() => handleStatusChange(o.id, 'dispatched')}
                            className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-semibold hover:bg-blue-100">
                            <ChevronRight size={12} /> Assigner au partenaire
                          </button>
                        )}
                        {o.status === 'dispatched' && (
                          <>
                            <button onClick={() => { setDeliverModal({ orderId: o.id }); setDeliveryPersonName(''); }}
                              className="flex items-center gap-1 px-2.5 py-1.5 bg-green-50 text-green-700 rounded-lg text-xs font-semibold hover:bg-green-100">
                              <ChevronRight size={12} /> Livré
                            </button>
                            <button onClick={() => handleStatusChange(o.id, 'pending')}
                              className="px-2.5 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs font-semibold hover:bg-gray-200">
                              Désassigner
                            </button>
                          </>
                        )}
                        {(o.status === 'pending' || o.status === 'dispatched') && (
                          <>
                            <button onClick={() => handleStatusChange(o.id, 'returned')}
                              className="px-2.5 py-1.5 bg-orange-50 text-orange-700 rounded-lg text-xs font-semibold hover:bg-orange-100">
                              Retourné
                            </button>
                            <button onClick={() => handleStatusChange(o.id, 'cancelled')}
                              className="px-2.5 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-semibold hover:bg-red-100">
                              Annuler
                            </button>
                          </>
                        )}
                        <button onClick={() => handleDeleteOrder(o.id)} className="p-1.5 text-gray-300 hover:text-red-400 self-end">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
              {orders.length === 0 && (
                <p className="text-center py-8 text-gray-400 text-sm">Aucune commande manuelle.</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── MODAL EMPLACEMENT ── */}
      {showLocModal && (
        <Modal title="Nouvel emplacement" onClose={() => setShowLocModal(false)}>
          <Field label="Nom *" value={locForm.name} onChange={v => setLocForm(f => ({ ...f, name: v }))} placeholder="ex: Entrepôt Lubumbashi" />
          <CitySelect value={locForm.city} onChange={v => setLocForm(f => ({ ...f, city: v }))} required />
          <Field label="Adresse" value={locForm.address} onChange={v => setLocForm(f => ({ ...f, address: v }))} placeholder="Adresse précise (optionnel)" />
          <ModalFooter onClose={() => setShowLocModal(false)} onConfirm={handleCreateLocation} loading={submitting} label="Créer" />
        </Modal>
      )}

      {/* ── MODAL PARTENAIRE ── */}
      {showPartnerModal && (
        <Modal title="Nouveau partenaire" onClose={() => setShowPartnerModal(false)}>
          <Field label="Nom *" value={partnerForm.name} onChange={v => setPartnerForm(f => ({ ...f, name: v }))} placeholder="ex: Manyo's Service" />
          <Field label="Numéro WhatsApp" value={partnerForm.phone} onChange={v => setPartnerForm(f => ({ ...f, phone: v }))} placeholder="+243..." />
          <CitySelect value={partnerForm.city} onChange={v => setPartnerForm(f => ({ ...f, city: v }))} />
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Type</label>
            <select value={partnerForm.type} onChange={e => setPartnerForm(f => ({ ...f, type: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-400 bg-white">
              <option value="COMPANY">Entreprise</option>
              <option value="INDEPENDENT">Livreur indépendant</option>
            </select>
          </div>
          <p className="text-xs text-gray-400">Un emplacement de stock lié sera créé automatiquement.</p>
          <ModalFooter onClose={() => setShowPartnerModal(false)} onConfirm={handleCreatePartner} loading={submitting} label="Créer" />
        </Modal>
      )}

      {/* ── MODAL COMMANDE ── */}
      {showOrderModal && (
        <Modal title="Nouvelle commande" onClose={() => { setShowOrderModal(false); resetOrderForm(); }} wide>
          <div className="space-y-4">
            {/* Produits */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-2">Produits *</label>
              {orderItems.map((item, idx) => {
                const prod = products.find(p => p.id === item.productId);
                return (
                  <div key={idx} className="flex gap-2 mb-2 items-center">
                    {prod?.imageUrl ? (
                      <img src={prod.imageUrl} alt={prod.name} className="w-8 h-8 rounded-lg object-cover border border-gray-100 shrink-0" />
                    ) : (
                      <div className="w-8 h-8 rounded-lg bg-gray-100 shrink-0" />
                    )}
                    <select value={item.productId}
                      onChange={e => {
                        const p = products.find(pr => pr.id === e.target.value);
                        setOrderItems(items => items.map((it, i) => i === idx
                          ? { ...it, productId: e.target.value, unitPrice: p ? String(p.sellingPrice) : it.unitPrice }
                          : it));
                      }}
                      className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400 bg-white">
                      <option value="">— Produit</option>
                      {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <input type="number" min="1" value={item.quantity} placeholder="Qté"
                      onChange={e => setOrderItems(items => items.map((it, i) => i === idx ? { ...it, quantity: e.target.value } : it))}
                      className="w-16 border border-gray-200 rounded-xl px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400 text-center" />
                    <div className="relative">
                      <input type="number" min="0" value={item.unitPrice} placeholder="Prix"
                        onChange={e => setOrderItems(items => items.map((it, i) => i === idx ? { ...it, unitPrice: e.target.value } : it))}
                        className="w-24 border border-gray-200 rounded-xl pl-2 pr-6 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400" />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-bold">$</span>
                    </div>
                    {orderItems.length > 1 && (
                      <button onClick={() => setOrderItems(items => items.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-600">
                        <X size={16} />
                      </button>
                    )}
                  </div>
                );
              })}
              <button onClick={() => setOrderItems(items => [...items, { productId: '', quantity: '1', unitPrice: '' }])}
                className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 font-semibold mt-1">
                <Plus size={12} /> Ajouter un produit
              </button>
            </div>

            {/* Client */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nom client *" value={orderForm.customerName} onChange={v => setOrderForm(f => ({ ...f, customerName: v }))} placeholder="Nom complet" />
              <Field label="Téléphone" value={orderForm.customerPhone} onChange={v => setOrderForm(f => ({ ...f, customerPhone: v }))} placeholder="+243..." />
            </div>

            {/* Ville + Livraison */}
            <div className="grid grid-cols-2 gap-3">
              <CitySelect value={orderForm.city} onChange={v => setOrderForm(f => ({ ...f, city: v }))} required />
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Frais de livraison</label>
                <div className="relative">
                  <input type="number" min="0" value={orderForm.deliveryFee} placeholder="0"
                    onChange={e => setOrderForm(f => ({ ...f, deliveryFee: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl pl-3 pr-8 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-400" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 font-bold">FC</span>
                </div>
              </div>
            </div>

            <Field label="Adresse précise *" value={orderForm.address} onChange={v => setOrderForm(f => ({ ...f, address: v }))} placeholder="Quartier, avenue, référence..." />

            {/* Date de livraison prévue */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1 flex items-center gap-1">
                <Calendar size={11} /> Date et heure de livraison prévue
              </label>
              <input
                type="datetime-local"
                value={orderForm.scheduledAt}
                onChange={e => setOrderForm(f => ({ ...f, scheduledAt: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
              />
            </div>

            <Field label="Notes" value={orderForm.notes} onChange={v => setOrderForm(f => ({ ...f, notes: v }))} placeholder="Instructions spéciales..." />

            {/* Stock + Livreur */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Stock source</label>
                <select value={orderForm.locationId} onChange={e => setOrderForm(f => ({ ...f, locationId: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-400 bg-white">
                  <option value="">— Choisir</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.name} ({l.city})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Livreur</label>
                <select value={orderForm.partnerId} onChange={e => setOrderForm(f => ({ ...f, partnerId: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-400 bg-white">
                  <option value="">— Choisir</option>
                  {partners.map(p => <option key={p.id} value={p.id}>{p.name}{p.phone ? ` (${p.phone})` : ''}</option>)}
                </select>
              </div>
            </div>
          </div>
          <ModalFooter onClose={() => { setShowOrderModal(false); resetOrderForm(); }} onConfirm={handleCreateOrder} loading={submitting} label="Créer la commande" />
        </Modal>
      )}

      {/* ── MODAL STOCK EMPLACEMENT ── */}
      {stockModal && (
        <Modal title={`Stock — ${stockModal.name}`} onClose={() => setStockModal(null)}>
          {stockLoading ? (
            <p className="text-sm text-gray-400 text-center py-4">Chargement...</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {products.filter(p => p.trackStock).map(p => (
                <div key={p.id} className="flex items-center gap-3">
                  <span className="flex-1 text-sm text-gray-700 truncate">{p.name}</span>
                  <input type="number" min="0"
                    value={stockAllocations[p.id] ?? ''}
                    onChange={e => setStockAllocations(m => ({ ...m, [p.id]: e.target.value }))}
                    placeholder="0"
                    className="w-24 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400 text-right" />
                </div>
              ))}
              {products.filter(p => p.trackStock).length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">Aucun produit tracké.</p>
              )}
            </div>
          )}
          <ModalFooter onClose={() => setStockModal(null)} onConfirm={handleSaveStock} loading={submitting} label="Enregistrer" />
        </Modal>
      )}

      {/* ── MODAL LIVRAISON CONFIRMÉE ── */}
      {deliverModal && (
        <Modal title="Confirmer la livraison" onClose={() => setDeliverModal(null)}>
          <p className="text-sm text-gray-600">Nom du livreur qui a effectué la livraison (optionnel).</p>
          <Field label="Nom du livreur" value={deliveryPersonName} onChange={setDeliveryPersonName} placeholder="ex: Jean-Paul" />
          <ModalFooter onClose={() => setDeliverModal(null)} onConfirm={confirmDelivered} loading={submitting} label="Confirmer livré" />
        </Modal>
      )}

      {/* ── MODAL RAPPORT ── */}
      {reportModal && (
        <Modal title={`Rapport — ${reportModal.name}`} onClose={() => { setReportModal(null); setReportData(null); }} wide>
          <div className="flex gap-2 mb-4 flex-wrap">
            {(['daily', 'weekly', 'monthly'] as const).map(p => (
              <button key={p} onClick={() => changeReportPeriod(p)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors
                  ${reportPeriod === p ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {p === 'daily' ? 'Journalier' : p === 'weekly' ? 'Hebdomadaire' : 'Mensuel'}
              </button>
            ))}
            <button onClick={() => window.print()} className="ml-auto flex items-center gap-1 px-3 py-1.5 bg-gray-100 text-gray-600 hover:bg-gray-200 rounded-lg text-xs font-semibold">
              <Printer size={12} /> Imprimer
            </button>
          </div>

          {reportLoading && <p className="text-sm text-gray-400 text-center py-6">Chargement...</p>}

          {!reportLoading && reportData && (
            <div className="space-y-5">
              {reportData.locationStock.length > 0 && (
                <div>
                  <h3 className="text-sm font-bold text-gray-700 mb-2">Stock emplacement partenaire</h3>
                  <div className="bg-gray-50 rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead><tr className="text-xs text-gray-500 border-b border-gray-200">
                        <th className="text-left px-3 py-2">Produit</th>
                        <th className="text-right px-3 py-2">Quantité</th>
                      </tr></thead>
                      <tbody>
                        {reportData.locationStock.map(s => (
                          <tr key={s.id} className="border-b border-gray-100 last:border-0">
                            <td className="px-3 py-2 text-gray-700">{s.product.name}</td>
                            <td className="px-3 py-2 text-right font-semibold">{s.quantity}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div>
                <h3 className="text-sm font-bold text-gray-700 mb-2">
                  Commandes — {reportData.totalOrders} total
                  <span className="ml-2 text-xs text-gray-400 font-normal">
                    ({new Date(reportData.from).toLocaleDateString('fr-FR')} → {new Date(reportData.to).toLocaleDateString('fr-FR')})
                  </span>
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {Object.entries(STATUS_LABELS).map(([key, { label, color }]) => (
                    <div key={key} className="bg-gray-50 rounded-xl p-3 text-center">
                      <p className="text-2xl font-black text-gray-900">{reportData.ordersByStatus[key] ?? 0}</p>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${color}`}>{label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {reportData.orders.length > 0 && (
                <div>
                  <h3 className="text-sm font-bold text-gray-700 mb-2">Détail des commandes</h3>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {reportData.orders.map(o => {
                      const st = STATUS_LABELS[o.status] ?? STATUS_LABELS.pending;
                      return (
                        <div key={o.id} className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2 text-sm">
                          <span className="font-bold text-indigo-600 text-xs">{orderNum(o.orderNumber)}</span>
                          <span className="flex-1 text-gray-700 truncate">{o.customerName} — {o.city}</span>
                          <span className="text-gray-900 font-semibold">${Number(o.totalAmount).toLocaleString('fr-FR')}</span>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="pt-2">
            <button onClick={() => { setReportModal(null); setReportData(null); }}
              className="w-full py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50">
              Fermer
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Helpers UI ──────────────────────────────────────────────────────────────

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className={`bg-white rounded-2xl shadow-2xl w-full ${wide ? 'max-w-2xl' : 'max-w-md'} max-h-[90vh] flex flex-col`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100"><X size={18} className="text-gray-500" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-3">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-400" />
    </div>
  );
}

function ModalFooter({ onClose, onConfirm, loading, label }: { onClose: () => void; onConfirm: () => void; loading: boolean; label: string }) {
  return (
    <div className="flex gap-2 pt-2">
      <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50">Annuler</button>
      <button onClick={onConfirm} disabled={loading}
        className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
        {loading ? '...' : label}
      </button>
    </div>
  );
}
