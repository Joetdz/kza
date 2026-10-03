import { useState, useMemo, useEffect } from 'react';
import { Plus, Trash2, Edit2, Check, Repeat, Pause, Play } from 'lucide-react';
import { useStore } from '../store/useStore';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { NumberInput } from '../components/ui/NumberInput';
import { ListSkeleton } from '../components/ui/Skeleton';
import { useCurrency } from '../hooks/useCurrency';
import { formatDate, EXPENSE_LABELS, EXPENSE_COLORS, SALE_CHANNELS } from '../utils/formatters';
import { recurringExpensesApi } from '../api';
import type { Expense, ExpenseCategory, SaleChannel, RecurringExpense } from '../types';

// The 4 built-in categories, always shown first. Not exhaustive anymore — a business
// can add its own on top of these (see customCategories below); category is free text
// end to end (shared schema, API DTO, DB column).
const BUILT_IN_CATEGORIES: ExpenseCategory[] = ['pub', 'transport', 'stock', 'other'];
const NEW_CATEGORY = '__new__';

const CAT_BADGE: Record<string, 'indigo' | 'amber' | 'green' | 'gray'> = {
  pub: 'indigo',
  transport: 'amber',
  stock: 'green',
  other: 'gray',
};
const catLabel = (cat: string) => EXPENSE_LABELS[cat] ?? cat;
const catColor = (cat: string) => EXPENSE_COLORS[cat] ?? '#94a3b8';
const catBadge = (cat: string): 'indigo' | 'amber' | 'green' | 'gray' => CAT_BADGE[cat] ?? 'gray';

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
  const [newCategoryName, setNewCategoryName] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);

  // ─── Recurring expenses (salaires, loyers, créances...) ─────────────────────
  const [recurring, setRecurring] = useState<RecurringExpense[]>([]);
  const [recurringLoading, setRecurringLoading] = useState(true);
  const [recurringModalOpen, setRecurringModalOpen] = useState(false);
  const [editingRecurring, setEditingRecurring] = useState<RecurringExpense | null>(null);
  const [deleteRecurringId, setDeleteRecurringId] = useState<string | null>(null);
  const [recurringForm, setRecurringForm] = useState({
    category: 'other' as string,
    description: '',
    amount: 0,
    frequency: 'monthly' as string,
    dayOfWeek: 1,   // Lundi par défaut
    dayOfMonth: 1,
    month: 1,       // Janvier par défaut
    startDate: new Date().toISOString().split('T')[0],
    endDate: '',
  });

  useEffect(() => {
    recurringExpensesApi.getAll()
      .then(setRecurring)
      .catch(() => {})
      .finally(() => setRecurringLoading(false));
  }, []);

  const openAddRecurring = () => {
    setEditingRecurring(null);
    setRecurringForm({
      category: 'other', description: '', amount: 0,
      frequency: 'monthly', dayOfWeek: 1, dayOfMonth: 1, month: 1,
      startDate: new Date().toISOString().split('T')[0], endDate: '',
    });
    setRecurringModalOpen(true);
  };

  const openEditRecurring = (r: RecurringExpense) => {
    setEditingRecurring(r);
    setRecurringForm({
      category: r.category,
      description: r.description,
      amount: r.amount,
      frequency: r.frequency,
      dayOfWeek: r.dayOfWeek ?? 1,
      dayOfMonth: r.dayOfMonth ?? 1,
      month: r.month ?? 1,
      startDate: r.startDate.slice(0, 10),
      endDate: r.endDate ? r.endDate.slice(0, 10) : '',
    });
    setRecurringModalOpen(true);
  };

  const handleSaveRecurring = async () => {
    if (!recurringForm.amount || !recurringForm.category.trim()) return;
    setSubmitting(true);
    try {
      const payload = {
        category: recurringForm.category,
        description: recurringForm.description,
        amount: recurringForm.amount,
        frequency: recurringForm.frequency,
        ...(recurringForm.frequency === 'weekly' ? { dayOfWeek: recurringForm.dayOfWeek } : {}),
        ...(recurringForm.frequency === 'monthly' || recurringForm.frequency === 'annual' ? { dayOfMonth: recurringForm.dayOfMonth } : {}),
        ...(recurringForm.frequency === 'annual' ? { month: recurringForm.month } : {}),
        startDate: recurringForm.startDate,
        endDate: recurringForm.endDate || undefined,
      };
      if (editingRecurring) {
        const updated = await recurringExpensesApi.update(editingRecurring.id, payload as any);
        setRecurring(prev => prev.map(r => r.id === updated.id ? updated : r));
      } else {
        const created = await recurringExpensesApi.create(payload as any);
        setRecurring(prev => [created, ...prev]);
      }
      setRecurringModalOpen(false);
    } catch (e: any) {
      alert('Erreur : ' + (e?.message ?? 'Impossible de sauvegarder'));
    } finally {
      setSubmitting(false);
    }
  };

  const toggleRecurringActive = async (r: RecurringExpense) => {
    try {
      const updated = await recurringExpensesApi.update(r.id, { active: !r.active });
      setRecurring(prev => prev.map(x => x.id === updated.id ? updated : x));
    } catch (e: any) {
      alert('Erreur : ' + (e?.message ?? 'Impossible de mettre à jour'));
    }
  };

  const handleDeleteRecurring = async () => {
    if (!deleteRecurringId) return;
    try {
      await recurringExpensesApi.remove(deleteRecurringId);
      setRecurring(prev => prev.filter(r => r.id !== deleteRecurringId));
    } catch (e: any) {
      alert('Erreur : ' + (e?.message ?? 'Impossible de supprimer'));
    } finally {
      setDeleteRecurringId(null);
    }
  };

  // Mirrors the backend's bucket key per frequency (see RecurringExpenseService) — just
  // for the "Généré cette période" badge, not for deciding whether to generate anything.
  const currentPeriodKey = (freq: string) => {
    const now = new Date();
    const iso = now.toISOString();
    if (freq === 'annual') return iso.slice(0, 4);
    if (freq === 'monthly') return iso.slice(0, 7);
    return iso.slice(0, 10); // daily & weekly
  };

  const WEEKDAY_LABELS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const MONTH_NAMES = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const scheduleLabel = (r: RecurringExpense) => {
    switch (r.frequency) {
      case 'daily': return 'Chaque jour';
      case 'weekly': return `Chaque ${WEEKDAY_LABELS[r.dayOfWeek ?? 1]}`;
      case 'annual': return `Le ${r.dayOfMonth ?? 1} ${MONTH_NAMES[(r.month ?? 1) - 1]}, chaque année`;
      case 'monthly':
      default: return `Le ${r.dayOfMonth ?? 1} de chaque mois`;
    }
  };

  // Built-ins first, then whatever custom category names already exist on this
  // business's own expenses — no separate table, category is just a string on Expense.
  const allCategories = useMemo(() => {
    const custom = [...new Set(expenses.map(e => e.category))]
      .filter(c => !BUILT_IN_CATEGORIES.includes(c as ExpenseCategory))
      .sort((a, b) => a.localeCompare(b));
    return [...BUILT_IN_CATEGORIES, ...custom];
  }, [expenses]);

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm());
    setSelectedProductIds([]);
    setAddingCategory(false);
    setModalOpen(true);
  };

  const openEdit = (e: Expense) => {
    setEditing(e);
    setAddingCategory(false);
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
    if (!form.amount || !form.description || !form.category.trim()) return;
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
    <div className="space-y-5 overflow-x-hidden">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 truncate">Suivi des Dépenses</h1>
          <p className="text-xs sm:text-sm text-gray-500 truncate">{expenses.length} dépenses · {MAD(total)} total</p>
        </div>
        <button
          onClick={openAdd}
          className="shrink-0 flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3 sm:px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
        >
          <Plus size={16} /><span className="hidden sm:inline">Ajouter</span>
        </button>
      </div>

      {/* Recurring expenses — salaires, loyers, créances... auto-posted monthly */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Repeat size={16} className="text-indigo-500" />
            <h2 className="font-semibold text-gray-900 text-sm">Dépenses récurrentes</h2>
            <span className="text-xs text-gray-400">salaires, loyers, créances...</span>
          </div>
          <button
            onClick={openAddRecurring}
            className="flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors"
          >
            <Plus size={14} /> Nouvelle récurrente
          </button>
        </div>

        {recurringLoading ? (
          <p className="text-xs text-gray-400 py-2">Chargement...</p>
        ) : recurring.length === 0 ? (
          <p className="text-xs text-gray-400 py-2">Aucune dépense récurrente — ajoute un salaire, un loyer ou un remboursement pour qu'il se crée automatiquement (journalier, hebdo, mensuel ou annuel).</p>
        ) : (
          <div className="space-y-1.5">
            {recurring.map(r => {
              const generatedThisPeriod = r.lastGeneratedPeriod === currentPeriodKey(r.frequency);
              return (
                <div key={r.id} className={`flex items-center gap-3 p-2.5 rounded-xl ${r.active ? 'bg-gray-50' : 'bg-gray-50 opacity-50'}`}>
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: catColor(r.category) }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-800">{catLabel(r.category)}</span>
                      {r.description && <span className="text-xs text-gray-400 truncate">{r.description}</span>}
                      {!r.active && <Badge color="gray" size="sm">En pause</Badge>}
                      {r.active && generatedThisPeriod && <Badge color="green" size="sm">Généré</Badge>}
                    </div>
                    <div className="text-xs text-gray-400">{scheduleLabel(r)}{r.endDate ? ` · jusqu'au ${formatDate(r.endDate)}` : ''}</div>
                  </div>
                  <div className="text-sm font-bold text-gray-900 shrink-0">{MAD(r.amount)}</div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => toggleRecurringActive(r)} className="p-1.5 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200" title={r.active ? 'Mettre en pause' : 'Réactiver'}>
                      {r.active ? <Pause size={12} /> : <Play size={12} />}
                    </button>
                    <button onClick={() => openEditRecurring(r)} className="p-1.5 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200">
                      <Edit2 size={12} />
                    </button>
                    <button onClick={() => setDeleteRecurringId(r.id)} className="p-1.5 rounded-lg bg-red-50 text-red-400 hover:bg-red-100">
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Category summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {allCategories.map(cat => (
          <button
            key={cat}
            onClick={() => setCatFilter(catFilter === cat ? '' : cat)}
            className={`text-left p-4 rounded-2xl border transition-all ${catFilter === cat ? 'ring-2 ring-indigo-400' : ''}`}
            style={{ borderColor: catFilter === cat ? catColor(cat) : '#e5e7eb', backgroundColor: catFilter === cat ? `${catColor(cat)}15` : '#fff' }}
          >
            <div className="text-xs font-medium text-gray-500 mb-1">{catLabel(cat)}</div>
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
            <div className="text-sm text-gray-500">Filtre: <strong>{catLabel(catFilter)}</strong></div>
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
                style={{ backgroundColor: catColor(e.category) }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <Badge color={catBadge(e.category)} size="sm">{catLabel(e.category)}</Badge>
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
                value={addingCategory ? NEW_CATEGORY : form.category}
                onChange={e => {
                  const v = e.target.value;
                  if (v === NEW_CATEGORY) {
                    setAddingCategory(true);
                    setNewCategoryName('');
                    setForm(f => ({ ...f, category: '' }));
                  } else {
                    setAddingCategory(false);
                    setForm(f => ({ ...f, category: v }));
                  }
                }}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300"
              >
                {allCategories.map(c => <option key={c} value={c}>{catLabel(c)}</option>)}
                <option value={NEW_CATEGORY}>+ Nouvelle catégorie...</option>
              </select>
              {addingCategory && (
                <input
                  type="text"
                  autoFocus
                  value={newCategoryName}
                  onChange={e => {
                    const v = e.target.value;
                    setNewCategoryName(v);
                    setForm(f => ({ ...f, category: v.trim() }));
                  }}
                  placeholder="Nom de la catégorie..."
                  className="mt-2 w-full border border-indigo-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300"
                />
              )}
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

      {/* Recurring expense modal */}
      <Modal open={recurringModalOpen} onClose={() => setRecurringModalOpen(false)} title={editingRecurring ? 'Modifier la dépense récurrente' : 'Nouvelle dépense récurrente'} size="md">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Catégorie *</label>
              <select
                value={recurringForm.category}
                onChange={e => setRecurringForm(f => ({ ...f, category: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300"
              >
                {allCategories.map(c => <option key={c} value={c}>{catLabel(c)}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Montant ({currency}) *</label>
              <NumberInput
                value={recurringForm.amount}
                onChange={val => setRecurringForm(f => ({ ...f, amount: val }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Échéance *</label>
              <select
                value={recurringForm.frequency}
                onChange={e => setRecurringForm(f => ({ ...f, frequency: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300"
              >
                <option value="daily">Journalière</option>
                <option value="weekly">Hebdomadaire</option>
                <option value="monthly">Mensuelle</option>
                <option value="annual">Annuelle</option>
              </select>
            </div>

            {recurringForm.frequency === 'weekly' && (
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Jour de la semaine *</label>
                <select
                  value={recurringForm.dayOfWeek}
                  onChange={e => setRecurringForm(f => ({ ...f, dayOfWeek: +e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300"
                >
                  {WEEKDAY_LABELS.map((d, i) => <option key={i} value={i}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>)}
                </select>
              </div>
            )}

            {recurringForm.frequency === 'annual' && (
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Mois *</label>
                <select
                  value={recurringForm.month}
                  onChange={e => setRecurringForm(f => ({ ...f, month: +e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300"
                >
                  {MONTH_NAMES.map((m, i) => <option key={i} value={i + 1}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
                </select>
              </div>
            )}

            {(recurringForm.frequency === 'monthly' || recurringForm.frequency === 'annual') && (
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Jour du mois *</label>
                <input
                  type="number" min={1} max={28}
                  value={recurringForm.dayOfMonth}
                  onChange={e => setRecurringForm(f => ({ ...f, dayOfMonth: Math.min(28, Math.max(1, +e.target.value)) }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300"
                />
                <div className="text-xs text-gray-400 mt-1">1 à 28 — pour tomber dans tous les mois</div>
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Début *</label>
              <input
                type="date"
                value={recurringForm.startDate}
                onChange={e => setRecurringForm(f => ({ ...f, startDate: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Fin (optionnel)</label>
              <input
                type="date"
                value={recurringForm.endDate}
                onChange={e => setRecurringForm(f => ({ ...f, endDate: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300"
              />
              <div className="text-xs text-gray-400 mt-1">Ex: fin d'un remboursement de créance</div>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Description</label>
            <input
              type="text"
              value={recurringForm.description}
              onChange={e => setRecurringForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Ex: Salaire — Jean Mbuyi"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="secondary" onClick={() => setRecurringModalOpen(false)} className="flex-1" disabled={submitting}>Annuler</Button>
            <Button onClick={handleSaveRecurring} loading={submitting} className="flex-1">
              {editingRecurring ? 'Enregistrer' : 'Créer'}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteRecurringId}
        title="Supprimer la dépense récurrente"
        message="Elle ne se générera plus les mois suivants. Les dépenses déjà créées restent intactes."
        onConfirm={handleDeleteRecurring}
        onCancel={() => setDeleteRecurringId(null)}
      />
    </div>
  );
}
