import { useState, useMemo } from 'react';
import { Plus, Trash2, Search, Filter, ChevronLeft, ChevronRight } from 'lucide-react';

const PAGE_SIZE = 10;
import { useStore } from '../store/useStore';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { NumberInput } from '../components/ui/NumberInput';
import { ListSkeleton } from '../components/ui/Skeleton';
import { useCurrency } from '../hooks/useCurrency';
import { formatDate, CHANNEL_COLORS, SALE_CHANNELS } from '../utils/formatters';
import type { SaleChannel, SaleItem, SaleStatus } from '../types';
import { SALE_STATUSES, KINSHASA_COMMUNES, RDC_VILLES } from '@kza/shared';

const STATUS_BADGE: Record<SaleStatus, { color: 'green' | 'amber' | 'red'; label: string }> = {
  paid: { color: 'green', label: 'Payé' },
  pending: { color: 'amber', label: 'En attente' },
  cancelled: { color: 'red', label: 'Annulé' },
};

const CHANNEL_BADGE: Record<SaleChannel, 'green' | 'blue' | 'gray' | 'amber' | 'purple' | 'indigo'> = {
  WhatsApp: 'green',
  'Meta Ads': 'blue',
  TikTok: 'gray',
  Instagram: 'purple',
  Boutique: 'amber',
  Autre: 'gray',
};

export function Sales() {
  const { products, sales, loading, addSale, updateSaleStatus, deleteSale } = useStore();
  const { fmt: MAD, currency } = useCurrency();
  const [submitting, setSubmitting] = useState(false);

  const [search, setSearch] = useState('');
  const [channelFilter, setChannelFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Form state
  const [channel, setChannel] = useState<SaleChannel>('WhatsApp');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [note, setNote] = useState('');
  const [status, setStatus] = useState<SaleStatus>('paid');
  const [deliveryZone, setDeliveryZone] = useState('');
  const [items, setItems] = useState<SaleItem[]>([{ productId: '', quantity: 1, unitPrice: 0 }]);

  const openModal = () => {
    setChannel('WhatsApp');
    setDate(new Date().toISOString().split('T')[0]);
    setNote('');
    setStatus('paid');
    setDeliveryZone('');
    setItems([{ productId: '', quantity: 1, unitPrice: 0 }]);
    setModalOpen(true);
  };

  const addItem = () => setItems(i => [...i, { productId: '', quantity: 1, unitPrice: 0 }]);
  const removeItem = (idx: number) => setItems(i => i.filter((_, ii) => ii !== idx));
  const updateItem = (idx: number, key: keyof SaleItem, val: string | number) => {
    setItems(i => i.map((item, ii) => {
      if (ii !== idx) return item;
      const updated = { ...item, [key]: key === 'productId' ? val : +val };
      if (key === 'productId') {
        const p = products.find(p => p.id === val);
        if (p) updated.unitPrice = p.sellingPrice > 0 ? p.sellingPrice : Math.round(p.acquisitionCost * 1.5);
      }
      return updated;
    }));
  };

  const handleSave = async () => {
    const validItems = items.filter(i => i.productId && i.quantity > 0);
    if (validItems.length === 0) return;
    setSubmitting(true);
    try {
      await addSale({ channel, date, status, items: validItems, ...(note ? { note } : {}), ...(deliveryZone ? { deliveryZone } : {}) });
      setModalOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  const saleTotal = (sale: typeof sales[0]) =>
    sale.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);

  const filtered = useMemo(() => {
    return sales
      .filter(s => {
        if (channelFilter && s.channel !== channelFilter) return false;
        if (search) {
          const hasProduct = s.items.some(i => {
            const p = products.find(p => p.id === i.productId);
            return p?.name.toLowerCase().includes(search.toLowerCase());
          });
          if (!hasProduct && !s.channel.toLowerCase().includes(search.toLowerCase())) return false;
        }
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [sales, search, channelFilter, products]);

  const totalRev = filtered.reduce((s, sale) => s + saleTotal(sale), 0);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Channel summary
  const channelStats = useMemo(() => {
    const map: Record<string, { count: number; revenue: number }> = {};
    sales.forEach(s => {
      const rev = saleTotal(s);
      if (!map[s.channel]) map[s.channel] = { count: 0, revenue: 0 };
      map[s.channel].count++;
      map[s.channel].revenue += rev;
    });
    return Object.entries(map).sort(([, a], [, b]) => b.revenue - a.revenue);
  }, [sales]);

  return (
    <div className="space-y-5 overflow-x-hidden">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 truncate">Suivi des Ventes</h1>
          <p className="text-xs sm:text-sm text-gray-500 truncate">{sales.length} ventes · {MAD(sales.reduce((s, sale) => s + saleTotal(sale), 0))} total</p>
        </div>
        <button
          onClick={openModal}
          className="shrink-0 flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3 sm:px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
        >
          <Plus size={16} /><span className="hidden sm:inline">Enregistrer</span>
        </button>
      </div>

      {/* Channel cards */}
      <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
        {channelStats.map(([ch, stats]) => (
          <button
            key={ch}
            onClick={() => { setChannelFilter(channelFilter === ch ? '' : ch); setPage(1); }}
            className={`flex-none flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-all ${
              channelFilter === ch ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-gray-200 text-gray-700 hover:border-indigo-300'
            }`}
          >
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CHANNEL_COLORS[ch] ?? '#6b7280' }} />
            {ch}
            <span className="font-bold">{MAD(stats.revenue)}</span>
            <span className="text-xs opacity-70">({stats.count})</span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Rechercher par produit ou canal..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
          />
        </div>
        {(search || channelFilter) && (
          <button
            onClick={() => { setSearch(''); setChannelFilter(''); setPage(1); }}
            className="px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-500 hover:bg-gray-50 flex items-center gap-1"
          >
            <Filter size={14} /> Reset
          </button>
        )}
      </div>

      {/* Filtered total */}
      {(search || channelFilter) && (
        <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-2 text-sm text-indigo-700">
          {filtered.length} résultats · {MAD(totalRev)}
        </div>
      )}

      {/* Sales list */}
      <div className="space-y-3">
        {loading && sales.length === 0 ? (
          <ListSkeleton count={4} />
        ) : paginated.map(sale => {
          const total = saleTotal(sale);
          return (
            <div key={sale.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge color={CHANNEL_BADGE[sale.channel] ?? 'gray'} size="sm">{sale.channel}</Badge>
                  <span className="text-sm text-gray-500">{formatDate(sale.date)}</span>
                  {sale.deliveryZone && (
                    <span className="text-xs text-gray-500 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-full">
                      📍 {sale.deliveryZone}
                    </span>
                  )}
                  {sale.note && <span className="text-xs text-gray-400 italic">"{sale.note}"</span>}
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-lg font-bold text-gray-900">{MAD(total)}</div>
                  <button
                    onClick={() => setDeleteId(sale.id)}
                    className="p-1.5 rounded-lg bg-red-50 text-red-400 hover:bg-red-100 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {/* Status selector */}
              <div className="flex gap-1 mb-3">
                {SALE_STATUSES.map(s => {
                  const cfg = STATUS_BADGE[s];
                  const active = sale.status === s;
                  const colors: Record<string, string> = {
                    paid: active ? 'bg-emerald-600 text-white' : 'text-emerald-700 hover:bg-emerald-50',
                    pending: active ? 'bg-amber-500 text-white' : 'text-amber-700 hover:bg-amber-50',
                    cancelled: active ? 'bg-red-500 text-white' : 'text-red-600 hover:bg-red-50',
                  };
                  return (
                    <button
                      key={s}
                      onClick={() => !active && updateSaleStatus(sale.id, s)}
                      disabled={active}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${colors[s]} ${active ? 'border-transparent cursor-default' : 'border-gray-200'}`}
                    >
                      {cfg.label}
                    </button>
                  );
                })}
              </div>
              <div className="space-y-1.5">
                {sale.items.map((item, i) => {
                  const product = products.find(p => p.id === item.productId);
                  return (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
                      <span className="flex-1 text-gray-700">
                        {product?.name ?? 'Produit inconnu'}
                        <span className="text-gray-400"> × {item.quantity}</span>
                      </span>
                      <span className="font-medium text-gray-900">{MAD(item.unitPrice)}/u</span>
                      <span className="text-gray-500">{MAD(item.quantity * item.unitPrice)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        {!loading && filtered.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <p className="text-lg">Aucune vente trouvée</p>
            <p className="text-sm mt-1">Enregistrez votre première vente avec le bouton ci-dessus</p>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between py-2">
          <span className="text-sm text-gray-500">
            Page {page} / {totalPages} · {filtered.length} ventes
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-2 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(n => n === 1 || n === totalPages || Math.abs(n - page) <= 1)
              .reduce<(number | '...')[]>((acc, n, i, arr) => {
                if (i > 0 && (n as number) - (arr[i - 1] as number) > 1) acc.push('...');
                acc.push(n);
                return acc;
              }, [])
              .map((n, i) => n === '...' ? (
                <span key={`e${i}`} className="px-2 py-2 text-gray-400 text-sm">…</span>
              ) : (
                <button
                  key={n}
                  onClick={() => setPage(n as number)}
                  className={`w-9 h-9 rounded-xl text-sm font-medium transition-colors ${page === n ? 'bg-indigo-600 text-white' : 'border border-gray-200 text-gray-700 hover:bg-gray-50'}`}
                >
                  {n}
                </button>
              ))
            }
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-2 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Sale Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Enregistrer une vente" size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Canal *</label>
              <select
                value={channel}
                onChange={e => setChannel(e.target.value as SaleChannel)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300"
              >
                {SALE_CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Date *</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-600">Produits *</label>
              <button onClick={addItem} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">+ Ajouter ligne</button>
            </div>
            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={idx} className="flex flex-wrap gap-x-2 gap-y-1.5 items-end border-b border-gray-50 pb-2 last:border-0 last:pb-0 sm:border-0 sm:pb-0">
                  <div className="w-full sm:flex-1">
                    {idx === 0 && <div className="text-xs text-gray-400 mb-1">Produit</div>}
                    <select
                      value={item.productId}
                      onChange={e => updateItem(idx, 'productId', e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-300"
                    >
                      <option value="">Choisir...</option>
                      {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                    </select>
                  </div>
                  <div className="w-16 sm:w-20">
                    {idx === 0 && <div className="text-xs text-gray-400 mb-1">Qté</div>}
                    <NumberInput
                      value={item.quantity}
                      min={0.1}
                      onChange={val => updateItem(idx, 'quantity', val)}
                      className="w-full border border-gray-200 rounded-xl px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-300"
                    />
                  </div>
                  <div className="flex-1 sm:w-28">
                    {idx === 0 && <div className="text-xs text-gray-400 mb-1">Prix ({currency})</div>}
                    <NumberInput
                      value={item.unitPrice}
                      onChange={val => updateItem(idx, 'unitPrice', val)}
                      className="w-full border border-gray-200 rounded-xl px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-300"
                    />
                  </div>
                  <div className="w-20 sm:w-24 text-right pb-2">
                    {idx === 0 && <div className="text-xs text-gray-400 mb-1">Total</div>}
                    <div className="text-sm font-medium text-gray-700">{MAD(item.quantity * item.unitPrice)}</div>
                  </div>
                  {items.length > 1 && (
                    <button onClick={() => removeItem(idx)} className="pb-2 text-red-400 hover:text-red-600">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-3 text-right text-sm font-semibold text-gray-900">
              Total: {MAD(items.reduce((s, i) => s + i.quantity * i.unitPrice, 0))}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 mb-2 block">Statut *</label>
            <div className="flex gap-2">
              {SALE_STATUSES.map(s => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors ${
                    status === s
                      ? s === 'paid' ? 'bg-emerald-600 text-white border-emerald-600'
                        : s === 'pending' ? 'bg-amber-500 text-white border-amber-500'
                        : 'bg-red-500 text-white border-red-500'
                      : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {STATUS_BADGE[s].label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Zone de livraison</label>
            <select
              value={deliveryZone}
              onChange={e => setDeliveryZone(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300"
            >
              <option value="">— Non spécifiée —</option>
              <optgroup label="Kinshasa — Communes">
                {KINSHASA_COMMUNES.map(c => (
                  <option key={c} value={`Kinshasa — ${c}`}>{c}</option>
                ))}
              </optgroup>
              <optgroup label="Autres villes RDC">
                {RDC_VILLES.map(v => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </optgroup>
              <option value="Autre ville">Autre ville</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Note (optionnel)</label>
            <input
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Commentaire..."
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)} className="flex-1" disabled={submitting}>Annuler</Button>
            <Button onClick={handleSave} loading={submitting} className="flex-1">Enregistrer</Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteId}
        title="Supprimer la vente"
        message="Cette vente sera définitivement supprimée."
        onConfirm={() => { if (deleteId) deleteSale(deleteId); setDeleteId(null); }}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
