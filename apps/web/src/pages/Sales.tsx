import { useState, useMemo, useEffect, useRef } from 'react';
import { Plus, Trash2, Search, X, Download, Send, User, Phone, MapPin, ShoppingCart, Package } from 'lucide-react';
import { useStore } from '../store/useStore';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { NumberInput } from '../components/ui/NumberInput';
import { ListSkeleton } from '../components/ui/Skeleton';
import { PageHeader, Stat, EmptyState, Pagination, Fab, FormSection } from '../components/ui/Page';
import { useCurrency } from '../hooks/useCurrency';
import { formatDate, CHANNEL_COLORS, SALE_CHANNELS } from '../utils/formatters';
import { downloadInvoice, getInvoiceBase64 } from '../utils/invoicePdf';
import { salesApi } from '../api';
import type { SaleChannel, SaleItem, SaleStatus } from '../types';
import { SALE_STATUSES, KINSHASA_COMMUNES, RDC_VILLES } from '@kza/shared';
import { useSegment } from '../hooks/useSegment';
import { useModules } from '../hooks/useModules';

const PAGE_SIZE = 10;

const STATUS_BADGE: Record<SaleStatus, { color: 'green' | 'amber' | 'red' | 'indigo'; label: string }> = {
  paid: { color: 'green', label: 'Payé' },
  pending: { color: 'amber', label: 'En attente' },
  cancelled: { color: 'red', label: 'Annulé' },
  credit: { color: 'indigo', label: 'À crédit' },
};

/** The colour a status takes once chosen, in the segmented control. */
const STATUS_ACTIVE: Record<SaleStatus, string> = {
  paid: '!bg-emerald-600 !text-white',
  pending: '!bg-amber-500 !text-white',
  cancelled: '!bg-red-600 !text-white',
  credit: '!bg-indigo-600 !text-white',
};

export function Sales() {
  const { terms, words } = useSegment();
  const { products, sales, loading, addSale, updateSaleStatus, deleteSale, businesses, currentBusinessId } = useStore();
  const currentBusiness = businesses.find(b => b.id === currentBusinessId);
  const { fmt: MAD, currency } = useCurrency();
  const [submitting, setSubmitting] = useState(false);

  const [search, setSearch] = useState('');
  const [channelFilter, setChannelFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Invoice send state
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sendMsg, setSendMsg] = useState<{ id: string; ok: boolean; text: string } | null>(null);

  // Form state
  const [channel, setChannel] = useState<SaleChannel>('WhatsApp');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [note, setNote] = useState('');
  const [status, setStatus] = useState<SaleStatus>('paid');
  const { has: hasModule } = useModules();
  // "À crédit" only exists for businesses using the credit module (an existing credit sale still shows it).
  const statusesFor = (current?: SaleStatus) => SALE_STATUSES.filter(st => st !== 'credit' || hasModule('credit') || current === 'credit');
  const [deliveryZone, setDeliveryZone] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [items, setItems] = useState<SaleItem[]>([{ productId: '', quantity: 1, unitPrice: 0 }]);

  // Autocomplete state
  const [suggestions, setSuggestions] = useState<{ name: string; phone: string }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestBoxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (suggestBoxRef.current && !suggestBoxRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handlePhoneInput = (val: string) => {
    setCustomerPhone(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (val.trim().length >= 2) {
      debounceRef.current = setTimeout(async () => {
        try {
          const res = await salesApi.suggestCustomers(val.trim());
          setSuggestions(res);
          setShowSuggestions(res.length > 0);
        } catch { /* silencieux */ }
      }, 300);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const handleNameInput = (val: string) => {
    setCustomerName(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (val.trim().length >= 2) {
      debounceRef.current = setTimeout(async () => {
        try {
          const res = await salesApi.suggestCustomers(val.trim());
          setSuggestions(res);
          setShowSuggestions(res.length > 0);
        } catch { /* silencieux */ }
      }, 300);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const pickSuggestion = (s: { name: string; phone: string }) => {
    setCustomerName(s.name);
    setCustomerPhone(s.phone);
    setSuggestions([]);
    setShowSuggestions(false);
  };

  const openModal = () => {
    setChannel('WhatsApp');
    setDate(new Date().toISOString().split('T')[0]);
    setNote('');
    setStatus('paid');
    setDeliveryZone('');
    setCustomerName('');
    setCustomerPhone('');
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
      await addSale({
        channel, date, status, items: validItems,
        ...(note ? { note } : {}),
        ...(deliveryZone ? { deliveryZone } : {}),
        ...(customerName ? { customerName } : {}),
        ...(customerPhone ? { customerPhone } : {}),
      });
      setModalOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendInvoice = async (sale: typeof sales[0]) => {
    if (!sale.customerPhone) return;
    setSendingId(sale.id);
    setSendMsg(null);
    let dismissDelay = 4000;
    try {
      const pdfBase64 = await getInvoiceBase64(sale, products, currentBusiness);
      await salesApi.sendInvoice(sale.id, { phone: sale.customerPhone, pdfBase64 });
      setSendMsg({ id: sale.id, ok: true, text: 'Facture envoyée par WhatsApp' });
    } catch (e: any) {
      const raw = e?.message ?? '';
      const isWaDisconnected = raw.includes('WhatsApp non connecté') || raw.includes('503');
      const isInvalidPhone = raw.includes('Envoi impossible') || raw.includes('502');
      if (isWaDisconnected) dismissDelay = 8000;
      const text = isWaDisconnected
        ? '__wa_not_connected__'
        : isInvalidPhone
          ? `Numéro inaccessible sur WhatsApp (${sale.customerPhone}). Vérifiez le format.`
          : (raw || 'Erreur envoi WhatsApp');
      setSendMsg({ id: sale.id, ok: false, text });
    } finally {
      setSendingId(null);
      setTimeout(() => setSendMsg(null), dismissDelay);
    }
  };

  const saleTotal = (sale: typeof sales[0]) =>
    sale.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);

  const filtered = useMemo(() => {
    return sales
      .filter(s => {
        if (channelFilter && s.channel !== channelFilter) return false;
        if (search) {
          const q = search.toLowerCase();
          const hasProduct = s.items.some(i => {
            const p = products.find(p => p.id === i.productId);
            return p?.name.toLowerCase().includes(q);
          });
          const hasCustomer = s.customerName?.toLowerCase().includes(q) ||
            s.customerPhone?.includes(search);
          if (!hasProduct && !s.channel.toLowerCase().includes(q) && !hasCustomer) return false;
        }
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [sales, search, channelFilter, products]);

  const totalRev = filtered.reduce((s, sale) => s + saleTotal(sale), 0);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

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

  const allRevenue = sales.reduce((s, sale) => s + saleTotal(sale), 0);
  const paidRevenue = filtered.filter(s => s.status === 'paid').reduce((s, sale) => s + saleTotal(sale), 0);
  const pendingCount = filtered.filter(s => s.status === 'pending').length;
  const formTotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const filtering = !!(search || channelFilter);

  return (
    <div className="space-y-5 overflow-x-hidden">
      <PageHeader
        title="Ventes"
        subtitle={`${sales.length} ventes · ${MAD(allRevenue)} au total`}
        actions={
          <Button onClick={openModal} className="hidden lg:inline-flex">
            <Plus size={16} /> Nouvelle vente
          </Button>
        }
      />

      {/* What the list below adds up to */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 stagger">
        <Stat label={filtering ? "Chiffre d'affaires (filtre)" : "Chiffre d'affaires"} value={MAD(totalRev)} hint={`${filtered.length} vente${filtered.length > 1 ? 's' : ''}`} />
        <Stat label="Encaissé" value={MAD(paidRevenue)} tone="positive" hint="ventes au statut Payé" />
        <Stat label="Panier moyen" value={MAD(filtered.length ? totalRev / filtered.length : 0)} />
        <Stat label="En attente" value={String(pendingCount)} tone={pendingCount > 0 ? 'warning' : 'default'} hint="à confirmer" />
      </div>

      {/* Channels: tap one to filter */}
      {channelStats.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
          {channelStats.map(([ch, stats]) => (
            <button
              key={ch}
              onClick={() => { setChannelFilter(channelFilter === ch ? '' : ch); setPage(1); }}
              aria-pressed={channelFilter === ch}
              className="chip"
            >
              <span className="w-2.5 h-2.5 rounded-full ring-2 ring-surface" style={{ backgroundColor: CHANNEL_COLORS[ch] ?? '#6b7280' }} />
              {ch}
              <span className="font-bold tabular-nums">{MAD(stats.revenue)}</span>
              <span className="text-xs opacity-70">{stats.count}</span>
            </button>
          ))}
        </div>
      )}

      {/* Search */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-4 pointer-events-none" />
          <input
            type="search"
            placeholder={`Rechercher un ${terms.item}, un canal, un client…`}
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="input pl-10"
          />
        </div>
        {filtering && (
          <Button variant="secondary" onClick={() => { setSearch(''); setChannelFilter(''); setPage(1); }}>
            <X size={14} /> <span className="hidden sm:inline">Effacer</span>
          </Button>
        )}
      </div>

      {/* Sales list */}
      <div className="space-y-3">
        {loading && sales.length === 0 ? (
          <ListSkeleton count={4} />
        ) : (
          <div key={`${page}-${channelFilter}-${search}`} className="space-y-3 stagger">
            {paginated.map(sale => {
              const total = saleTotal(sale);
              const cName = sale.customerName;
              const cPhone = sale.customerPhone;
              const isSending = sendingId === sale.id;
              const msg = sendMsg?.id === sale.id ? sendMsg : null;
              const status = STATUS_BADGE[sale.status];

              return (
                <article key={sale.id} className="card card-hover p-4 sm:p-5">
                  {/* Channel, date, total */}
                  <div className="flex items-start gap-3">
                    <span className="mt-1.5 w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: CHANNEL_COLORS[sale.channel] ?? '#6b7280' }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-fg">{sale.channel}</span>
                        <span className="text-xs text-fg-4">·</span>
                        <span className="text-xs text-fg-3">{formatDate(sale.date)}</span>
                        <Badge color={status.color} size="sm">{status.label}</Badge>
                      </div>
                      {(cName || cPhone || sale.deliveryZone) && (
                        <div className="flex items-center gap-x-3 gap-y-1 mt-1 text-xs text-fg-3 flex-wrap">
                          {cName && <span className="flex items-center gap-1"><User size={12} />{cName}</span>}
                          {cPhone && <span className="flex items-center gap-1"><Phone size={12} />{cPhone}</span>}
                          {sale.deliveryZone && <span className="flex items-center gap-1"><MapPin size={12} />{sale.deliveryZone}</span>}
                        </div>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-lg sm:text-xl font-bold tracking-tight text-fg tabular-nums">{MAD(total)}</div>
                      <div className="text-[11px] text-fg-4">{sale.items.length} ligne{sale.items.length > 1 ? 's' : ''}</div>
                    </div>
                  </div>

                  {/* Lines */}
                  <div className="mt-3 rounded-xl bg-surface-2 divide-y divide-line/70">
                    {sale.items.map((item, i) => {
                      const product = products.find(p => p.id === item.productId);
                      return (
                        <div key={i} className="flex items-center gap-3 px-3 py-2 text-sm">
                          <span className="flex-1 min-w-0 truncate text-fg-2">
                            {product?.name ?? words.unknownItem}
                          </span>
                          <span className="text-xs text-fg-3 tabular-nums whitespace-nowrap">{item.quantity} × {MAD(item.unitPrice)}</span>
                          <span className="font-semibold text-fg tabular-nums whitespace-nowrap">{MAD(item.quantity * item.unitPrice)}</span>
                        </div>
                      );
                    })}
                  </div>

                  {sale.note && <p className="mt-2 text-xs text-fg-3 italic">« {sale.note} »</p>}

                  {/* Send feedback */}
                  {msg && (
                    <div className={`mt-3 text-xs px-3 py-2 rounded-xl animate-fade-in ${
                      msg.ok ? 'bg-emerald-50 text-emerald-700'
                      : msg.text === '__wa_not_connected__' ? 'bg-amber-50 text-amber-700'
                      : 'bg-red-50 text-red-700'
                    }`}>
                      {msg.text === '__wa_not_connected__' ? (
                        <span>
                          WhatsApp non connecté.{' '}
                          <a href="#/whatsapp" className="underline font-semibold">Connecter WhatsApp</a>
                        </span>
                      ) : msg.text}
                    </div>
                  )}

                  {/* Status and actions */}
                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    <div className="segmented flex-1 min-w-[220px]">
                      {statusesFor(sale.status).map(s => (
                        <button
                          key={s}
                          onClick={() => sale.status !== s && updateSaleStatus(sale.id, s)}
                          aria-pressed={sale.status === s}
                          className={sale.status === s ? STATUS_ACTIVE[s] : ''}
                        >
                          {STATUS_BADGE[s].label}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-1 ml-auto">
                      {sale.status === 'paid' && (
                        <button onClick={() => downloadInvoice(sale, products, currentBusiness)}
                          title="Télécharger la facture PDF" aria-label="Télécharger la facture PDF" className="icon-btn">
                          <Download size={16} />
                        </button>
                      )}
                      {sale.status === 'paid' && cPhone && (
                        <button onClick={() => handleSendInvoice(sale)} disabled={isSending}
                          title={`Envoyer la facture à ${cPhone} par WhatsApp`} aria-label="Envoyer la facture par WhatsApp"
                          className="icon-btn text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50">
                          {isSending
                            ? <span className="w-4 h-4 border-2 border-emerald-300 border-t-emerald-600 rounded-full animate-spin" />
                            : <Send size={16} />}
                        </button>
                      )}
                      <button onClick={() => setDeleteId(sale.id)} title="Supprimer" aria-label="Supprimer la vente"
                        className="icon-btn hover:text-red-600 hover:bg-red-50">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
        {!loading && filtered.length === 0 && (
          filtering ? (
            <EmptyState icon={Search} title="Aucune vente ne correspond" text="Essaie un autre mot ou retire le filtre de canal." />
          ) : (
            <EmptyState icon={ShoppingCart} title="Aucune vente pour l'instant" text="Enregistre ta première vente : elle apparaîtra ici, avec sa facture."
              action={<Button onClick={openModal}><Plus size={16} /> Nouvelle vente</Button>} />
          )
        )}
      </div>

      <Pagination page={page} totalPages={totalPages} onPage={setPage}
        summary={`Page ${page} / ${totalPages} · ${filtered.length} ventes`} />

      <Fab icon={Plus} label="Vente" onClick={openModal} />

      {/* Sale Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nouvelle vente" size="lg">
        <div className="space-y-6">
          <FormSection title="Vente" icon={ShoppingCart}>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Canal *</label>
                <select value={channel} onChange={e => setChannel(e.target.value as SaleChannel)} className="input">
                  {SALE_CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Date *</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)} className="input" />
              </div>
            </div>
          </FormSection>

          <FormSection title="Client" icon={User}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" ref={suggestBoxRef}>
              <div className="relative">
                <label className="label">Téléphone</label>
                <input
                  type="tel"
                  inputMode="tel"
                  value={customerPhone}
                  onChange={e => handlePhoneInput(e.target.value)}
                  onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                  placeholder="+243 8XX XXX XXX"
                  className="input"
                />
                {showSuggestions && (
                  <div className="absolute z-50 left-0 right-0 top-full mt-1.5 glass-strong border rounded-xl shadow-float overflow-hidden animate-scale-in origin-top">
                    {suggestions.map((s, i) => (
                      <button key={i} type="button"
                        onMouseDown={() => pickSuggestion(s)}
                        className="w-full text-left px-3 py-2.5 text-sm hover:bg-surface-2 flex items-center justify-between gap-2 border-b border-line/60 last:border-0">
                        <span className="font-medium text-fg truncate">{s.name || s.phone}</span>
                        <span className="text-fg-4 text-xs shrink-0">{s.name ? s.phone : ''}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className="label">Nom</label>
                <input type="text" value={customerName} onChange={e => handleNameInput(e.target.value)}
                  placeholder="Nom ou prénom" autoComplete="off" className="input" />
              </div>
            </div>
          </FormSection>

          <FormSection title={`${words.Items} *`} icon={Package}
            aside={<button onClick={addItem} className="text-xs text-indigo-700 font-semibold hover:underline">+ Ajouter une ligne</button>}>
            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={idx} className="rounded-xl border border-line bg-surface-2/60 p-3 space-y-2 animate-fade-in">
                  <div className="flex items-center gap-2">
                    <select value={item.productId} onChange={e => updateItem(idx, 'productId', e.target.value)} className="input flex-1">
                      <option value="">Choisir…</option>
                      {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                    </select>
                    {items.length > 1 && (
                      <button onClick={() => removeItem(idx)} aria-label="Retirer la ligne" className="icon-btn hover:text-red-600 hover:bg-red-50 shrink-0">
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-[1fr_1.4fr_auto] gap-2 items-end">
                    <div>
                      <label className="label">Quantité</label>
                      <NumberInput value={item.quantity} min={0.1} onChange={val => updateItem(idx, 'quantity', val)} className="input" />
                    </div>
                    <div>
                      <label className="label">Prix unitaire ({currency})</label>
                      <NumberInput value={item.unitPrice} onChange={val => updateItem(idx, 'unitPrice', val)} className="input" />
                    </div>
                    <div className="text-right pb-2.5 min-w-[80px]">
                      <div className="text-[11px] text-fg-4">Total</div>
                      <div className="text-sm font-bold text-fg tabular-nums">{MAD(item.quantity * item.unitPrice)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between rounded-xl bg-indigo-600/10 px-4 py-3">
              <span className="text-sm font-medium text-indigo-800">Total de la vente</span>
              <span className="text-lg font-bold text-indigo-800 tabular-nums">{MAD(formTotal)}</span>
            </div>
          </FormSection>

          <FormSection title="Statut *">
            <div className="segmented">
              {statusesFor().map(s => (
                <button key={s} onClick={() => setStatus(s)} aria-pressed={status === s}
                  className={`!py-2 !text-sm ${status === s ? STATUS_ACTIVE[s] : ''}`}>
                  {STATUS_BADGE[s].label}
                </button>
              ))}
            </div>
          </FormSection>

          <FormSection title="Livraison & note" icon={MapPin}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label">Zone de livraison</label>
                <select value={deliveryZone} onChange={e => setDeliveryZone(e.target.value)} className="input">
                  <option value="">— Non spécifiée —</option>
                  <optgroup label="Kinshasa — Communes">
                    {KINSHASA_COMMUNES.map(c => <option key={c} value={`Kinshasa — ${c}`}>{c}</option>)}
                  </optgroup>
                  <optgroup label="Autres villes RDC">
                    {RDC_VILLES.map(v => <option key={v} value={v}>{v}</option>)}
                  </optgroup>
                  <option value="Autre ville">Autre ville</option>
                </select>
              </div>
              <div>
                <label className="label">Note (facultatif)</label>
                <input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="Commentaire…" className="input" />
              </div>
            </div>
          </FormSection>

          {/* The actions stay in view on a phone, above the keyboard */}
          <div className="sticky bottom-0 -mx-5 px-5 pt-3 pb-1 bg-surface border-t border-line flex gap-3">
            <Button variant="secondary" onClick={() => setModalOpen(false)} className="flex-1" disabled={submitting}>Annuler</Button>
            <Button onClick={handleSave} loading={submitting} className="flex-[2]">
              Enregistrer · {MAD(formTotal)}
            </Button>
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
