import { useEffect, useState } from 'react';
import { FileText, Plus, Download, Send, Edit2, Trash2, ArrowRightLeft, ShoppingCart, X } from 'lucide-react';
import { documentTotals, tierPrice, type DocumentLine, type DocumentType } from '@kza/shared';
import { documentsApi, type CommercialDocument, type DocumentInput } from '../api/documents';
import { salesApi, productsApi } from '../api';
import { useStore } from '../store/useStore';
import { useCurrency } from '../hooks/useCurrency';
import { useModules } from '../hooks/useModules';
import { Modal } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { NumberInput } from '../components/ui/NumberInput';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { toast } from '../hooks/useToast';
import { useSegment } from '../hooks/useSegment';
import { downloadDocument, getDocumentBase64 } from '../utils/documentPdf';

const STATUS: Record<string, { label: string; cls: string }> = {
  draft:     { label: 'Brouillon', cls: 'bg-gray-100 text-gray-600' },
  sent:      { label: 'Envoyé',    cls: 'bg-blue-100 text-blue-700' },
  accepted:  { label: 'Accepté',   cls: 'bg-emerald-100 text-emerald-700' },
  refused:   { label: 'Refusé',    cls: 'bg-red-100 text-red-600' },
  unpaid:    { label: 'À payer',   cls: 'bg-amber-100 text-amber-700' },
  paid:      { label: 'Payée',     cls: 'bg-emerald-100 text-emerald-700' },
  cancelled: { label: 'Annulée',   cls: 'bg-gray-100 text-gray-500' },
};
const STATUSES_FOR: Record<DocumentType, string[]> = {
  quote: ['draft', 'sent', 'accepted', 'refused'],
  invoice: ['unpaid', 'paid', 'cancelled'],
};

const todayIso = () => new Date().toISOString().slice(0, 10);
const plusDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const frDate = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

export function Documents() {
  const { words } = useSegment();
  const { businesses, currentBusinessId } = useStore();
  const business = businesses.find(b => b.id === currentBusinessId);
  const { fmt } = useCurrency();
  const { has } = useModules();

  const [tab, setTab] = useState<DocumentType>('quote');
  const [docs, setDocs] = useState<CommercialDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<CommercialDocument | 'new' | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saleFor, setSaleFor] = useState<CommercialDocument | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try { setDocs(await documentsApi.list()); }
    catch { toast.error('Erreur lors du chargement'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [currentBusinessId]);

  const upsert = (d: CommercialDocument) => setDocs(list => list.some(x => x.id === d.id) ? list.map(x => x.id === d.id ? d : x) : [d, ...list]);
  const shown = docs.filter(d => d.type === tab);

  const send = async (d: CommercialDocument) => {
    setBusy(d.id);
    try {
      const pdf = await getDocumentBase64(d, business);
      await documentsApi.send(d.id, pdf);
      if (d.type === 'quote' && d.status === 'draft') upsert({ ...d, status: 'sent' });
      toast.success(`${d.number} envoyé sur WhatsApp`);
    } catch (e: any) { toast.error(e?.message ?? 'Envoi impossible'); }
    finally { setBusy(null); }
  };

  const toInvoice = async (d: CommercialDocument) => {
    setBusy(d.id);
    try {
      const inv = await documentsApi.toInvoice(d.id);
      upsert(inv);
      upsert({ ...d, status: 'accepted' });
      setTab('invoice');
      toast.success(`Facture ${inv.number} créée`);
    } catch (e: any) { toast.error(e?.message ?? 'Erreur'); }
    finally { setBusy(null); }
  };

  const setStatus = async (d: CommercialDocument, status: string) => {
    try { upsert(await documentsApi.update(d.id, { status })); }
    catch (e: any) { toast.error(e?.message ?? 'Erreur'); }
  };

  const remove = async () => {
    if (!deleteId) return;
    try { await documentsApi.remove(deleteId); setDocs(list => list.filter(d => d.id !== deleteId)); }
    catch { toast.error('Erreur lors de la suppression'); }
    setDeleteId(null);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Devis & factures</h1>
          <p className="text-xs sm:text-sm text-gray-500">Numérotés automatiquement, en PDF à votre nom</p>
        </div>
        <button onClick={() => setEditing('new')}
          className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3 sm:px-4 py-2.5 rounded-xl text-sm font-medium transition-colors shrink-0">
          <Plus size={16} /><span className="hidden sm:inline">{tab === 'quote' ? 'Nouveau devis' : 'Nouvelle facture'}</span>
        </button>
      </div>

      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {(['quote', 'invoice'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
            {t === 'quote' ? 'Devis' : 'Factures'} ({docs.filter(d => d.type === t).length})
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Chargement…</div>
      ) : shown.length === 0 ? (
        <div className="text-center py-12 text-gray-400 bg-white rounded-2xl border border-gray-100">
          <FileText size={28} className="mx-auto mb-2 text-gray-300" />
          <p className="text-sm">{tab === 'quote' ? 'Aucun devis' : 'Aucune facture'} pour l'instant</p>
        </div>
      ) : (
        <div className="space-y-2">
          {shown.map(d => {
            const st = STATUS[d.status] ?? STATUS.draft;
            return (
              <div key={d.id} className="bg-white rounded-2xl border border-gray-100 px-4 py-3">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-gray-900">{d.number}</span>
                      <select value={d.status} onChange={e => setStatus(d, e.target.value)}
                        className={`text-[11px] font-medium rounded-full px-2 py-0.5 border-0 outline-none cursor-pointer ${st.cls}`}>
                        {STATUSES_FOR[d.type].map(s => <option key={s} value={s}>{STATUS[s].label}</option>)}
                      </select>
                      {d.saleId && <span className="text-[10px] text-emerald-600 font-medium">✓ vente créée</span>}
                    </div>
                    <div className="text-sm text-gray-700 truncate">{d.customerName}</div>
                    <div className="text-xs text-gray-400">
                      {frDate(d.issueDate)}{d.dueDate ? ` · ${d.type === 'quote' ? 'valable jusqu\'au' : 'échéance'} ${frDate(d.dueDate)}` : ''}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-black text-gray-900">{fmt(d.total)}</div>
                    <div className="text-[11px] text-gray-400">{d.items.length} ligne{d.items.length > 1 ? 's' : ''}</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-3">
                  <button onClick={() => downloadDocument(d, business)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gray-100 text-gray-700 text-xs font-medium hover:bg-gray-200">
                    <Download size={13} /> PDF
                  </button>
                  <button onClick={() => send(d)} disabled={!d.customerPhone || busy === d.id}
                    title={d.customerPhone ? 'Envoyer le PDF par WhatsApp' : 'Ajoutez le numéro du client'}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-medium hover:bg-emerald-100 disabled:opacity-40">
                    <Send size={13} /> WhatsApp
                  </button>
                  {d.type === 'quote' && (
                    <button onClick={() => toInvoice(d)} disabled={busy === d.id}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-medium hover:bg-indigo-100 disabled:opacity-40">
                      <ArrowRightLeft size={13} /> En facture
                    </button>
                  )}
                  {!d.saleId && d.status !== 'cancelled' && d.status !== 'refused' && (
                    <button onClick={() => setSaleFor(d)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-50 text-amber-700 text-xs font-medium hover:bg-amber-100">
                      <ShoppingCart size={13} /> Enregistrer la vente
                    </button>
                  )}
                  <button onClick={() => setEditing(d)} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100" title="Modifier"><Edit2 size={14} /></button>
                  <button onClick={() => setDeleteId(d.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50" title="Supprimer"><Trash2 size={14} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <DocumentEditor
          type={editing === 'new' ? tab : editing.type}
          doc={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={d => { upsert(d); setEditing(null); toast.success(`${d.number} enregistré`); }}
        />
      )}

      {saleFor && (
        <Modal open onClose={() => setSaleFor(null)} title={`Enregistrer la vente — ${saleFor.number}`} size="sm">
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              Crée une vente de <b>{fmt(saleFor.total)}</b> pour {saleFor.customerName}. Les lignes liées à {words.oneItem} font sortir le stock.
            </p>
            {([
              ['paid', 'Payée', 'Le client a payé'],
              ['pending', 'En attente', 'Pas encore payée ni livrée'],
              ...(has('credit') ? [['credit', 'À crédit', 'Livrée, le client paiera plus tard']] : []),
            ] as Array<['paid' | 'pending' | 'credit', string, string]>).map(([status, label, hint]) => (
              <button key={status}
                onClick={async () => {
                  try {
                    await documentsApi.createSale(saleFor.id, status);
                    load();
                    salesApi.getAll().then(sales => useStore.setState({ sales })).catch(() => {});
                    productsApi.getAll().then(products => useStore.setState({ products })).catch(() => {});
                    toast.success('Vente enregistrée');
                    setSaleFor(null);
                  } catch (e: any) { toast.error(e?.message ?? 'Erreur'); }
                }}
                className="w-full text-left px-4 py-3 rounded-xl border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/40">
                <div className="text-sm font-semibold text-gray-900">{label}</div>
                <div className="text-xs text-gray-500">{hint}</div>
              </button>
            ))}
          </div>
        </Modal>
      )}

      <ConfirmDialog
        open={!!deleteId}
        title="Supprimer le document"
        message="Il sera définitivement supprimé. Son numéro ne sera pas réutilisé."
        onConfirm={remove}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}

// ── Editor ─────────────────────────────────────────────────────────────────────

function DocumentEditor({ type, doc, onClose, onSaved }: {
  type: DocumentType;
  doc: CommercialDocument | null;
  onClose: () => void;
  onSaved: (d: CommercialDocument) => void;
}) {
  const { words } = useSegment();
  const products = useStore(s => s.products);
  const { bizCurrency, fmt } = useCurrency();
  const [form, setForm] = useState({
    customerName: doc?.customerName ?? '',
    customerPhone: doc?.customerPhone ?? '',
    customerAddress: doc?.customerAddress ?? '',
    issueDate: doc?.issueDate.slice(0, 10) ?? todayIso(),
    dueDate: doc?.dueDate?.slice(0, 10) ?? (type === 'quote' ? plusDays(30) : ''),
    discount: doc?.discount ?? 0,
    taxRate: doc?.taxRate ?? 0,
    notes: doc?.notes ?? '',
  });
  const [lines, setLines] = useState<DocumentLine[]>(doc?.items ?? [{ productId: null, description: '', quantity: 1, unitPrice: 0 }]);
  const [saving, setSaving] = useState(false);
  const totals = documentTotals({ items: lines, discount: form.discount, taxRate: form.taxRate });

  // A product line follows its volume price as the quantity changes.
  const priced = (l: DocumentLine): DocumentLine => {
    const p = l.productId ? products.find(x => x.id === l.productId) : null;
    return p ? { ...l, unitPrice: tierPrice(p.sellingPrice, p.priceTiers, l.quantity) } : l;
  };
  const setLine = (i: number, patch: Partial<DocumentLine>, reprice = false) =>
    setLines(list => list.map((l, j) => j !== i ? l : reprice ? priced({ ...l, ...patch }) : { ...l, ...patch }));

  const save = async () => {
    if (!form.customerName.trim()) { toast.error('Nom du client requis'); return; }
    const items = lines.filter(l => l.description.trim() && l.quantity > 0);
    if (items.length === 0) { toast.error('Ajoutez au moins une ligne'); return; }
    setSaving(true);
    const body: DocumentInput = {
      type, ...form, items,
      customerPhone: form.customerPhone || undefined,
      customerAddress: form.customerAddress || undefined,
      notes: form.notes || undefined,
      dueDate: form.dueDate || null,
    };
    try { onSaved(doc ? await documentsApi.update(doc.id, body) : await documentsApi.create(body)); }
    catch (e: any) { toast.error(e?.message ?? 'Erreur'); }
    finally { setSaving(false); }
  };

  const input = 'w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-300';

  return (
    <Modal open onClose={() => !saving && onClose()} size="lg"
      title={doc ? `Modifier ${doc.number}` : type === 'quote' ? 'Nouveau devis' : 'Nouvelle facture'}>
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Client *</label>
            <input value={form.customerName} onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))} className={input} />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">WhatsApp</label>
            <input type="tel" value={form.customerPhone} onChange={e => setForm(f => ({ ...f, customerPhone: e.target.value }))} className={input} />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Adresse</label>
            <input value={form.customerAddress} onChange={e => setForm(f => ({ ...f, customerAddress: e.target.value }))} className={input} />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Date</label>
            <input type="date" value={form.issueDate} onChange={e => setForm(f => ({ ...f, issueDate: e.target.value }))} className={input} />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">{type === 'quote' ? 'Valable jusqu\'au' : 'À payer avant le'}</label>
            <input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} className={input} />
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-gray-700 mb-1.5">Lignes</p>
          <div className="space-y-2">
            {lines.map((l, i) => (
              <div key={i} className="grid grid-cols-12 gap-1.5 items-center">
                <select
                  value={l.productId ?? ''}
                  onChange={e => {
                    const p = products.find(x => x.id === e.target.value);
                    setLine(i, p ? { productId: p.id, description: p.name } : { productId: null }, true);
                  }}
                  className={`${input} col-span-12 sm:col-span-3 bg-white`}>
                  <option value="">Texte libre</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <input value={l.description} onChange={e => setLine(i, { description: e.target.value })} placeholder="Désignation"
                  className={`${input} col-span-12 sm:col-span-4`} />
                <NumberInput value={l.quantity} onChange={v => setLine(i, { quantity: v }, true)} className={`${input} col-span-3 sm:col-span-1 text-right`} />
                <NumberInput value={l.unitPrice} onChange={v => setLine(i, { unitPrice: v })} className={`${input} col-span-4 sm:col-span-2 text-right`} />
                <div className="col-span-4 sm:col-span-1 text-right text-xs font-medium text-gray-700 truncate">{fmt(l.quantity * l.unitPrice)}</div>
                <button type="button" onClick={() => setLines(list => list.filter((_, j) => j !== i))}
                  className="col-span-1 p-1 text-gray-400 hover:text-red-500 justify-self-end"><X size={14} /></button>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setLines(list => [...list, { productId: null, description: '', quantity: 1, unitPrice: 0 }])}
            className="text-xs font-medium text-indigo-600 mt-2">+ Ajouter une ligne</button>
          <p className="text-[11px] text-gray-400 mt-1">Prix en {bizCurrency}. Une ligne liée à {words.oneItem} applique automatiquement ses prix dégressifs.</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Remise ({bizCurrency})</label>
            <NumberInput value={form.discount} onChange={v => setForm(f => ({ ...f, discount: v }))} className={input} />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">TVA (%)</label>
            <NumberInput value={form.taxRate} onChange={v => setForm(f => ({ ...f, taxRate: Math.min(100, v) }))} className={input} />
          </div>
          <div className="col-span-2 text-right text-sm space-y-0.5">
            <div className="text-gray-500">Sous-total : {fmt(totals.subtotal)}</div>
            {totals.tax > 0 && <div className="text-gray-500">TVA : {fmt(totals.tax)}</div>}
            <div className="font-black text-gray-900">Total : {fmt(totals.total)}</div>
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-gray-600 mb-1 block">Notes (conditions, délai, coordonnées de paiement…)</label>
          <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} className={input} />
        </div>

        <div className="flex gap-3 pt-1">
          <Button variant="secondary" onClick={onClose} className="flex-1" disabled={saving}>Annuler</Button>
          <Button onClick={save} loading={saving} className="flex-1">Enregistrer</Button>
        </div>
      </div>
    </Modal>
  );
}
