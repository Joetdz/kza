import { useState, useMemo } from 'react';
import { Plus, Trash2, Edit2, Check } from 'lucide-react';
import { useStore } from '../store/useStore';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { NumberInput } from '../components/ui/NumberInput';
import { ListSkeleton } from '../components/ui/Skeleton';
import { useCurrency } from '../hooks/useCurrency';
import { formatDate, EXPENSE_LABELS, EXPENSE_COLORS, SALE_CHANNELS } from '../utils/formatters';
import type { Expense, ExpenseCategory, SaleChannel } from '../types';

const CATEGORIES: ExpenseCategory[] = ['pub', 'transport', 'stock', 'other'];

const CAT_BADGE: Record<ExpenseCategory, 'indigo' | 'amber' | 'green' | 'gray'> = {
  pub: 'indigo',
  transport: 'amber',
  stock: 'green',
  other: 'gray',
};

interface FormState {
  category: ExpenseCategory;
  amount: number;
  description: string;
  date: string;
  channel?: string;
  productId?: string;
}

function emptyForm(): FormState {
  return {
    category: 'pub',
    amount: 0,
    description: '',
    date: new Date().toISOString().split('T')[0],
  };
}

export function Expenses() {
  const { products, expenses, loading, addExpense, updateExpense, deleteExpense } = useStore();
  const { fmt: MAD, currency } = useCurrency();
  const [submitting, setSubmitting] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [catFilter, setCatFilter] = useState<string>('');
  const [form, setForm] = useState<FormState>(emptyForm());
  // Multi-product selection (only for new expenses, not editing)
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm());
    setSelectedProductIds([]);
    setModalOpen(true);
  };

  const openEdit = (e: Expense) => {
    setEditing(e);
    setForm({
      category: e.category,
      productId: e.productId,
      channel: e.channel,
      amount: e.amount,
      description: e.description,
      date: e.date,
    });
    setSelectedProductIds(e.productId ? [e.productId] : []);
    setModalOpen(true);
  };

  const toggleProduct = (id: string) => {
    setSelectedProductIds(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  const perProductAmount = selectedProductIds.length > 1
    ? form.amount / selectedProductIds.length
    : form.amount;

  const handleSave = async () => {
    if (!form.amount || !form.description) return;
    setSubmitting(true);
    try {
    if (editing) {
      // Edition : on garde le productId simple
      const patch: Partial<Expense> = {
        category: form.category,
        amount: form.amount,
        description: form.description,
        date: form.date,
        channel:  form.channel as "WhatsApp" | "Meta Ads" | "TikTok" | "Instagram" | "Boutique" | "Autre" | undefined,
        productId: selectedProductIds[0] ?? undefined,
      };
      updateExpense(editing.id, patch);
    } else {
      // Création : une dépense par produit sélectionné (montant réparti)
      const productIds = selectedProductIds.length > 0 ? selectedProductIds : [undefined];
      for (const pid of productIds) {
        await addExpense({
          category: form.category,
          amount: productIds.length > 1 ? perProductAmount : form.amount,
          description: form.description,
          date: form.date,
          ...(form.channel ? { channel: form.channel } : {}),
          ...(pid ? { productId: pid } : {}),
        } as Omit<Expense, 'id' | 'createdAt'>);
      }
    }
    setModalOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = useMemo(() =>
    expenses
      .filter(e => !catFilter || e.category === catFilter)
      .sort((a, b) => b.date.localeCompare(a.date)),
    [expenses, catFilter]
  );

  const catSummary = useMemo(() => {
    const map: Record<string, number> = {};
    expenses.forEach(e => { map[e.category] = (map[e.category] || 0) + Number(e.amount); });
    return map;
  }, [expenses]);

  const total = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const filteredTotal = filtered.reduce((s, e) => s + Number(e.amount), 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Suivi des Dépenses</h1>
          <p className="text-sm text-gray-500">{expenses.length} dépenses · {MAD(total)} total</p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
        >
          <Plus size={16} /> Ajouter
        </button>
      </div>

      {/* Category summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => setCatFilter(catFilter === cat ? '' : cat)}
            className={`text-left p-4 rounded-2xl border transition-all ${catFilter === cat ? 'ring-2 ring-indigo-400' : ''}`}
            style={{ borderColor: catFilter === cat ? EXPENSE_COLORS[cat] : '#e5e7eb', backgroundColor: catFilter === cat ? `${EXPENSE_COLORS[cat]}15` : '#fff' }}
          >
            <div className="text-xs font-medium text-gray-500 mb-1">{EXPENSE_LABELS[cat]}</div>
            <div className="text-xl font-bold text-gray-900">{MAD(catSummary[cat] ?? 0)}</div>
            <div className="text-xs text-gray-400 mt-1">
              {expenses.filter(e => e.category === cat).length} entrées
            </div>
          </button>
        ))}
      </div>

      {/* List */}
      <div className="space-y-2">
        {loading && expenses.length === 0 && <ListSkeleton count={4} />}
        {catFilter && (
          <div className="flex items-center justify-between px-1">
            <div className="text-sm text-gray-500">Filtre: <strong>{EXPENSE_LABELS[catFilter as ExpenseCategory]}</strong></div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold">{MAD(filteredTotal)}</span>
              <button onClick={() => setCatFilter('')} className="text-xs text-indigo-600 hover:underline">Effacer</button>
            </div>
          </div>
        )}

        {filtered.map(e => {
          const product = products.find(p => p.id === e.productId);
          return (
            <div key={e.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-center gap-3">
              <div
                className="w-2 rounded-full self-stretch"
                style={{ backgroundColor: EXPENSE_COLORS[e.category] }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <Badge color={CAT_BADGE[e.category]} size="sm">{EXPENSE_LABELS[e.category]}</Badge>
                  {e.channel && <Badge color="gray" size="sm">{e.channel}</Badge>}
                  {product && <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{product.name}</span>}
                </div>
                <div className="text-sm text-gray-800">{e.description}</div>
                <div className="text-xs text-gray-400 mt-0.5">{formatDate(e.date)}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-lg font-bold text-gray-900">{MAD(Number(e.amount))}</div>
                <div className="flex gap-1 mt-1 justify-end">
                  <button onClick={() => openEdit(e)} className="p-1.5 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200">
                    <Edit2 size={12} />
                  </button>
                  <button onClick={() => setDeleteId(e.id)} className="p-1.5 rounded-lg bg-red-50 text-red-400 hover:bg-red-100">
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <p className="text-lg">Aucune dépense trouvée</p>
            <p className="text-sm mt-1">Enregistrez vos premières dépenses</p>
          </div>
        )}
      </div>

      {/* Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Modifier la dépense' : 'Nouvelle dépense'} size="md">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Catégorie *</label>
              <select
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value as ExpenseCategory }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300"
              >
                {CATEGORIES.map(c => <option key={c} value={c}>{EXPENSE_LABELS[c]}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Montant total ({currency}) *</label>
              <NumberInput
                value={form.amount}
                onChange={val => setForm(f => ({ ...f, amount: val }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Date *</label>
              <input
                type="date"
                value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>
            {form.category === 'pub' && (
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Canal pub</label>
                <select
                  value={form.channel ?? ''}
                  onChange={e => setForm(f => ({ ...f, channel: e.target.value || undefined }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300"
                >
                  <option value="">—</option>
                  {SALE_CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Description *</label>
            <input
              type="text"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Ex: Campagne Meta Ads Nike AF1..."
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>

          {/* Product multi-selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-600">
                Produits associés
                {selectedProductIds.length > 1 && (
                  <span className="ml-2 text-indigo-600 font-semibold">
                    → {MAD(perProductAmount)}/produit
                  </span>
                )}
              </label>
              {selectedProductIds.length > 0 && (
                <button
                  onClick={() => setSelectedProductIds([])}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  Tout désélectionner
                </button>
              )}
            </div>
            <div className="max-h-40 overflow-y-auto space-y-1 border border-gray-200 rounded-xl p-2">
              {products.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-2">Aucun produit</p>
              )}
              {products.map(p => {
                const selected = selectedProductIds.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggleProduct(p.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors text-left ${
                      selected ? 'bg-indigo-50 text-indigo-800' : 'hover:bg-gray-50 text-gray-700'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                      selected ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300'
                    }`}>
                      {selected && <Check size={10} className="text-white" />}
                    </div>
                    <span className="flex-1 truncate">{p.name}</span>
                    <span className="text-xs text-gray-400">{p.sku}</span>
                  </button>
                );
              })}
            </div>
            {selectedProductIds.length > 1 && (
              <p className="text-xs text-indigo-600 mt-1">
                {selectedProductIds.length} produits sélectionnés — {MAD(form.amount)} réparti en parts égales
              </p>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)} className="flex-1" disabled={submitting}>Annuler</Button>
            <Button onClick={handleSave} loading={submitting} className="flex-1">
              {editing ? 'Enregistrer' : selectedProductIds.length > 1 ? `Créer ${selectedProductIds.length} dépenses` : 'Ajouter'}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteId}
        title="Supprimer la dépense"
        message="Cette dépense sera définitivement supprimée."
        onConfirm={() => { if (deleteId) deleteExpense(deleteId); setDeleteId(null); }}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
