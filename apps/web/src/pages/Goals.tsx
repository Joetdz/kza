import { useState, useMemo, useEffect } from 'react';
import { Plus, Trash2, Edit2, Target, TrendingUp, Calculator } from 'lucide-react';
import { useStore } from '../store/useStore';
import { computeGoalProgress, computeBudgetForecast, computeRealizedByProduct } from '../utils/calculations';
import { useCurrency } from '../hooks/useCurrency';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { ProgressBar } from '../components/ui/ProgressBar';
import { NumberInput } from '../components/ui/NumberInput';
import { budgetForecastApi, recurringExpensesApi } from '../api';
import { EXPENSE_LABELS } from '../utils/formatters';
import type { SalesGoal, BudgetForecast, RecurringExpense } from '../types';

type GoalProgress = ReturnType<typeof computeGoalProgress>[0];

function PeriodRow({
  label,
  qty,
  target,
  revenue,
  revenueTarget,
  pct,
  fmt,
}: {
  label: string;
  qty: number;
  target: number;
  revenue: number;
  revenueTarget: number;
  pct: number;
  fmt: (n: number) => string;
}) {
  const color =
    pct >= 100 ? 'text-emerald-600' :
    pct >= 60  ? 'text-indigo-600'  :
    pct >= 30  ? 'text-amber-600'   : 'text-red-500';

  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1.5">
        <span className="text-gray-600 font-medium">{label}</span>
        <div className="text-right">
          <div>
            <span className={`font-bold ${color}`}>{qty}</span>
            <span className="text-gray-400 text-xs"> / {target} unités</span>
          </div>
          <div className="text-xs">
            <span className={`font-semibold ${color}`}>{fmt(revenue)}</span>
            <span className="text-gray-400"> / {fmt(revenueTarget)}</span>
          </div>
        </div>
      </div>
      <ProgressBar value={pct} />
    </div>
  );
}

function GoalCard({
  goal,
  productName,
  progress,
  fmt,
  onEdit,
  onDelete,
}: {
  goal: SalesGoal;
  productName: string;
  progress: GoalProgress;
  fmt: (n: number) => string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const bestPct = Math.max(progress.dailyPct, progress.weeklyPct, progress.monthlyPct);

  return (
    <div className={`bg-white rounded-2xl p-5 shadow-sm border transition-all ${
      bestPct >= 100 ? 'border-emerald-200 bg-emerald-50/20' :
      bestPct < 30   ? 'border-amber-100' : 'border-gray-100'
    }`}>
      <div className="flex items-start justify-between mb-1">
        <div>
          <div className="font-semibold text-gray-900">{productName}</div>
          <div className="text-xs text-gray-500 mt-0.5">
            Objectif : <span className="font-medium text-indigo-600">{goal.targetQty} unités / mois</span>
          </div>
        </div>
        <div className="flex gap-1">
          <button onClick={onEdit} className="p-1.5 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200">
            <Edit2 size={14} />
          </button>
          <button onClick={onDelete} className="p-1.5 rounded-lg bg-red-50 text-red-400 hover:bg-red-100">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <div className="space-y-4 mt-4">
        <PeriodRow
          label="Aujourd'hui"
          qty={progress.dailyQty}
          target={progress.dailyTarget}
          revenue={progress.dailyRevenue}
          revenueTarget={progress.dailyRevenueTarget}
          pct={progress.dailyPct}
          fmt={fmt}
        />
        <PeriodRow
          label="Cette semaine"
          qty={progress.weeklyQty}
          target={progress.weeklyTarget}
          revenue={progress.weeklyRevenue}
          revenueTarget={progress.weeklyRevenueTarget}
          pct={progress.weeklyPct}
          fmt={fmt}
        />
        <PeriodRow
          label="Ce mois"
          qty={progress.monthlyQty}
          target={goal.targetQty}
          revenue={progress.monthlyRevenue}
          revenueTarget={progress.monthlyRevenueTarget}
          pct={progress.monthlyPct}
          fmt={fmt}
        />
      </div>

      {progress.monthlyPct >= 100 && (
        <div className="mt-3 text-center text-xs font-semibold text-emerald-700 bg-emerald-100 rounded-xl py-2">
          Objectif mensuel atteint !
        </div>
      )}
      {progress.monthlyPct < 30 && (
        <div className="mt-3 text-center text-xs font-semibold text-amber-700 bg-amber-50 rounded-xl py-2">
          En retard — action requise
        </div>
      )}
    </div>
  );
}

const emptyForm = (): { productId: string; targetQty: number } => ({
  productId: 'all',
  targetQty: 30,
});

type MainTab = 'objectifs' | 'budget';

export function Goals() {
  const { products, sales, expenses, goals, addGoal, updateGoal, deleteGoal } = useStore();
  const { fmt } = useCurrency();

  const [mainTab, setMainTab] = useState<MainTab>('objectifs');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SalesGoal | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());

  const progress = useMemo(() => computeGoalProgress(goals, sales, products), [goals, sales, products]);

  // ─── Budget prévisionnel ─────────────────────────────────────────────────────
  const [forecast, setForecast] = useState<BudgetForecast | null>(null);
  const [recurringExpenses, setRecurringExpenses] = useState<RecurringExpense[]>([]);
  const [forecastLoading, setForecastLoading] = useState(true);
  const [qtyMap, setQtyMap] = useState<Record<string, string>>({});
  const [savingQty, setSavingQty] = useState(false);
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<BudgetForecast['expenses'][number] | null>(null);
  const [expenseForm, setExpenseForm] = useState({ category: 'other', description: '', amount: 0 });
  const [deleteExpenseId, setDeleteExpenseId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([budgetForecastApi.get(), recurringExpensesApi.getAll()])
      .then(([f, r]) => {
        setForecast(f);
        setRecurringExpenses(r);
        const map: Record<string, string> = {};
        f.products.forEach(fp => { map[fp.productId] = String(fp.quantity); });
        setQtyMap(map);
      })
      .catch(() => {})
      .finally(() => setForecastLoading(false));
  }, []);

  const forecastMonths = useMemo(() => {
    if (!forecast) return [];
    return computeBudgetForecast(products, sales, expenses, recurringExpenses, forecast);
  }, [products, sales, expenses, recurringExpenses, forecast]);

  const forecastOpexCategories = useMemo(() => {
    const cats = new Set<string>();
    forecastMonths.forEach(m => Object.keys(m.knownOpexByCategory).forEach(c => cats.add(c)));
    return [...cats];
  }, [forecastMonths]);

  const catLabel = (c: string) => EXPENSE_LABELS[c] ?? c;

  // ─── Objectif vs Budget prévisionnel vs Réalisé (mois civil en cours) ───────
  const currentCalendarMonth = new Date().toISOString().slice(0, 7);
  const currentForecastMonth = useMemo(
    () => forecastMonths.find(m => m.monthKey === currentCalendarMonth),
    [forecastMonths, currentCalendarMonth],
  );
  const realizedByProduct = useMemo(() => computeRealizedByProduct(sales, currentCalendarMonth), [sales, currentCalendarMonth]);

  const comparisonRows = useMemo(() => {
    const productIds = new Set<string>();
    goals.forEach(g => { if (g.productId !== 'all') productIds.add(g.productId); });
    if (currentForecastMonth) Object.keys(currentForecastMonth.quantitiesByProduct).forEach(id => productIds.add(id));

    return [...productIds].map(productId => {
      const product = products.find(p => p.id === productId);
      const goalQty = goals.find(g => g.productId === productId)?.targetQty ?? null;
      const forecastQty = currentForecastMonth?.quantitiesByProduct[productId] ?? null;
      const realizedQty = realizedByProduct[productId] ?? 0;
      const reference = Math.max(goalQty ?? 0, forecastQty ?? 0);
      const pct = reference > 0 ? Math.min(100, (realizedQty / reference) * 100) : 0;
      return { productId, productName: product?.name ?? 'Produit inconnu', goalQty, forecastQty, realizedQty, pct };
    }).filter(r => r.goalQty !== null || r.forecastQty !== null)
      .sort((a, b) => b.pct - a.pct);
  }, [goals, currentForecastMonth, realizedByProduct, products]);

  const updateForecastSettings = async (patch: { startMonth?: string; monthlyGrowthPct?: number; horizonMonths?: number }) => {
    if (!forecast) return;
    // Optimistic update first — sinon un champ dont la requête traîne (ou échoue
    // silencieusement) donne l'impression que seul le dernier champ modifié "marche".
    setForecast({ ...forecast, ...patch });
    try {
      const updated = await budgetForecastApi.update(patch);
      setForecast(updated);
    } catch (e: any) {
      alert('Erreur : ' + (e?.message ?? 'Impossible de sauvegarder ce paramètre'));
    }
  };

  const handleSaveQuantities = async () => {
    setSavingQty(true);
    try {
      const items = Object.entries(qtyMap)
        .filter(([, q]) => q !== '')
        .map(([productId, q]) => ({ productId, quantity: Number(q) }));
      const updated = await budgetForecastApi.setProducts(items);
      setForecast(updated);
    } catch (e: any) {
      alert('Erreur : ' + (e?.message ?? 'Impossible de sauvegarder'));
    } finally {
      setSavingQty(false);
    }
  };

  const openAddExpense = () => {
    setEditingExpense(null);
    setExpenseForm({ category: 'other', description: '', amount: 0 });
    setExpenseModalOpen(true);
  };

  const openEditExpense = (e: BudgetForecast['expenses'][number]) => {
    setEditingExpense(e);
    setExpenseForm({ category: e.category, description: e.description, amount: e.amount });
    setExpenseModalOpen(true);
  };

  const handleSaveExpense = async () => {
    if (!expenseForm.amount || !expenseForm.category.trim()) return;
    try {
      if (editingExpense) {
        await budgetForecastApi.updateExpense(editingExpense.id, expenseForm);
      } else {
        await budgetForecastApi.addExpense(expenseForm);
      }
      const fresh = await budgetForecastApi.get();
      setForecast(fresh);
      setExpenseModalOpen(false);
    } catch (e: any) {
      alert('Erreur : ' + (e?.message ?? 'Impossible de sauvegarder'));
    }
  };

  const handleDeleteExpense = async () => {
    if (!deleteExpenseId) return;
    try {
      await budgetForecastApi.removeExpense(deleteExpenseId);
      const fresh = await budgetForecastApi.get();
      setForecast(fresh);
    } catch (e: any) {
      alert('Erreur : ' + (e?.message ?? 'Impossible de supprimer'));
    } finally {
      setDeleteExpenseId(null);
    }
  };

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm());
    setModalOpen(true);
  };

  const openEdit = (g: SalesGoal) => {
    setEditing(g);
    setForm({ productId: g.productId, targetQty: g.targetQty });
    setModalOpen(true);
  };

  const handleSave = () => {
    if (form.targetQty < 1) return;
    if (editing) updateGoal(editing.id, form);
    else addGoal(form);
    setModalOpen(false);
  };

  const getProductName = (productId: string) => {
    if (productId === 'all') return 'Boutique entière';
    return products.find(p => p.id === productId)?.name ?? 'Produit inconnu';
  };

  const avgMonthlyPct = progress.length > 0
    ? progress.reduce((s, p) => s + p.monthlyPct, 0) / progress.length
    : 0;

  return (
    <div className="space-y-5 overflow-x-hidden">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 truncate">
            {mainTab === 'objectifs' ? 'Objectifs de Vente' : 'Budget prévisionnel'}
          </h1>
          <p className="text-xs sm:text-sm text-gray-500">
            {mainTab === 'objectifs'
              ? `${goals.length} objectif${goals.length !== 1 ? 's' : ''} défini${goals.length !== 1 ? 's' : ''}`
              : 'Projection dynamique à partir des quantités visées par produit'}
          </p>
        </div>
        {mainTab === 'objectifs' && (
          <button
            onClick={openAdd}
            className="shrink-0 flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3 sm:px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
          >
            <Plus size={16} /><span className="hidden sm:inline">Définir objectif</span>
          </button>
        )}
      </div>

      {/* Tab switcher */}
      <div className="flex gap-2 bg-gray-100 p-1 rounded-xl w-fit">
        {([['objectifs', '🎯 Objectifs'], ['budget', '📈 Budget prévisionnel']] as const).map(([t, label]) => (
          <button key={t} onClick={() => setMainTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${mainTab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {mainTab === 'objectifs' && <>
      {goals.length > 0 && (
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl p-5 text-white">
          <div className="flex items-center gap-3 mb-3">
            <Target size={22} />
            <span className="font-semibold">Progression mensuelle globale</span>
          </div>
          <div className="text-4xl font-black mb-2">{Math.round(avgMonthlyPct)}%</div>
          <div className="w-full bg-white/20 rounded-full h-2">
            <div
              className="h-2 rounded-full bg-white transition-all"
              style={{ width: `${Math.min(100, avgMonthlyPct)}%` }}
            />
          </div>
          <div className="flex items-center gap-2 text-sm text-white/70 mt-2">
            <TrendingUp size={14} />
            Moyenne sur {goals.length} objectif{goals.length !== 1 ? 's' : ''}
          </div>
        </div>
      )}

      {/* Objectif vs Budget prévisionnel vs Réalisé — mois en cours */}
      {comparisonRows.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-4 pb-3">
            <h2 className="font-semibold text-gray-900 text-sm">Objectif vs Budget prévisionnel vs Réalisé</h2>
            <p className="text-xs text-gray-400">
              {currentForecastMonth ? `Mois en cours (${currentForecastMonth.label})` : "Le budget prévisionnel ne couvre pas le mois en cours — seul l'objectif manuel est comparé au réalisé."}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left font-medium text-gray-500 px-4 py-2">Produit</th>
                  <th className="text-right font-medium text-gray-500 px-3 py-2">Objectif</th>
                  <th className="text-right font-medium text-gray-500 px-3 py-2">Prévisionnel</th>
                  <th className="text-right font-medium text-gray-500 px-3 py-2">Réalisé</th>
                  <th className="text-left font-medium text-gray-500 px-4 py-2 w-1/3">Progression</th>
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map(r => {
                  const color = r.pct >= 100 ? 'bg-emerald-500' : r.pct >= 60 ? 'bg-indigo-500' : r.pct >= 30 ? 'bg-amber-500' : 'bg-red-400';
                  return (
                    <tr key={r.productId} className="border-b border-gray-50">
                      <td className="px-4 py-2.5 text-gray-800 font-medium truncate max-w-[160px]">{r.productName}</td>
                      <td className="text-right px-3 py-2.5 text-gray-600">{r.goalQty ?? '—'}</td>
                      <td className="text-right px-3 py-2.5 text-gray-600">{r.forecastQty != null ? Math.round(r.forecastQty) : '—'}</td>
                      <td className="text-right px-3 py-2.5 font-semibold text-gray-900">{r.realizedQty}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-100 rounded-full h-2">
                            <div className={`h-2 rounded-full ${color}`} style={{ width: `${r.pct}%` }} />
                          </div>
                          <span className="text-xs text-gray-500 w-10 text-right shrink-0">{Math.round(r.pct)}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {progress.map(p => (
          <GoalCard
            key={p.goal.id}
            goal={p.goal}
            productName={getProductName(p.goal.productId)}
            progress={p}
            fmt={fmt}
            onEdit={() => openEdit(p.goal)}
            onDelete={() => setDeleteId(p.goal.id)}
          />
        ))}
        {goals.length === 0 && (
          <div className="col-span-full text-center py-16 text-gray-400">
            <Target size={48} className="mx-auto mb-3 text-gray-200" />
            <p className="text-lg">Aucun objectif défini</p>
            <p className="text-sm mt-1">Définissez un objectif de vente par produit</p>
          </div>
        )}
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Modifier l'objectif" : 'Nouvel objectif'}
        size="sm"
      >
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Produit</label>
            <select
              value={form.productId}
              onChange={e => setForm(f => ({ ...f, productId: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300"
            >
              <option value="all">Boutique entière</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">
              Objectif mensuel (nombre de ventes)
            </label>
            <input
              type="number"
              min={1}
              value={form.targetQty}
              onChange={e => setForm(f => ({ ...f, targetQty: Math.max(1, +e.target.value) }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300"
            />
            <p className="text-xs text-gray-400 mt-1">
              ~{Math.ceil(form.targetQty / 30)} / jour · ~{Math.ceil(form.targetQty / 4)} / semaine
            </p>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => setModalOpen(false)}
              className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700"
            >
              Annuler
            </button>
            <button
              onClick={handleSave}
              className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700"
            >
              {editing ? 'Enregistrer' : 'Créer'}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteId}
        title="Supprimer l'objectif"
        message="Cet objectif sera définitivement supprimé."
        onConfirm={() => { if (deleteId) deleteGoal(deleteId); setDeleteId(null); }}
        onCancel={() => setDeleteId(null)}
      />
      </>}

      {mainTab === 'budget' && (
        forecastLoading || !forecast ? (
          <p className="text-sm text-gray-400 text-center py-10">Chargement...</p>
        ) : (
        <div className="space-y-5">
          {/* Settings */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Calculator size={16} className="text-indigo-500" />
              <h2 className="font-semibold text-gray-900 text-sm">Paramètres de projection</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Mois de départ</label>
                <input
                  type="month"
                  value={forecast.startMonth || new Date().toISOString().slice(0, 7)}
                  onChange={e => updateForecastSettings({ startMonth: e.target.value })}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Croissance mensuelle (%)</label>
                <NumberInput
                  value={forecast.monthlyGrowthPct}
                  onChange={val => updateForecastSettings({ monthlyGrowthPct: val })}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Horizon (mois)</label>
                <input
                  type="number" min={1} max={36}
                  value={forecast.horizonMonths}
                  onChange={e => updateForecastSettings({ horizonMonths: Math.min(36, Math.max(1, +e.target.value)) })}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>
            </div>
          </div>

          {/* Projected quantities per product, month by month */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="flex items-center justify-between p-4 pb-3">
              <div>
                <h2 className="font-semibold text-gray-900 text-sm">Quantité projetée à vendre, par mois</h2>
                <p className="text-xs text-gray-400">Seul le premier mois se saisit — les suivants appliquent la croissance de {forecast.monthlyGrowthPct}%/mois automatiquement.</p>
              </div>
              <button onClick={handleSaveQuantities} disabled={savingQty}
                className="shrink-0 flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white px-3 py-2 rounded-xl text-xs font-medium transition-colors">
                {savingQty ? 'Enregistrement...' : 'Appliquer'}
              </button>
            </div>
            {products.length === 0 ? (
              <p className="text-xs text-gray-400 px-4 pb-4">Aucun produit.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left font-medium text-gray-500 px-4 py-2 sticky left-0 bg-white">Produit</th>
                      {forecastMonths.map(m => (
                        <th key={m.monthKey} className="text-right font-medium text-gray-500 px-3 py-2 whitespace-nowrap min-w-[80px]">{m.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {products.filter(p => p.trackStock !== false).map(p => (
                      <tr key={p.id} className="border-b border-gray-50">
                        <td className="px-4 py-1.5 text-gray-700 truncate sticky left-0 bg-white max-w-[160px]">{p.name}</td>
                        <td className="px-2 py-1.5">
                          <input
                            type="number" min={0}
                            value={qtyMap[p.id] ?? ''}
                            onChange={e => setQtyMap(m => ({ ...m, [p.id]: e.target.value }))}
                            placeholder="0"
                            className="w-20 border border-gray-200 rounded-lg px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300 text-right"
                          />
                        </td>
                        {forecastMonths.slice(1).map(m => (
                          <td key={m.monthKey} className="text-right px-3 py-1.5 text-gray-400">
                            {Math.round(m.quantitiesByProduct[p.id] ?? 0) || '—'}
                          </td>
                        ))}
                      </tr>
                    ))}
                    <tr className="bg-gray-50 font-semibold">
                      <td className="px-4 py-2 text-gray-700 sticky left-0 bg-gray-50">Total</td>
                      {forecastMonths.map(m => (
                        <td key={m.monthKey} className="text-right px-3 py-2 text-gray-800">
                          {Math.round(Object.values(m.quantitiesByProduct).reduce((s, q) => s + q, 0))}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Manual forecast OPEX lines */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-900 text-sm">Autres OPEX du budget (ajoutées manuellement)</h2>
              <button onClick={openAddExpense}
                className="flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors">
                <Plus size={14} /> Ajouter
              </button>
            </div>
            {forecast.expenses.length === 0 ? (
              <p className="text-xs text-gray-400 py-2">Aucune — les dépenses récurrentes connues (salaires, loyers...) s'ajoutent déjà automatiquement ci-dessous. Ajoute ici tout ce qui manque.</p>
            ) : (
              <div className="space-y-1.5">
                {forecast.expenses.map(e => (
                  <div key={e.id} className="flex items-center gap-3 p-2 rounded-xl bg-gray-50">
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-gray-800">{catLabel(e.category)}</span>
                      {e.description && <span className="text-xs text-gray-400 ml-2 truncate">{e.description}</span>}
                    </div>
                    <div className="text-sm font-bold text-gray-900 shrink-0">{fmt(e.amount)}/mois</div>
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => openEditExpense(e)} className="p-1.5 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200"><Edit2 size={12} /></button>
                      <button onClick={() => setDeleteExpenseId(e.id)} className="p-1.5 rounded-lg bg-red-50 text-red-400 hover:bg-red-100"><Trash2 size={12} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Projected P&L */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-5 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Compte de résultat prévisionnel</h2>
              <p className="text-xs text-gray-500">Même structure que le vrai compte de résultat (onglet Analyse)</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left font-medium text-gray-500 px-5 py-3 sticky left-0 bg-white">Ligne</th>
                    {forecastMonths.map(m => (
                      <th key={m.monthKey} className="text-right font-medium text-gray-500 px-3 py-3 whitespace-nowrap min-w-[90px]">{m.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-gray-50">
                    <td className="px-5 py-2.5 font-medium text-gray-800 sticky left-0 bg-white">Chiffre d'affaires</td>
                    {forecastMonths.map(m => <td key={m.monthKey} className="text-right px-3 py-2.5 text-gray-800">{fmt(m.revenue)}</td>)}
                  </tr>
                  <tr className="border-b border-gray-50">
                    <td className="px-5 py-2.5 text-gray-600 sticky left-0 bg-white">Coût des marchandises vendues</td>
                    {forecastMonths.map(m => <td key={m.monthKey} className="text-right px-3 py-2.5 text-red-600">−{fmt(m.cogs)}</td>)}
                  </tr>
                  <tr className="border-b border-gray-100 bg-indigo-50/40">
                    <td className="px-5 py-2.5 font-semibold text-gray-900 sticky left-0 bg-indigo-50/40">Marge brute</td>
                    {forecastMonths.map(m => <td key={m.monthKey} className={`text-right px-3 py-2.5 font-semibold ${m.grossProfit >= 0 ? 'text-gray-900' : 'text-red-600'}`}>{fmt(m.grossProfit)}</td>)}
                  </tr>

                  <tr className="border-b border-gray-50">
                    <td className="px-5 py-2 pl-8 text-gray-500 text-xs sticky left-0 bg-white">Budget publicité (projeté)</td>
                    {forecastMonths.map(m => <td key={m.monthKey} className="text-right px-3 py-2 text-gray-500 text-xs">{m.adBudget ? `−${fmt(m.adBudget)}` : '—'}</td>)}
                  </tr>
                  {forecastOpexCategories.map(cat => (
                    <tr key={cat} className="border-b border-gray-50">
                      <td className="px-5 py-2 pl-8 text-gray-500 text-xs sticky left-0 bg-white">{catLabel(cat)}</td>
                      {forecastMonths.map(m => (
                        <td key={m.monthKey} className="text-right px-3 py-2 text-gray-500 text-xs">
                          {m.knownOpexByCategory[cat] ? `−${fmt(m.knownOpexByCategory[cat])}` : '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {forecast.expenses.length > 0 && (
                    <tr className="border-b border-gray-50">
                      <td className="px-5 py-2 pl-8 text-gray-500 text-xs sticky left-0 bg-white">Autres OPEX (manuel)</td>
                      {forecastMonths.map(m => <td key={m.monthKey} className="text-right px-3 py-2 text-gray-500 text-xs">{m.manualOpexTotal ? `−${fmt(m.manualOpexTotal)}` : '—'}</td>)}
                    </tr>
                  )}

                  <tr className="border-b border-gray-100">
                    <td className="px-5 py-2.5 font-medium text-gray-700 sticky left-0 bg-white">Total OPEX</td>
                    {forecastMonths.map(m => <td key={m.monthKey} className="text-right px-3 py-2.5 font-medium text-red-600">−{fmt(m.totalOpex)}</td>)}
                  </tr>

                  <tr className={forecastMonths.every(m => m.ebitda >= 0) ? 'bg-emerald-50' : ''}>
                    <td className="px-5 py-3 font-bold sticky left-0 bg-inherit text-emerald-800">Bénéfice (EBITDA)</td>
                    {forecastMonths.map(m => (
                      <td key={m.monthKey} className={`text-right px-3 py-3 font-bold ${m.ebitda >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{fmt(m.ebitda)}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
        )
      )}

      {/* Forecast manual expense modal */}
      <Modal open={expenseModalOpen} onClose={() => setExpenseModalOpen(false)} title={editingExpense ? 'Modifier la ligne' : 'Nouvelle ligne OPEX'} size="sm">
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Catégorie *</label>
            <input
              type="text"
              value={expenseForm.category}
              onChange={e => setExpenseForm(f => ({ ...f, category: e.target.value }))}
              placeholder="Ex: marketing, entretien..."
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Montant mensuel *</label>
            <NumberInput
              value={expenseForm.amount}
              onChange={val => setExpenseForm(f => ({ ...f, amount: val }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Description</label>
            <input
              type="text"
              value={expenseForm.description}
              onChange={e => setExpenseForm(f => ({ ...f, description: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setExpenseModalOpen(false)} className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700">Annuler</button>
            <button onClick={handleSaveExpense} className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700">
              {editingExpense ? 'Enregistrer' : 'Ajouter'}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteExpenseId}
        title="Supprimer la ligne"
        message="Cette ligne sera retirée du budget prévisionnel."
        onConfirm={handleDeleteExpense}
        onCancel={() => setDeleteExpenseId(null)}
      />
    </div>
  );
}
