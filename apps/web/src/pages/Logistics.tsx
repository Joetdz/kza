import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Trash2, MapPin, Truck, ShoppingBag, ChevronRight, X, Package, AlertCircle, MessageCircle, BarChart2, Link, Printer, Edit2, Check, Calendar, DollarSign, FileText, Bell, RefreshCw } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useStore } from '../store/useStore';
import { logisticsApi, type StockLocation, type DeliveryPartner, type ManualOrder, type PartnerReport, type PartnerPayment, type FollowUpConfig, type FollowUpEntry } from '../api/logistics';
import { ScrollLock } from '../components/ui/ScrollLock';
import { CitySelect } from '../components/CitySelect';

const ADMIN_EMAILS = (import.meta.env.VITE_ADMIN_EMAILS ?? '')
  .split(',').map((e: string) => e.trim().toLowerCase()).filter(Boolean);

const CITY_COMMUNES: Record<string, string[]> = {
  'Kinshasa': [
    'Bandalungwa','Barumbu','Bumbu','Gombe','Kalamu','Kasa-Vubu','Kimbanseke',
    'Kinshasa','Kintambo','Kisenso','Lemba','Limete','Lingwala','Makala',
    'Maluku','Masina','Matete','Mont-Ngafula','Ndjili','Ngaba','Ngaliema',
    'Ngiri-Ngiri','Nsele','Selembao',
  ],
  'Lubumbashi': ['Annexe','Industriel','Kampemba','Kamalondo','Katuba','Kenya','Lubumbashi','Rwashi'],
  'Mbuji-Mayi': ['Dibindi','Kanshi','Miabi','Muya'],
  'Kananga':    ['Kananga','Lukonga','Ndesha'],
  'Kisangani':  ['Kabondo','Kisangani','Lubunga','Makiso','Mangobo','Tshopo'],
  'Goma':       ['Goma','Karisimbi'],
  'Bukavu':     ['Ibanda','Kadutu','Bagira'],
  'Kolwezi':    ['Dilala','Manika','Musonoie'],
  'Likasi':     ['Kikula','Likasi','Panda','Shituru'],
  'Butembo':    ['Butembo','Vulamba'],
  'Beni':       ['Beni','Ruwenzori'],
  'Matadi':     ['Matadi','Mvog-ada'],
  'Mbandaka':   ['Mbandaka','Wangata'],
  'Kikwit':     ['Kikwit','Lukemi','Nzinda'],
  'Uvira':      ['Uvira','Kalundu'],
  'Bunia':      ['Bunia','Shari'],
};

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

  const [tab, setTab] = useState<'locations' | 'partners' | 'orders' | 'payments' | 'relance'>('locations');
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [partners, setPartners] = useState<DeliveryPartner[]>([]);
  const [orders, setOrders] = useState<ManualOrder[]>([]);
  const [payments, setPayments] = useState<PartnerPayment[]>([]);
  const [loading, setLoading] = useState(false);

  // Modals
  const [showLocModal, setShowLocModal] = useState(false);
  const [showPartnerModal, setShowPartnerModal] = useState(false);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [stockModal, setStockModal] = useState<StockLocation | null>(null);
  const [reportModal, setReportModal] = useState<DeliveryPartner | null>(null);
  const [deliverModal, setDeliverModal] = useState<{ orderId: string } | null>(null);
  const [deliveryPersonName, setDeliveryPersonName] = useState('');
  const [collectedUsd, setCollectedUsd] = useState('');
  const [collectedCdf, setCollectedCdf] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  // Draft order editing
  const [draftEditId, setDraftEditId] = useState<string | null>(null);
  const [draftEditForm, setDraftEditForm] = useState<Partial<ManualOrder & { items: any[] }>>({});
  const [draftEditItems, setDraftEditItems] = useState<{ productId: string; quantity: string; unitPrice: string }[]>([]);
  const [confirmingDraft, setConfirmingDraft] = useState<string | null>(null);

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
    customerName: '', customerPhone: '', city: '', commune: '', addressDetail: '',
    deliveryFee: '', scheduledAt: '',
  });
  const [orderItems, setOrderItems] = useState<{ productId: string; quantity: string; unitPrice: string }[]>([
    { productId: '', quantity: '1', unitPrice: '' },
  ]);

  // Dispatch modal (partner selection at assignment time)
  const [dispatchModal, setDispatchModal] = useState<{ orderId: string } | null>(null);
  const [dispatchPartnerId, setDispatchPartnerId] = useState('');

  // Reschedule modal
  const [rescheduleModal, setRescheduleModal] = useState<{ orderId: string } | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState('');

  // Stock allocation
  const [stockAllocations, setStockAllocations] = useState<Record<string, string>>({});
  const [stockLoading, setStockLoading] = useState(false);

  // Follow-up
  const [followUpConfig, setFollowUpConfig] = useState<FollowUpConfig | null>(null);
  const [followUpHistory, setFollowUpHistory] = useState<FollowUpEntry[]>([]);
  const [followUpLoading, setFollowUpLoading] = useState(false);
  const [followUpSaving, setFollowUpSaving] = useState(false);
  const [followUpTriggerLoading, setFollowUpTriggerLoading] = useState<'relance' | 'loyalty' | null>(null);
  const [followUpConfigDraft, setFollowUpConfigDraft] = useState<Partial<FollowUpConfig>>({});
  const [followUpPreview, setFollowUpPreview] = useState<{ type: 'relance' | 'loyalty'; orders: ManualOrder[] } | null>(null);
  const [followUpPreviewLoading, setFollowUpPreviewLoading] = useState<'relance' | 'loyalty' | null>(null);

  // Daily report
  const [dailyReportModal, setDailyReportModal] = useState<DeliveryPartner | null>(null);
  const [dailyReportDate, setDailyReportDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dailyReportData, setDailyReportData] = useState<import('../api/logistics').DailyReport | null>(null);
  const [dailyReportLoading, setDailyReportLoading] = useState(false);

  // Report
  const [reportPeriod, setReportPeriod] = useState<'daily' | 'weekly' | 'monthly'>('monthly');
  const [reportData, setReportData] = useState<PartnerReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { if (isAdmin) refresh(); }, [isAdmin]);

  // Auto-refresh + sound when a draft is created from WhatsApp label
  useEffect(() => {
    const playSound = () => {
      try {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.12);
        gain.gain.setValueAtTime(0.4, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.5);
      } catch { /* AudioContext blocked */ }
    };

    const handler = () => {
      playSound();
      refresh();
    };

    window.addEventListener('wa:draft-order-created', handler);
    return () => window.removeEventListener('wa:draft-order-created', handler);
  }, []);

  async function refresh() {
    setLoading(true);
    try {
      const [locs, parts, ords, pays] = await Promise.all([
        logisticsApi.getLocations(),
        logisticsApi.getPartners(),
        logisticsApi.getOrders(),
        logisticsApi.getPayments(),
      ]);
      setLocations(locs);
      setPartners(parts);
      setOrders(ords);
      setPayments(pays);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  // ── Follow-up ────────────────────────────────────────────────────

  async function loadFollowUp() {
    setFollowUpLoading(true);
    try {
      const [cfg, hist] = await Promise.all([
        logisticsApi.getFollowUpConfig(),
        logisticsApi.getFollowUpHistory(100),
      ]);
      setFollowUpConfig(cfg);
      setFollowUpConfigDraft(cfg);
      setFollowUpHistory(hist);
    } catch { /* ignore */ }
    finally { setFollowUpLoading(false); }
  }

  async function saveFollowUpConfig() {
    setFollowUpSaving(true);
    try {
      const updated = await logisticsApi.updateFollowUpConfig(followUpConfigDraft);
      setFollowUpConfig(updated);
      setFollowUpConfigDraft(updated);
    } catch { /* ignore */ }
    finally { setFollowUpSaving(false); }
  }

  async function openFollowUpPreview(type: 'relance' | 'loyalty') {
    setFollowUpPreviewLoading(type);
    try {
      const orders = type === 'relance'
        ? await logisticsApi.previewRelance()
        : await logisticsApi.previewLoyalty();
      setFollowUpPreview({ type, orders });
    } catch { /* ignore */ }
    finally { setFollowUpPreviewLoading(null); }
  }

  async function triggerFollowUp(type: 'relance' | 'loyalty') {
    setFollowUpTriggerLoading(type);
    setFollowUpPreview(null);
    try {
      const res = type === 'relance'
        ? await logisticsApi.triggerRelance()
        : await logisticsApi.triggerLoyalty();
      alert(`${res.sent} message${res.sent !== 1 ? 's' : ''} envoyé${res.sent !== 1 ? 's' : ''}.`);
      setFollowUpHistory(await logisticsApi.getFollowUpHistory(100));
    } catch (e: any) {
      alert(e?.message ?? 'Erreur lors de l\'envoi');
    }
    finally { setFollowUpTriggerLoading(null); }
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
    if (!orderForm.customerName || !orderForm.city || !orderForm.addressDetail || validItems.length === 0) return;
    setSubmitting(true);
    try {
      const address = [orderForm.commune, orderForm.addressDetail].filter(Boolean).join(', ');
      const o = await logisticsApi.createOrder({
        customerName: orderForm.customerName,
        customerPhone: orderForm.customerPhone || undefined,
        city: orderForm.city,
        address,
        deliveryFee: Number(orderForm.deliveryFee) || 0,
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
    setOrderForm({ customerName: '', customerPhone: '', city: '', commune: '', addressDetail: '', deliveryFee: '', scheduledAt: '' });
    setOrderItems([{ productId: '', quantity: '1', unitPrice: '' }]);
  }

  async function handleStatusChange(id: string, status: string, personName?: string) {
    await logisticsApi.updateStatus(id, status, personName);
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status, deliveryPersonName: personName ?? o.deliveryPersonName } : o));
  }

  async function confirmDispatch() {
    if (!dispatchModal || !dispatchPartnerId) return;
    setSubmitting(true);
    try {
      await logisticsApi.updateStatus(dispatchModal.orderId, 'dispatched', undefined, dispatchPartnerId);
      const partner = partners.find(p => p.id === dispatchPartnerId) ?? null;
      setOrders(prev => prev.map(o => o.id === dispatchModal.orderId
        ? { ...o, status: 'dispatched', partnerId: dispatchPartnerId, partner }
        : o));
      setDispatchModal(null);
      setDispatchPartnerId('');
    } catch { /* ignore */ }
    finally { setSubmitting(false); }
  }

  async function confirmReschedule() {
    if (!rescheduleModal) return;
    setSubmitting(true);
    try {
      await logisticsApi.reschedule(rescheduleModal.orderId, rescheduleDate || null);
      setOrders(prev => prev.map(o => o.id === rescheduleModal.orderId
        ? { ...o, scheduledAt: rescheduleDate || null }
        : o));
      setRescheduleModal(null);
      setRescheduleDate('');
    } catch { /* ignore */ }
    finally { setSubmitting(false); }
  }

  async function confirmDelivered() {
    if (!deliverModal) return;
    setSubmitting(true);
    try {
      await logisticsApi.updateStatus(
        deliverModal.orderId, 'delivered',
        deliveryPersonName || undefined, undefined,
        collectedUsd ? Number(collectedUsd) : undefined,
        collectedCdf ? Number(collectedCdf) : undefined,
      );
      setOrders(prev => prev.map(o => o.id === deliverModal.orderId
        ? { ...o, status: 'delivered', deliveryPersonName: deliveryPersonName || o.deliveryPersonName }
        : o));
      setDeliverModal(null);
      setDeliveryPersonName('');
      setCollectedUsd('');
      setCollectedCdf('');
    } finally { setSubmitting(false); }
  }

  async function openDailyReport(partner: DeliveryPartner) {
    setDailyReportModal(partner);
    setDailyReportData(null);
    setDailyReportLoading(true);
    try { setDailyReportData(await logisticsApi.getDailyReport(partner.id, dailyReportDate)); }
    catch { /* ignore */ }
    finally { setDailyReportLoading(false); }
  }

  async function changeDailyReportDate(date: string) {
    setDailyReportDate(date);
    if (!dailyReportModal) return;
    setDailyReportLoading(true);
    try { setDailyReportData(await logisticsApi.getDailyReport(dailyReportModal.id, date)); }
    catch { /* ignore */ }
    finally { setDailyReportLoading(false); }
  }

  async function handleDeleteOrder(id: string) {
    if (!confirm('Supprimer cette commande ?')) return;
    await logisticsApi.deleteOrder(id);
    setOrders(prev => prev.filter(o => o.id !== id));
  }

  async function handleConfirmDraft(id: string) {
    if (!confirm('Confirmer ce brouillon ? Le stock sera décrémenté.')) return;
    setConfirmingDraft(id);
    try {
      const confirmed = await logisticsApi.confirmDraft(id);
      setOrders(prev => prev.map(o => o.id === id ? confirmed : o));
      setDraftEditId(null);
    } catch (e: any) {
      alert('Erreur : ' + (e?.message ?? 'Impossible de confirmer'));
    } finally {
      setConfirmingDraft(null);
    }
  }

  async function handleSaveDraftEdit(id: string) {
    try {
      const validItems = draftEditItems
        .filter(i => i.productId)
        .map(i => ({ productId: i.productId, quantity: Number(i.quantity) || 1, unitPrice: Number(i.unitPrice) || 0 }));
      const updated = await logisticsApi.editDraft(id, {
        customerName: draftEditForm.customerName,
        customerPhone: draftEditForm.customerPhone ?? undefined,
        city: draftEditForm.city,
        address: draftEditForm.address,
        deliveryFee: draftEditForm.deliveryFee !== undefined ? Number(draftEditForm.deliveryFee) : undefined,
        notes: draftEditForm.notes ?? undefined,
        items: validItems.length > 0 ? validItems : undefined,
      });
      setOrders(prev => prev.map(o => o.id === id ? updated : o));
      setDraftEditId(null);
    } catch (e: any) {
      alert('Erreur : ' + (e?.message ?? 'Impossible de sauvegarder'));
    }
  }

  // ── Payments ─────────────────────────────────────────────────────

  async function handleConfirmPayment(id: string) {
    try {
      const updated = await logisticsApi.confirmPayment(id);
      setPayments(prev => prev.map(p => p.id === id ? updated : p));
    } catch { /* ignore */ }
  }

  async function handleRejectPayment(id: string) {
    try {
      const updated = await logisticsApi.rejectPayment(id);
      setPayments(prev => prev.map(p => p.id === id ? updated : p));
    } catch { /* ignore */ }
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

  const pendingPaymentsCount = payments.filter(p => p.status === 'pending').length;

  const tabs = [
    { id: 'locations', label: 'Emplacements', icon: MapPin },
    { id: 'partners',  label: 'Partenaires',  icon: Truck },
    { id: 'orders',    label: 'Commandes',    icon: ShoppingBag },
    { id: 'payments',  label: 'Versements',   icon: DollarSign, badge: pendingPaymentsCount },
    { id: 'relance',   label: 'Relance',      icon: Bell },
  ] as const;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-black text-gray-900 mb-6">Logistique</h1>

        <div className="flex gap-1 bg-gray-100 p-1 rounded-2xl mb-6 w-fit flex-wrap">
          {tabs.map(({ id, label, icon: Icon, ...rest }) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all
                ${tab === id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              <Icon size={15} />{label}
              {'badge' in rest && (rest as any).badge > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500 text-white">
                  {(rest as any).badge}
                </span>
              )}
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
                      <button onClick={() => openDailyReport(p)}
                        className="p-1.5 text-indigo-400 hover:text-indigo-600 transition-colors" title="Rapport journalier">
                        <FileText size={15} />
                      </button>
                      <button onClick={() => openReport(p)}
                        className="p-1.5 text-amber-400 hover:text-amber-600 transition-colors" title="Rapport période">
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
              <p className="text-sm text-gray-500">{orders.filter(o => !o.isDraft).length} commande{orders.filter(o => !o.isDraft).length !== 1 ? 's' : ''}{orders.filter(o => o.isDraft).length > 0 && <span className="ml-2 px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-semibold">{orders.filter(o => o.isDraft).length} brouillon{orders.filter(o => o.isDraft).length !== 1 ? 's' : ''}</span>}</p>
              <button onClick={() => setShowOrderModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors">
                <Plus size={15} /> Nouvelle commande
              </button>
            </div>
            <div className="space-y-3">
              {orders.map(o => {
                const st = STATUS_LABELS[o.status] ?? STATUS_LABELS.pending;
                return (
                  <div key={o.id} className={`bg-white rounded-2xl p-4 border shadow-sm ${o.isDraft ? 'border-amber-200 bg-amber-50/30' : 'border-gray-100'}`}>
                    {/* Draft editing form */}
                    {o.isDraft && draftEditId === o.id ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Brouillon IA — Édition</span>
                          <span className="font-black text-indigo-600 text-sm">{orderNum(o.orderNumber)}</span>
                        </div>

                        {/* Produits */}
                        <div>
                          <p className="text-[10px] text-gray-400 mb-1.5 font-semibold">Produits *</p>
                          {draftEditItems.map((item, idx) => {
                            const prod = products.find(p => p.id === item.productId);
                            return (
                              <div key={idx} className="flex gap-1.5 mb-1.5 items-center">
                                {prod?.imageUrl
                                  ? <img src={prod.imageUrl} alt={prod.name} className="w-7 h-7 rounded-lg object-cover border border-gray-100 shrink-0" />
                                  : <div className="w-7 h-7 rounded-lg bg-gray-100 shrink-0" />}
                                <select value={item.productId}
                                  onChange={e => {
                                    const p = products.find(pr => pr.id === e.target.value);
                                    setDraftEditItems(items => items.map((it, i) => i === idx
                                      ? { ...it, productId: e.target.value, unitPrice: p ? String(p.sellingPrice) : it.unitPrice }
                                      : it));
                                  }}
                                  className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-indigo-400 bg-white">
                                  <option value="">— Produit</option>
                                  {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                                <input type="number" min="1" value={item.quantity} placeholder="Qté"
                                  onChange={e => setDraftEditItems(items => items.map((it, i) => i === idx ? { ...it, quantity: e.target.value } : it))}
                                  className="w-12 border border-gray-200 rounded-lg px-1.5 py-1.5 text-xs outline-none text-center" />
                                <div className="relative">
                                  <input type="number" min="0" value={item.unitPrice} placeholder="Prix"
                                    onChange={e => setDraftEditItems(items => items.map((it, i) => i === idx ? { ...it, unitPrice: e.target.value } : it))}
                                    className="w-16 border border-gray-200 rounded-lg pl-1.5 pr-5 py-1.5 text-xs outline-none" />
                                  <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 font-bold">$</span>
                                </div>
                                {draftEditItems.length > 1 && (
                                  <button onClick={() => setDraftEditItems(items => items.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-600">
                                    <X size={13} />
                                  </button>
                                )}
                              </div>
                            );
                          })}
                          <button onClick={() => setDraftEditItems(items => [...items, { productId: '', quantity: '1', unitPrice: '' }])}
                            className="flex items-center gap-1 text-[11px] text-indigo-600 font-semibold mt-0.5 hover:text-indigo-700">
                            <Plus size={11} /> Ajouter un produit
                          </button>
                        </div>

                        {/* Champs client */}
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            { label: 'Nom client', key: 'customerName' as const },
                            { label: 'Téléphone', key: 'customerPhone' as const },
                            { label: 'Ville', key: 'city' as const },
                            { label: 'Adresse complète', key: 'address' as const },
                          ].map(({ label, key }) => (
                            <div key={key} className={key === 'address' ? 'col-span-2' : ''}>
                              <p className="text-[10px] text-gray-400 mb-1">{label}</p>
                              <input
                                value={(draftEditForm[key] as string) ?? ''}
                                onChange={e => setDraftEditForm(f => ({ ...f, [key]: e.target.value }))}
                                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-indigo-400"
                              />
                            </div>
                          ))}
                          <div>
                            <p className="text-[10px] text-gray-400 mb-1">Livraison (FC)</p>
                            <input
                              type="number" value={(draftEditForm.deliveryFee as number) ?? 0}
                              onChange={e => setDraftEditForm(f => ({ ...f, deliveryFee: Number(e.target.value) }))}
                              className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-indigo-400"
                            />
                          </div>
                          <div>
                            <p className="text-[10px] text-gray-400 mb-1">Notes</p>
                            <input
                              value={(draftEditForm.notes as string) ?? ''}
                              onChange={e => setDraftEditForm(f => ({ ...f, notes: e.target.value }))}
                              className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-indigo-400"
                            />
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <button onClick={() => handleSaveDraftEdit(o.id)} className="flex-1 py-2 bg-indigo-600 text-white rounded-xl text-xs font-semibold hover:bg-indigo-700">Sauvegarder</button>
                          <button onClick={() => setDraftEditId(null)} className="px-3 py-2 bg-gray-100 text-gray-600 rounded-xl text-xs font-semibold hover:bg-gray-200">Annuler</button>
                        </div>
                        <button
                          onClick={() => handleConfirmDraft(o.id)}
                          disabled={confirmingDraft === o.id}
                          className="w-full py-2 bg-green-600 text-white rounded-xl text-xs font-bold hover:bg-green-700 disabled:opacity-60 flex items-center justify-center gap-2">
                          {confirmingDraft === o.id ? <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />Confirmation…</> : '✓ Confirmer la commande'}
                        </button>
                      </div>
                    ) : (
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        {/* Header */}
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-black text-indigo-600 text-sm">{orderNum(o.orderNumber)}</span>
                          <p className="font-bold text-gray-900">{o.customerName}</p>
                          {o.isDraft
                            ? <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Brouillon IA</span>
                            : <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
                          }
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
                        {/* Draft-specific actions */}
                        {o.isDraft && (
                          <>
                            <button
                              onClick={() => {
                                setDraftEditId(o.id);
                                setDraftEditForm({ customerName: o.customerName, customerPhone: o.customerPhone ?? '', city: o.city, address: o.address, deliveryFee: Number(o.deliveryFee), notes: o.notes ?? '' });
                                setDraftEditItems(o.items.length > 0
                                  ? o.items.map((i: any) => ({ productId: i.product?.id ?? i.productId ?? '', quantity: String(i.quantity), unitPrice: String(i.unitPrice) }))
                                  : [{ productId: '', quantity: '1', unitPrice: '' }]);
                              }}
                              className="flex items-center gap-1 px-2.5 py-1.5 bg-amber-50 text-amber-700 rounded-lg text-xs font-semibold hover:bg-amber-100">
                              <Edit2 size={12} /> Modifier
                            </button>
                            <button
                              onClick={() => handleConfirmDraft(o.id)}
                              disabled={confirmingDraft === o.id}
                              className="flex items-center gap-1 px-2.5 py-1.5 bg-green-50 text-green-700 rounded-lg text-xs font-semibold hover:bg-green-100 disabled:opacity-60">
                              {confirmingDraft === o.id ? <span className="w-3 h-3 border-2 border-green-700/30 border-t-green-700 rounded-full animate-spin" /> : <Check size={12} />}
                              Confirmer
                            </button>
                          </>
                        )}
                        {!o.isDraft && o.status === 'pending' && (
                          <button onClick={() => { setDispatchModal({ orderId: o.id }); setDispatchPartnerId(o.partner?.id ?? ''); }}
                            className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-semibold hover:bg-blue-100">
                            <ChevronRight size={12} /> Assigner
                          </button>
                        )}
                        {!o.isDraft && o.status === 'dispatched' && (
                          <>
                            <button onClick={() => { setDeliverModal({ orderId: o.id }); setDeliveryPersonName(''); }}
                              className="flex items-center gap-1 px-2.5 py-1.5 bg-green-50 text-green-700 rounded-lg text-xs font-semibold hover:bg-green-100">
                              <ChevronRight size={12} /> Livré
                            </button>
                            <button onClick={() => { setRescheduleModal({ orderId: o.id }); setRescheduleDate(o.scheduledAt ? o.scheduledAt.slice(0,16) : ''); }}
                              className="flex items-center gap-1 px-2.5 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-semibold hover:bg-indigo-100">
                              <Calendar size={12} /> Reporter
                            </button>
                            <button onClick={() => handleStatusChange(o.id, 'pending')}
                              className="px-2.5 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs font-semibold hover:bg-gray-200">
                              Désassigner
                            </button>
                          </>
                        )}
                        {!o.isDraft && (o.status === 'pending' || o.status === 'dispatched') && (
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
                    )}
                  </div>
                );
              })}
              {orders.length === 0 && (
                <p className="text-center py-8 text-gray-400 text-sm">Aucune commande manuelle.</p>
              )}
            </div>
          </div>
        )}
        {/* ── VERSEMENTS ── */}
        {!loading && tab === 'payments' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-gray-500">
                {pendingPaymentsCount} en attente · {payments.length} au total
              </p>
            </div>
            {payments.length === 0 ? (
              <p className="text-center py-8 text-gray-400 text-sm">Aucun versement déclaré.</p>
            ) : (
              <div className="space-y-3">
                {payments.map(pay => {
                  const badgeClass = pay.status === 'confirmed'
                    ? 'bg-green-100 text-green-700'
                    : pay.status === 'rejected'
                    ? 'bg-red-100 text-red-600'
                    : 'bg-amber-100 text-amber-700';
                  const badgeLabel = pay.status === 'confirmed' ? 'Confirmé' : pay.status === 'rejected' ? 'Rejeté' : 'En attente';

                  return (
                    <div key={pay.id} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badgeClass}`}>{badgeLabel}</span>
                            <span className="font-black text-gray-900 text-sm">
                              {Number(pay.amount).toLocaleString('fr-FR')} {pay.currency}
                            </span>
                          </div>
                          {pay.partner && (
                            <p className="text-sm text-gray-600 font-medium">{pay.partner.name}{pay.partner.city ? ` · ${pay.partner.city}` : ''}</p>
                          )}
                          <p className="text-xs text-gray-400 mt-0.5">
                            {new Date(pay.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </p>
                          {pay.notes && <p className="text-xs text-gray-500 mt-1">{pay.notes}</p>}
                          {pay.proofUrl && (
                            <a href={pay.proofUrl} target="_blank" rel="noopener noreferrer"
                              className="text-xs text-indigo-600 hover:underline mt-1 inline-block">
                              Voir la preuve
                            </a>
                          )}
                        </div>
                        {pay.status === 'pending' && (
                          <div className="flex flex-col gap-1.5 shrink-0">
                            <button onClick={() => handleConfirmPayment(pay.id)}
                              className="flex items-center gap-1 px-3 py-1.5 bg-green-50 text-green-700 rounded-lg text-xs font-semibold hover:bg-green-100">
                              <Check size={12} /> Confirmer
                            </button>
                            <button onClick={() => handleRejectPayment(pay.id)}
                              className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-semibold hover:bg-red-100">
                              Rejeter
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
        {/* ── RELANCE ── */}
        {tab === 'relance' && (() => {
          if (!followUpConfig && !followUpLoading) {
            loadFollowUp();
            return <div className="text-center py-12 text-gray-400 text-sm">Chargement...</div>;
          }
          if (followUpLoading) return <div className="text-center py-12 text-gray-400 text-sm">Chargement...</div>;

          const cfg = followUpConfigDraft;
          return (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500">Envois automatiques WhatsApp aux clients</p>
                <button onClick={loadFollowUp} className="p-2 text-gray-400 hover:text-gray-600 transition-colors" title="Actualiser">
                  <RefreshCw size={15} />
                </button>
              </div>

              {/* ── Relance non-livrées ── */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-gray-900">Relance commandes non livrées</h3>
                    <p className="text-xs text-gray-400 mt-0.5">Envoyé aux clients dont la commande est encore en attente ou assignée</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={!!cfg.relanceEnabled}
                      onChange={e => setFollowUpConfigDraft(d => ({ ...d, relanceEnabled: e.target.checked }))}
                      className="sr-only peer" />
                    <div className="w-10 h-5 bg-gray-200 peer-focus:ring-2 peer-focus:ring-indigo-300 rounded-full peer peer-checked:bg-indigo-600 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-5" />
                  </label>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Délai avant relance</label>
                  <div className="flex items-center gap-2">
                    <input type="number" min="1" max="168" value={cfg.relanceDelayH ?? 24}
                      onChange={e => setFollowUpConfigDraft(d => ({ ...d, relanceDelayH: parseInt(e.target.value) || 24 }))}
                      className="w-24 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400 text-center" />
                    <span className="text-sm text-gray-500">heure(s) après la création de la commande</span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">
                    Message de relance
                    <span className="ml-2 font-normal text-gray-400">Variables : {'{{nom}}'} {'{{numero_commande}}'} {'{{produit}}'}</span>
                  </label>
                  <textarea rows={4} value={cfg.relanceTemplate ?? ''}
                    onChange={e => setFollowUpConfigDraft(d => ({ ...d, relanceTemplate: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-400 resize-none font-mono" />
                </div>

                <div className="flex gap-2">
                  <button onClick={saveFollowUpConfig} disabled={followUpSaving}
                    className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                    {followUpSaving ? 'Enregistrement...' : 'Enregistrer'}
                  </button>
                  <button onClick={() => openFollowUpPreview('relance')} disabled={!!followUpPreviewLoading || !cfg.relanceEnabled}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-50 text-amber-700 text-sm font-semibold hover:bg-amber-100 disabled:opacity-50 transition-colors border border-amber-200">
                    {followUpPreviewLoading === 'relance'
                      ? <span className="w-4 h-4 border-2 border-amber-400/30 border-t-amber-600 rounded-full animate-spin" />
                      : <Bell size={14} />}
                    Voir les destinataires
                  </button>
                </div>

                {/* Preview relance */}
                {followUpPreview?.type === 'relance' && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm font-bold text-amber-800">
                        {followUpPreview.orders.length === 0
                          ? 'Aucune commande éligible'
                          : `${followUpPreview.orders.length} commande${followUpPreview.orders.length > 1 ? 's' : ''} à relancer`}
                      </p>
                      <button onClick={() => setFollowUpPreview(null)} className="text-amber-500 hover:text-amber-700">
                        <X size={14} />
                      </button>
                    </div>
                    {followUpPreview.orders.length > 0 && (
                      <>
                        <div className="space-y-2 max-h-52 overflow-y-auto mb-3">
                          {followUpPreview.orders.map(o => {
                            const st = STATUS_LABELS[o.status] ?? STATUS_LABELS.pending;
                            return (
                              <div key={o.id} className="flex items-center gap-3 bg-white rounded-lg px-3 py-2 border border-amber-100">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-bold text-xs text-indigo-600">{orderNum(o.orderNumber)}</span>
                                    <span className="font-medium text-sm text-gray-800 truncate">{o.customerName}</span>
                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
                                  </div>
                                  <p className="text-xs text-gray-400 truncate">{o.customerPhone} · {o.city}</p>
                                  <p className="text-xs text-gray-400">
                                    Créée le {new Date(o.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <button onClick={() => triggerFollowUp('relance')} disabled={!!followUpTriggerLoading}
                          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 disabled:opacity-50 transition-colors">
                          {followUpTriggerLoading === 'relance'
                            ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            : <Bell size={14} />}
                          Envoyer à tous ({followUpPreview.orders.length})
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* ── Fidélisation livrées ── */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-gray-900">Message de fidélisation (après livraison)</h3>
                    <p className="text-xs text-gray-400 mt-0.5">Envoyé aux clients après la livraison pour recueillir des avis</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={!!cfg.loyaltyEnabled}
                      onChange={e => setFollowUpConfigDraft(d => ({ ...d, loyaltyEnabled: e.target.checked }))}
                      className="sr-only peer" />
                    <div className="w-10 h-5 bg-gray-200 peer-focus:ring-2 peer-focus:ring-indigo-300 rounded-full peer peer-checked:bg-indigo-600 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-5" />
                  </label>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Délai après livraison</label>
                  <div className="flex items-center gap-2">
                    <input type="number" min="1" max="168" value={cfg.loyaltyDelayH ?? 24}
                      onChange={e => setFollowUpConfigDraft(d => ({ ...d, loyaltyDelayH: parseInt(e.target.value) || 24 }))}
                      className="w-24 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400 text-center" />
                    <span className="text-sm text-gray-500">heure(s) après la livraison</span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">
                    Message de fidélisation
                    <span className="ml-2 font-normal text-gray-400">Variables : {'{{nom}}'} {'{{numero_commande}}'} {'{{produit}}'}</span>
                  </label>
                  <textarea rows={4} value={cfg.loyaltyTemplate ?? ''}
                    onChange={e => setFollowUpConfigDraft(d => ({ ...d, loyaltyTemplate: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-400 resize-none font-mono" />
                </div>

                <div className="flex gap-2">
                  <button onClick={saveFollowUpConfig} disabled={followUpSaving}
                    className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                    {followUpSaving ? 'Enregistrement...' : 'Enregistrer'}
                  </button>
                  <button onClick={() => openFollowUpPreview('loyalty')} disabled={!!followUpPreviewLoading || !cfg.loyaltyEnabled}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-green-50 text-green-700 text-sm font-semibold hover:bg-green-100 disabled:opacity-50 transition-colors border border-green-200">
                    {followUpPreviewLoading === 'loyalty'
                      ? <span className="w-4 h-4 border-2 border-green-400/30 border-t-green-600 rounded-full animate-spin" />
                      : <Bell size={14} />}
                    Voir les destinataires
                  </button>
                </div>

                {/* Preview loyalty */}
                {followUpPreview?.type === 'loyalty' && (
                  <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm font-bold text-green-800">
                        {followUpPreview.orders.length === 0
                          ? 'Aucune commande éligible'
                          : `${followUpPreview.orders.length} client${followUpPreview.orders.length > 1 ? 's' : ''} à contacter`}
                      </p>
                      <button onClick={() => setFollowUpPreview(null)} className="text-green-500 hover:text-green-700">
                        <X size={14} />
                      </button>
                    </div>
                    {followUpPreview.orders.length > 0 && (
                      <>
                        <div className="space-y-2 max-h-52 overflow-y-auto mb-3">
                          {followUpPreview.orders.map(o => (
                            <div key={o.id} className="flex items-center gap-3 bg-white rounded-lg px-3 py-2 border border-green-100">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-bold text-xs text-indigo-600">{orderNum(o.orderNumber)}</span>
                                  <span className="font-medium text-sm text-gray-800 truncate">{o.customerName}</span>
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">Livré</span>
                                </div>
                                <p className="text-xs text-gray-400 truncate">{o.customerPhone} · {o.city}</p>
                                <p className="text-xs text-gray-400">
                                  Livré le {new Date(o.updatedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                        <button onClick={() => triggerFollowUp('loyalty')} disabled={!!followUpTriggerLoading}
                          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-green-600 text-white text-sm font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors">
                          {followUpTriggerLoading === 'loyalty'
                            ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            : <Bell size={14} />}
                          Envoyer à tous ({followUpPreview.orders.length})
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* ── Historique ── */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <h3 className="font-bold text-gray-900 mb-3">Historique des envois ({followUpHistory.length})</h3>
                {followUpHistory.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-6">Aucun envoi pour l'instant.</p>
                ) : (
                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    {followUpHistory.map(entry => (
                      <div key={entry.id} className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">
                        <span className={`mt-0.5 shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full
                          ${entry.type === 'relance' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                          {entry.type === 'relance' ? 'Relance' : 'Fidélisation'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-gray-500 truncate">{entry.phone}</p>
                          <p className="text-xs text-gray-700 mt-0.5 line-clamp-2">{entry.message}</p>
                        </div>
                        <p className="text-xs text-gray-400 shrink-0">
                          {new Date(entry.sentAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })()}
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Nom client *" value={orderForm.customerName} onChange={v => setOrderForm(f => ({ ...f, customerName: v }))} placeholder="Nom complet" />
              <Field label="Téléphone" value={orderForm.customerPhone} onChange={v => setOrderForm(f => ({ ...f, customerPhone: v }))} placeholder="+243..." />
            </div>

            {/* Ville + Commune + Frais */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <CitySelect value={orderForm.city} onChange={v => setOrderForm(f => ({ ...f, city: v, commune: '' }))} required />
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

            {/* Commune */}
            {CITY_COMMUNES[orderForm.city]?.length > 0 && (
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Commune</label>
                <select value={orderForm.commune} onChange={e => setOrderForm(f => ({ ...f, commune: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-400 bg-white">
                  <option value="">— Choisir</option>
                  {CITY_COMMUNES[orderForm.city].map((c: string) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            )}

            <Field label="Adresse précise *" value={orderForm.addressDetail} onChange={v => setOrderForm(f => ({ ...f, addressDetail: v }))} placeholder="Avenue, quartier, référence..." />

            {/* Date de livraison prévue */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1 flex items-center gap-1">
                <Calendar size={11} /> Date et heure de livraison prévue
              </label>
              <input type="datetime-local" value={orderForm.scheduledAt}
                onChange={e => setOrderForm(f => ({ ...f, scheduledAt: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-400 bg-white" />
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

      {/* ── MODAL DISPATCH (choix partenaire) ── */}
      {dispatchModal && (
        <Modal title="Assigner au partenaire" onClose={() => { setDispatchModal(null); setDispatchPartnerId(''); }}>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Partenaire de livraison</label>
            <select value={dispatchPartnerId} onChange={e => setDispatchPartnerId(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-400 bg-white">
              <option value="">— Choisir un partenaire</option>
              {partners.map(p => (
                <option key={p.id} value={p.id}>{p.name}{p.city ? ` · ${p.city}` : ''}</option>
              ))}
            </select>
          </div>
          <ModalFooter
            onClose={() => { setDispatchModal(null); setDispatchPartnerId(''); }}
            onConfirm={confirmDispatch}
            loading={submitting}
            label="Assigner & envoyer WA"
          />
        </Modal>
      )}

      {/* ── MODAL REPORTER ── */}
      {rescheduleModal && (
        <Modal title="Reporter la livraison" onClose={() => { setRescheduleModal(null); setRescheduleDate(''); }}>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1 flex items-center gap-1">
              <Calendar size={11} /> Nouvelle date et heure de livraison
            </label>
            <input type="datetime-local" value={rescheduleDate}
              onChange={e => setRescheduleDate(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-400 bg-white" />
          </div>
          <ModalFooter
            onClose={() => { setRescheduleModal(null); setRescheduleDate(''); }}
            onConfirm={confirmReschedule}
            loading={submitting}
            label="Confirmer le report"
          />
        </Modal>
      )}

      {/* ── MODAL LIVRAISON CONFIRMÉE ── */}
      {deliverModal && (
        <Modal title="Confirmer la livraison" onClose={() => { setDeliverModal(null); setCollectedUsd(''); setCollectedCdf(''); }}>
          <p className="text-sm text-gray-600">Montants encaissés par le livreur à la livraison.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Montant encaissé ($)</label>
              <div className="relative">
                <input type="text" inputMode="decimal" value={collectedUsd}
                  onChange={e => setCollectedUsd(e.target.value)} placeholder="0"
                  className="w-full border border-gray-200 rounded-xl pl-3 pr-7 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-400" />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-bold">$</span>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Montant encaissé (FC)</label>
              <div className="relative">
                <input type="text" inputMode="decimal" value={collectedCdf}
                  onChange={e => setCollectedCdf(e.target.value)} placeholder="0"
                  className="w-full border border-gray-200 rounded-xl pl-3 pr-8 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-400" />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-bold">FC</span>
              </div>
            </div>
          </div>
          <Field label="Nom du livreur (optionnel)" value={deliveryPersonName} onChange={setDeliveryPersonName} placeholder="ex: Jean-Paul" />
          <ModalFooter onClose={() => { setDeliverModal(null); setCollectedUsd(''); setCollectedCdf(''); }} onConfirm={confirmDelivered} loading={submitting} label="Confirmer livré" />
        </Modal>
      )}

      {/* ── MODAL RAPPORT JOURNALIER ── */}
      {dailyReportModal && (
        <Modal title={`Rapport journalier — ${dailyReportModal.name}`} onClose={() => { setDailyReportModal(null); setDailyReportData(null); }} wide>
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <input type="date" value={dailyReportDate}
              onChange={e => changeDailyReportDate(e.target.value)}
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400" />
            <button onClick={() => window.print()} className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 text-gray-600 hover:bg-gray-200 rounded-xl text-xs font-semibold">
              <Printer size={13} /> Imprimer
            </button>
          </div>

          {dailyReportLoading && <p className="text-sm text-gray-400 text-center py-6">Chargement...</p>}

          {!dailyReportLoading && dailyReportData && (() => {
            const r = dailyReportData;
            const dateLabel = new Date(r.date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
            const STATUS_LABELS_REPORT: Record<string, string> = {
              delivered: 'Livré', returned: 'Retourné', cancelled: 'Annulé',
              fake: 'Fausse cmd', pending: 'En attente', dispatched: 'En cours', postponed: 'Reporté',
            };
            return (
              <div className="space-y-5 text-sm">
                <h2 className="font-black text-gray-900 text-center text-base capitalize">{dateLabel}</h2>

                {/* Orders table */}
                {r.orders.length > 0 ? (
                  <div>
                    <h3 className="font-bold text-gray-700 mb-2 text-xs uppercase tracking-wide">Commandes</h3>
                    <div className="overflow-x-auto rounded-xl border border-gray-100">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50 text-gray-500">
                          <tr>
                            {['N°','Zone','Agent','Montant $','Montant FC','Observation','Frais course','Statut'].map(h => (
                              <th key={h} className="px-2 py-2 text-left font-semibold whitespace-nowrap">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {r.orders.map(o => (
                            <tr key={o.id} className="border-t border-gray-100 hover:bg-gray-50">
                              <td className="px-2 py-2 font-bold text-indigo-600">{o.num}</td>
                              <td className="px-2 py-2 text-gray-700">{o.city}</td>
                              <td className="px-2 py-2 text-gray-600">{o.agentName ?? '—'}</td>
                              <td className="px-2 py-2 font-semibold">{o.collectedUsd > 0 ? `$${o.collectedUsd.toLocaleString('fr-FR')}` : o.totalAmount > 0 ? `$${o.totalAmount.toLocaleString('fr-FR')}` : '—'}</td>
                              <td className="px-2 py-2 font-semibold">{o.collectedCdf > 0 ? o.collectedCdf.toLocaleString('fr-FR') : '—'}</td>
                              <td className="px-2 py-2 text-gray-500 max-w-[140px] truncate">{o.notes ?? o.items.map(i => `${i.quantity} ${i.name}`).join(', ')}</td>
                              <td className="px-2 py-2">{o.deliveryFee > 0 ? o.deliveryFee.toLocaleString('fr-FR') : '—'}</td>
                              <td className="px-2 py-2"><span className={`font-semibold ${o.status === 'delivered' ? 'text-green-600' : o.status === 'cancelled' ? 'text-red-500' : o.status === 'returned' ? 'text-orange-500' : 'text-gray-500'}`}>{STATUS_LABELS_REPORT[o.status] ?? o.status}</span></td>
                            </tr>
                          ))}
                          {/* Totals row */}
                          <tr className="border-t-2 border-gray-300 bg-yellow-50 font-black">
                            <td colSpan={3} className="px-2 py-2 text-gray-800">TOTAL</td>
                            <td className="px-2 py-2">${r.summary.totalCollectedUsd.toLocaleString('fr-FR')}</td>
                            <td className="px-2 py-2">{r.summary.totalCollectedCdf.toLocaleString('fr-FR')}</td>
                            <td className="px-2 py-2">—</td>
                            <td className="px-2 py-2">{r.summary.totalDeliveryFees.toLocaleString('fr-FR')}</td>
                            <td className="px-2 py-2"></td>
                          </tr>
                          <tr className="bg-yellow-100 font-bold">
                            <td colSpan={3} className="px-2 py-1.5 text-gray-700">Solde</td>
                            <td className="px-2 py-1.5">${r.summary.soldeUsd.toLocaleString('fr-FR')}</td>
                            <td className="px-2 py-1.5">{r.summary.soldeCdf.toLocaleString('fr-FR')}</td>
                            <td colSpan={3}></td>
                          </tr>
                          <tr className="bg-red-100 font-black text-red-800">
                            <td colSpan={3} className="px-2 py-1.5">Solde Cumulé</td>
                            <td className="px-2 py-1.5">${r.cumulativeSolde.soldeUsd.toLocaleString('fr-FR')}</td>
                            <td className="px-2 py-1.5">{r.cumulativeSolde.soldeCdf.toLocaleString('fr-FR')}</td>
                            <td colSpan={3}></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <p className="text-center text-gray-400 py-6">Aucune commande pour cette journée.</p>
                )}

                {/* Summary stats */}
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {[
                    { label: 'Total', val: r.summary.total, color: 'bg-gray-100 text-gray-700' },
                    { label: 'Livrées', val: r.summary.delivered, color: 'bg-green-100 text-green-700' },
                    { label: 'Échouées', val: r.summary.failed, color: 'bg-orange-100 text-orange-700' },
                    { label: 'Annulées', val: r.summary.cancelled, color: 'bg-red-100 text-red-600' },
                    { label: 'En attente', val: r.summary.pending, color: 'bg-blue-100 text-blue-700' },
                    { label: 'Taux réussite', val: `${r.summary.successRate}%`, color: 'bg-indigo-100 text-indigo-700' },
                  ].map(({ label, val, color }) => (
                    <div key={label} className={`rounded-xl p-3 text-center ${color}`}>
                      <p className="text-lg font-black">{val}</p>
                      <p className="text-[10px] font-semibold mt-0.5">{label}</p>
                    </div>
                  ))}
                </div>

                {/* Stock report */}
                {r.stock.length > 0 && (
                  <div>
                    <h3 className="font-bold text-gray-700 mb-2 text-xs uppercase tracking-wide">Rapport Stock</h3>
                    <div className="overflow-x-auto rounded-xl border border-gray-100">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50 text-gray-500">
                          <tr>
                            {['Produit','Stock début','Livré','Entrées','Stock actuel'].map(h => (
                              <th key={h} className="px-3 py-2 text-left font-semibold">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {r.stock.map(s => (
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
                            <td className="px-3 py-2 text-center">{r.stock.reduce((s, x) => s + x.stockStart, 0)}</td>
                            <td className="px-3 py-2 text-center text-red-600">{r.stock.reduce((s, x) => s + x.delivered, 0)}</td>
                            <td className="px-3 py-2 text-center text-green-600">{r.stock.reduce((s, x) => s + x.entries, 0)}</td>
                            <td className="px-3 py-2 text-center font-black">{r.stock.reduce((s, x) => s + x.stockCurrent, 0)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          <div className="pt-2">
            <button onClick={() => { setDailyReportModal(null); setDailyReportData(null); }}
              className="w-full py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50">
              Fermer
            </button>
          </div>
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
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <ScrollLock />
      <div className={`bg-white rounded-2xl shadow-2xl w-full ${wide ? 'max-w-2xl' : 'max-w-md'} max-h-[90vh] flex flex-col`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100"><X size={18} className="text-gray-500" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-3">{children}</div>
      </div>
    </div>,
    document.body
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
