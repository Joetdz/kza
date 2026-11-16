import { useState, useMemo, useEffect } from 'react';
import { Plus, Trash2, Edit2, Check, Repeat, Pause, Play, ChevronDown, List, LayoutList } from 'lucide-react';
import { format, startOfMonth, endOfMonth, subMonths, startOfYear, subDays } from 'date-fns';
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
import { treasuryApi, fmtMoney, accountLabel, type TreasuryAccount } from '../api/treasury';
import { PageHeader, Fab } from '../components/ui/Page';
import { useSegment } from '../hooks/useSegment';
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
  /** Paid from this treasury account: the expense is one of its outflows. */
  treasuryAccountId?: string;
}

const ymd = (d: Date) => format(d, 'yyyy-MM-dd');

// Quick periods: they set the app's date range (the header's two dates), the one the
// dashboard and analytics read too.
const PERIODS: { key: string; label: string; range: () => [string, string] }[] = [
  { key: 'month', label: 'Ce mois', range: () => [ymd(startOfMonth(new Date())), ymd(new Date())] },
  { key: 'last-month', label: 'Mois dernier', range: () => {
    const last = subMonths(new Date(), 1);
    return [ymd(startOfMonth(last)), ymd(endOfMonth(last))];
  } },
  { key: '30d', label: '30 jours', range: () => [ymd(subDays(new Date(), 29)), ymd(new Date())] },
  { key: '3m', label: '3 mois', range: () => [ymd(startOfMonth(subMonths(new Date(), 2))), ymd(new Date())] },
  { key: 'year', label: 'Cette année', range: () => [ymd(startOfYear(new Date())), ymd(new Date())] },
  { key: 'all', label: 'Tout', range: () => ['2000-01-01', ymd(new Date())] },
];

const VIEW_KEY = 'kza_expenses_view';
/** The treasury account the last expense was paid from, on this device. */
const LAST_ACCOUNT_KEY = 'kza_expense_account';

/**
 * What the page shows as one expense. An expense split between several products is
 * stored as one expense per product; its parts are shown together again, summed.
 */
interface ExpenseEntry {
  key: string;
  parts: Expense[];
  amount: number;
  category: string;
  description: string;
  date: string;
  channel?: string;
}

/** The parts of one split are created together, seconds apart. */
const SPLIT_WINDOW_MS = 2 * 60_000;

function mergeSplits(list: Expense[]): ExpenseEntry[] {
  const entries: ExpenseEntry[] = [];
  const open = new Map<string, { entry: ExpenseEntry; at: number }>();
  const byCreation = [...list].sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));
  for (const e of byCreation) {
    const at = e.createdAt ? new Date(e.createdAt).getTime() : NaN;
    const splitKey = `${e.category}|${e.description}|${e.date.slice(0, 10)}|${e.channel ?? ''}`;
    const current = e.productId && Number.isFinite(at) ? open.get(splitKey) : undefined;
    // Same expense, another product, made at the same moment: one more part.
    if (current && at - current.at <= SPLIT_WINDOW_MS && !current.entry.parts.some(p => p.productId === e.productId)) {
      current.entry.parts.push(e);
      current.entry.amount += Number(e.amount);
      current.at = at;
      continue;
    }
    const entry: ExpenseEntry = {
      key: e.id, parts: [e], amount: Number(e.amount),
      category: e.category, description: e.description, date: e.date, channel: e.channel,
    };
    entries.push(entry);
    if (e.productId && Number.isFinite(at)) open.set(splitKey, { entry, at });
  }
  return entries.sort((a, b) => b.date.localeCompare(a.date));
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
  const { terms, words } = useSegment();
  const { products, expenses, loading, addExpense, updateExpense, deleteExpense, dateRange, setDateRange } = useStore();
  const { from, to } = dateRange;
  // « Par catégorie » or the plain list, remembered on this device.
  const [view, setView] = useState<'grouped' | 'list'>(() => {
    try { return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grouped'; } catch { return 'grouped'; }
  });
  const chooseView = (v: 'grouped' | 'list') => {
    setView(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* ignore */ }
  };
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const toggleGroup = (cat: string) => setOpenGroups(s => {
    const next = new Set(s);
    next.has(cat) ? next.delete(cat) : next.add(cat);
    return next;
  });
  const { fmt: MAD, currency, bizCurrency } = useCurrency();
  // The treasury accounts an expense can be paid from: those in the business's currency.
  const [accounts, setAccounts] = useState<TreasuryAccount[] | null>(null);
  useEffect(() => {
    treasuryApi.accounts()
      .then(list => setAccounts(list.filter(a => !a.archived && a.currency === bizCurrency)))
      .catch(() => setAccounts([]));
  }, [bizCurrency]);
  /** The account a new expense starts on: the last one used on this device, else the first. */
  const defaultAccountId = () => {
    let last: string | null = null;
    try { last = localStorage.getItem(LAST_ACCOUNT_KEY); } catch { /* ignore */ }
    return (accounts ?? []).find(a => a.id === last)?.id ?? accounts?.[0]?.id;
  };
  const rememberAccount = (id?: string) => {
    try { if (id) localStorage.setItem(LAST_ACCOUNT_KEY, id); } catch { /* ignore */ }
  };
  const [submitting, setSubmitting] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  /** The parts of the expense being edited or deleted: one, or all of a split. */
  const [editing, setEditing] = useState<Expense[] | null>(null);
  const [deleting, setDeleting] = useState<Expense[] | null>(null);
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
    treasuryAccountId: undefined as string | undefined,
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
      treasuryAccountId: defaultAccountId(),
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
      treasuryAccountId: r.treasuryAccountId ?? undefined,
    });
    setRecurringModalOpen(true);
  };

  const handleSaveRecurring = async () => {
    if (!recurringForm.amount || !recurringForm.category.trim() || !recurringForm.treasuryAccountId) return;
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
        treasuryAccountId: recurringForm.treasuryAccountId,
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
    setForm({ ...emptyForm(), treasuryAccountId: defaultAccountId() });
    setSelectedProductIds([]);
    setAddingCategory(false);
    setModalOpen(true);
  };

  // A split opens as one expense: its total, all its products.
  const openEdit = (entry: ExpenseEntry) => {
    const first = entry.parts[0];
    setEditing(entry.parts);
    setAddingCategory(false);
    setForm({
      category: first.category,
      productId: first.productId,
      channel: first.channel,
      amount: entry.amount,
      description: first.description,
      date: first.date,
      treasuryAccountId: first.treasuryAccountId ?? undefined,
    });
    setSelectedProductIds(entry.parts.map(p => p.productId).filter((id): id is string => !!id));
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
    if (!form.amount || !form.description || !form.category.trim() || !form.treasuryAccountId) return;
    rememberAccount(form.treasuryAccountId);
    setSubmitting(true);
    try {
    if (editing) {
      // Edition : the parts follow the products chosen, the total split again in equal shares.
      const base: Partial<Expense> = {
        category: form.category,
        description: form.description,
        date: form.date,
        channel:  form.channel as "WhatsApp" | "Meta Ads" | "TikTok" | "Instagram" | "Boutique" | "Autre" | undefined,
        treasuryAccountId: form.treasuryAccountId || null,
      };
      const ids = selectedProductIds;
      if (ids.length <= 1) {
        await updateExpense(editing[0].id, { ...base, amount: form.amount, productId: ids[0] ?? undefined });
        for (const part of editing.slice(1)) await deleteExpense(part.id);
      } else {
        const share = form.amount / ids.length;
        const kept = new Map(editing.filter(p => p.productId && ids.includes(p.productId)).map(p => [p.productId!, p]));
        // Parts whose product was taken off serve the products added, before any new one.
        const spare = editing.filter(p => !p.productId || !ids.includes(p.productId));
        for (const id of ids) {
          const part = kept.get(id) ?? spare.shift();
          if (part) await updateExpense(part.id, { ...base, amount: share, productId: id });
          else await addExpense({ ...base, amount: share, productId: id } as Omit<Expense, 'id' | 'createdAt'>);
        }
        for (const part of spare) await deleteExpense(part.id);
      }
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
          ...(form.treasuryAccountId ? { treasuryAccountId: form.treasuryAccountId } : {}),
        } as Omit<Expense, 'id' | 'createdAt'>);
      }
    }
    setModalOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  // The period first: every figure on the page is the period's.
  const inPeriod = useMemo(
    () => expenses.filter(e => e.date.slice(0, 10) >= from && e.date.slice(0, 10) <= to),
    [expenses, from, to],
  );

  // Splits shown as one expense from here on: counts, lists and groups are of entries.
  const entries = useMemo(() => mergeSplits(inPeriod), [inPeriod]);

  const filtered = useMemo(
    () => entries.filter(e => !catFilter || e.category === catFilter),
    [entries, catFilter]
  );

  const catSummary = useMemo(() => {
    const map: Record<string, { total: number; count: number }> = {};
    entries.forEach(e => {
      const c = (map[e.category] ??= { total: 0, count: 0 });
      c.total += e.amount;
      c.count += 1;
    });
    return map;
  }, [entries]);

  const total = entries.reduce((s, e) => s + e.amount, 0);
  const filteredTotal = filtered.reduce((s, e) => s + e.amount, 0);

  // « Par catégorie » : the categories of the period, the biggest first, each with its lines.
  const groups = useMemo(() => {
    const byCat = new Map<string, ExpenseEntry[]>();
    filtered.forEach(e => byCat.set(e.category, [...(byCat.get(e.category) ?? []), e]));
    return [...byCat.entries()]
      .map(([cat, items]) => ({ cat, items, total: items.reduce((s, e) => s + e.amount, 0) }))
      .sort((a, b) => b.total - a.total);
  }, [filtered]);

  const activePeriod = PERIODS.find(p => {
    const [f, t] = p.range();
    return f === from && t === to;
  })?.key;
  const periodText = from <= '2000-01-01' ? "Depuis le début" : `Du ${formatDate(from)} au ${formatDate(to)}`;

  const renderExpense = (e: ExpenseEntry) => {
    const named = e.parts
      .map(p => products.find(x => x.id === p.productId)?.name)
      .filter((n): n is string => !!n);
    const split = e.parts.length > 1;
    return (
      <div key={e.key} className="card p-4 flex items-center gap-3">
        <div
          className="w-2 rounded-full self-stretch"
          style={{ backgroundColor: catColor(e.category) }}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <Badge color={catBadge(e.category)} size="sm">{catLabel(e.category)}</Badge>
            {e.channel && <Badge color="gray" size="sm">{e.channel}</Badge>}
            {!split && named[0] && <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{named[0]}</span>}
            {split && (
              <span className="text-xs text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full" title={named.join(', ')}>
                {e.parts.length} {terms.items}
              </span>
            )}
          </div>
          <div className="text-sm text-gray-800">{e.description}</div>
          {split && (
            <div className="text-xs text-gray-500 mt-0.5 truncate" title={named.join(', ')}>
              {named.slice(0, 3).join(', ')}{named.length > 3 ? ` +${named.length - 3}` : ''}
              {' · '}{MAD(e.amount / e.parts.length)}/{terms.item}
            </div>
          )}
          <div className="text-xs text-gray-400 mt-0.5">{formatDate(e.date)}</div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-lg font-bold text-gray-900">{MAD(e.amount)}</div>
          <div className="flex gap-1 mt-1 justify-end">
            <button onClick={() => openEdit(e)} className="p-1.5 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200">
              <Edit2 size={12} />
            </button>
            <button onClick={() => setDeleting(e.parts)} className="p-1.5 rounded-lg bg-red-50 text-red-400 hover:bg-red-100">
              <Trash2 size={12} />
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5 overflow-x-hidden">
      <PageHeader
        title="Dépenses"
        subtitle={`${inPeriod.length} dépenses · ${MAD(total)} sur la période`}
        actions={<Button onClick={openAdd} className="hidden lg:inline-flex"><Plus size={16} /> Nouvelle dépense</Button>}
      />
      <Fab icon={Plus} label="Dépense" onClick={openAdd} />

      {/* Recurring expenses — salaires, loyers, créances... auto-posted monthly */}
      <div className="card p-4">
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

      {/* Period: quick choices, or any two dates */}
      <div className="card p-3 space-y-2.5">
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
          {PERIODS.map(p => (
            <button key={p.key} onClick={() => setDateRange(...p.range())} aria-pressed={activePeriod === p.key}
              className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${activePeriod === p.key ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input type="date" value={from} max={to} onChange={e => e.target.value && setDateRange(e.target.value, to)}
            className="border border-gray-200 rounded-xl px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-indigo-300" />
          <span className="text-gray-300 text-xs">→</span>
          <input type="date" value={to} min={from} onChange={e => e.target.value && setDateRange(from, e.target.value)}
            className="border border-gray-200 rounded-xl px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-indigo-300" />
          <span className="text-xs text-gray-500 ml-auto">{periodText}</span>
        </div>
      </div>

      {/* Category summary cards — the period's */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {allCategories.map(cat => (
          <button
            key={cat}
            onClick={() => setCatFilter(catFilter === cat ? '' : cat)}
            className={`text-left p-4 rounded-2xl border transition-all ${catFilter === cat ? 'ring-2 ring-indigo-400' : ''}`}
            style={{ borderColor: catFilter === cat ? catColor(cat) : '#e5e7eb', backgroundColor: catFilter === cat ? `${catColor(cat)}15` : '#fff' }}
          >
            <div className="text-xs font-medium text-gray-500 mb-1">{catLabel(cat)}</div>
            <div className="text-xl font-bold text-gray-900">{MAD(catSummary[cat]?.total ?? 0)}</div>
            <div className="text-xs text-gray-400 mt-1">
              {catSummary[cat]?.count ?? 0} entrées
              {total > 0 && catSummary[cat] ? ` · ${Math.round((catSummary[cat].total / total) * 100)} %` : ''}
            </div>
          </button>
        ))}
      </div>

      {/* List */}
      <div className="space-y-2">
        {loading && expenses.length === 0 && <ListSkeleton count={4} />}
        <div className="flex items-center justify-between gap-2 px-1">
          {catFilter ? (
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-sm text-gray-500 truncate">Filtre : <strong>{catLabel(catFilter)}</strong> · {MAD(filteredTotal)}</span>
              <button onClick={() => setCatFilter('')} className="text-xs text-indigo-600 hover:underline shrink-0">Effacer</button>
            </div>
          ) : <span className="text-sm text-gray-500">{filtered.length} dépense{filtered.length > 1 ? 's' : ''}</span>}
          <div className="flex bg-gray-100 rounded-xl p-0.5 shrink-0">
            {([['grouped', LayoutList, 'Par catégorie'], ['list', List, 'Détail']] as const).map(([v, Icon, label]) => (
              <button key={v} onClick={() => chooseView(v)} aria-pressed={view === v}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold ${view === v ? 'bg-surface text-gray-900 shadow-sm' : 'text-gray-500'}`}>
                <Icon size={13} /> {label}
              </button>
            ))}
          </div>
        </div>

        {view === 'list' && filtered.map(renderExpense)}

        {view === 'grouped' && groups.map(g => {
          const open = openGroups.has(g.cat);
          const share = filteredTotal > 0 ? (g.total / filteredTotal) * 100 : 0;
          return (
            <div key={g.cat} className="card overflow-hidden">
              <button onClick={() => toggleGroup(g.cat)} aria-expanded={open}
                className="w-full flex items-center gap-3 p-4 text-left hover:bg-gray-50 transition-colors">
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: catColor(g.cat) }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold text-gray-900 truncate">{catLabel(g.cat)}</span>
                    <span className="text-base font-bold text-gray-900 whitespace-nowrap">{MAD(g.total)}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    {/* Its share of the period's spending. */}
                    <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${share}%`, backgroundColor: catColor(g.cat) }} />
                    </div>
                    <span className="text-xs text-gray-500 whitespace-nowrap">
                      {Math.round(share)} % · {g.items.length} dépense{g.items.length > 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
                <ChevronDown size={16} className={`text-gray-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
              </button>
              {open && <div className="px-3 pb-3 space-y-2 bg-gray-50/60 pt-2">{g.items.map(renderExpense)}</div>}
            </div>
          );
        })}

        {view === 'grouped' && groups.length > 1 && (
          <div className="flex items-center justify-between px-4 py-3 rounded-2xl bg-ink text-white">
            <span className="text-sm font-semibold">Total de la période</span>
            <span className="text-lg font-black">{MAD(filteredTotal)}</span>
          </div>
        )}

        {filtered.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <p className="text-lg">Aucune dépense sur cette période</p>
            <p className="text-sm mt-1">{expenses.length > 0 ? 'Choisis une autre période ci-dessus.' : 'Enregistrez vos premières dépenses'}</p>
          </div>
        )}
      </div>

      {/* Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Modifier la dépense' : 'Nouvelle dépense'} size="md">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Catégorie *</label>
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
                className="input"
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
              <label className="label">Montant total ({currency}) *</label>
              <NumberInput
                value={form.amount}
                onChange={val => setForm(f => ({ ...f, amount: val }))}
                className="input"
              />
            </div>
            <div>
              <label className="label">Date *</label>
              <input
                type="date"
                value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                className="input"
              />
            </div>
            {/* Every expense comes out of a treasury account. */}
            <div className="sm:col-span-2">
              <label className="label">Payé depuis *</label>
              {accounts === null ? (
                <p className="text-xs text-gray-400 py-2.5">Chargement des comptes…</p>
              ) : accounts.length === 0 ? (
                <p className="text-xs text-amber-700 bg-amber-50 rounded-xl px-3 py-2.5">
                  Aucun compte de trésorerie en {bizCurrency === 'USD' ? 'dollars' : bizCurrency}.{' '}
                  <a href="#/tresorerie" className="font-semibold underline">Crée-le dans Trésorerie</a> pour enregistrer la dépense.
                </p>
              ) : (
                <select
                  value={form.treasuryAccountId ?? ''}
                  onChange={e => setForm(f => ({ ...f, treasuryAccountId: e.target.value || undefined }))}
                  className={`w-full border rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300 ${form.treasuryAccountId ? 'border-gray-200' : 'border-amber-300'}`}
                >
                  <option value="">Choisis le compte…</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{accountLabel(a)} — {fmtMoney(a.balance, a.currency)}</option>)}
                </select>
              )}
            </div>
                        {form.category === 'pub' && (
              <div>
                <label className="label">Canal pub</label>
                <select
                  value={form.channel ?? ''}
                  onChange={e => setForm(f => ({ ...f, channel: e.target.value || undefined }))}
                  className="input"
                >
                  <option value="">—</option>
                  {SALE_CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            )}
          </div>

          <div>
            <label className="label">Description *</label>
            <input
              type="text"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Ex: Campagne Meta Ads Nike AF1..."
              className="input"
            />
          </div>

          {/* Product multi-selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-600">
                {words.Items} associé{words.e}s
                {selectedProductIds.length > 1 && (
                  <span className="ml-2 text-indigo-600 font-semibold">
                    → {MAD(perProductAmount)}/{terms.item}
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
                <p className="text-xs text-gray-400 text-center py-2">{words.noItem}</p>
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
                {selectedProductIds.length} {terms.items} sélectionné{words.e}s — {MAD(form.amount)} réparti en parts égales
              </p>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)} className="flex-1" disabled={submitting}>Annuler</Button>
            <Button onClick={handleSave} loading={submitting} className="flex-1" disabled={!form.treasuryAccountId}>
              {editing ? 'Enregistrer' : selectedProductIds.length > 1 ? `Créer ${selectedProductIds.length} dépenses` : 'Ajouter'}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        title="Supprimer la dépense"
        message={deleting && deleting.length > 1
          ? `Cette dépense répartie sur ${deleting.length} ${terms.items} sera définitivement supprimée, pour tous.`
          : 'Cette dépense sera définitivement supprimée.'}
        onConfirm={async () => {
          const parts = deleting ?? [];
          setDeleting(null);
          for (const part of parts) await deleteExpense(part.id).catch(() => {});
        }}
        onCancel={() => setDeleting(null)}
      />

      {/* Recurring expense modal */}
      <Modal open={recurringModalOpen} onClose={() => setRecurringModalOpen(false)} title={editingRecurring ? 'Modifier la dépense récurrente' : 'Nouvelle dépense récurrente'} size="md">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Catégorie *</label>
              <select
                value={recurringForm.category}
                onChange={e => setRecurringForm(f => ({ ...f, category: e.target.value }))}
                className="input"
              >
                {allCategories.map(c => <option key={c} value={c}>{catLabel(c)}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Montant ({currency}) *</label>
              <NumberInput
                value={recurringForm.amount}
                onChange={val => setRecurringForm(f => ({ ...f, amount: val }))}
                className="input"
              />
            </div>
            <div>
              <label className="label">Échéance *</label>
              <select
                value={recurringForm.frequency}
                onChange={e => setRecurringForm(f => ({ ...f, frequency: e.target.value }))}
                className="input"
              >
                <option value="daily">Journalière</option>
                <option value="weekly">Hebdomadaire</option>
                <option value="monthly">Mensuelle</option>
                <option value="annual">Annuelle</option>
              </select>
            </div>

            {recurringForm.frequency === 'weekly' && (
              <div>
                <label className="label">Jour de la semaine *</label>
                <select
                  value={recurringForm.dayOfWeek}
                  onChange={e => setRecurringForm(f => ({ ...f, dayOfWeek: +e.target.value }))}
                  className="input"
                >
                  {WEEKDAY_LABELS.map((d, i) => <option key={i} value={i}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>)}
                </select>
              </div>
            )}

            {recurringForm.frequency === 'annual' && (
              <div>
                <label className="label">Mois *</label>
                <select
                  value={recurringForm.month}
                  onChange={e => setRecurringForm(f => ({ ...f, month: +e.target.value }))}
                  className="input"
                >
                  {MONTH_NAMES.map((m, i) => <option key={i} value={i + 1}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
                </select>
              </div>
            )}

            {(recurringForm.frequency === 'monthly' || recurringForm.frequency === 'annual') && (
              <div>
                <label className="label">Jour du mois *</label>
                <input
                  type="number" min={1} max={28}
                  value={recurringForm.dayOfMonth}
                  onChange={e => setRecurringForm(f => ({ ...f, dayOfMonth: Math.min(28, Math.max(1, +e.target.value)) }))}
                  className="input"
                />
                <div className="text-xs text-gray-400 mt-1">1 à 28 — pour tomber dans tous les mois</div>
              </div>
            )}

            <div>
              <label className="label">Début *</label>
              <input
                type="date"
                value={recurringForm.startDate}
                onChange={e => setRecurringForm(f => ({ ...f, startDate: e.target.value }))}
                className="input"
              />
            </div>
            <div>
              <label className="label">Fin (optionnel)</label>
              <input
                type="date"
                value={recurringForm.endDate}
                onChange={e => setRecurringForm(f => ({ ...f, endDate: e.target.value }))}
                className="input"
              />
              <div className="text-xs text-gray-400 mt-1">Ex: fin d'un remboursement de créance</div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Every expense comes out of a treasury account. */}
            <div className="sm:col-span-2">
              <label className="label">Payé depuis *</label>
              {accounts === null ? (
                <p className="text-xs text-gray-400 py-2.5">Chargement des comptes…</p>
              ) : accounts.length === 0 ? (
                <p className="text-xs text-amber-700 bg-amber-50 rounded-xl px-3 py-2.5">
                  Aucun compte de trésorerie en {bizCurrency === 'USD' ? 'dollars' : bizCurrency}.{' '}
                  <a href="#/tresorerie" className="font-semibold underline">Crée-le dans Trésorerie</a> pour enregistrer la dépense.
                </p>
              ) : (
                <select
                  value={recurringForm.treasuryAccountId ?? ''}
                  onChange={e => setRecurringForm(f => ({ ...f, treasuryAccountId: e.target.value || undefined }))}
                  className={`w-full border rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300 ${recurringForm.treasuryAccountId ? 'border-gray-200' : 'border-amber-300'}`}
                >
                  <option value="">Choisis le compte…</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{accountLabel(a)} — {fmtMoney(a.balance, a.currency)}</option>)}
                </select>
              )}
            </div>
            </div>

          <div>
            <label className="label">Description</label>
            <input
              type="text"
              value={recurringForm.description}
              onChange={e => setRecurringForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Ex: Salaire — Jean Mbuyi"
              className="input"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="secondary" onClick={() => setRecurringModalOpen(false)} className="flex-1" disabled={submitting}>Annuler</Button>
            <Button onClick={handleSaveRecurring} loading={submitting} className="flex-1" disabled={!recurringForm.treasuryAccountId}>
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
