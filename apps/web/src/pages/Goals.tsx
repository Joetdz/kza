import { useState, useMemo, useEffect } from 'react';
import { Plus, Trash2, Edit2, Calculator, Target, TrendingUp, ChevronDown, ChevronRight } from 'lucide-react';
import { useStore } from '../store/useStore';
import { computeBudgetForecast, computeRealizedByProduct, computeAdSpendPerUnit } from '../utils/calculations';
import { useCurrency } from '../hooks/useCurrency';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { NumberInput } from '../components/ui/NumberInput';
import { budgetForecastApi, recurringExpensesApi } from '../api';
import { EXPENSE_LABELS } from '../utils/formatters';
import type { BudgetForecast, RecurringExpense } from '../types';

type MainTab = 'objectifs' | 'budget';

// Petites préférences d'affichage de l'onglet Objectifs (mois consulté, sections
// dépliées) — pas des données métier, juste du confort ; persistées en local pour
// retrouver la même vue en revenant sur la page, tolérant aux navigateurs privés.
function loadPref<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw !== null ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function savePref(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}

export function Goals() {
  const { products, sales, expenses } = useStore();
  const { fmt } = useCurrency();

  const [mainTab, setMainTab] = useState<MainTab>('objectifs');

  // ─── Budget prévisionnel ─────────────────────────────────────────────────────
  const [forecast, setForecast] = useState<BudgetForecast | null>(null);
  const [recurringExpenses, setRecurringExpenses] = useState<RecurringExpense[]>([]);
  const [forecastLoading, setForecastLoading] = useState(true);
  const [qtyMap, setQtyMap] = useState<Record<string, string>>({});
  const [adBudgetMap, setAdBudgetMap] = useState<Record<string, string>>({});
  const [savingQty, setSavingQty] = useState(false);
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<BudgetForecast['expenses'][number] | null>(null);
  const [expenseForm, setExpenseForm] = useState({ category: 'other', description: '', amount: 0 });
  const [deleteExpenseId, setDeleteExpenseId] = useState<string | null>(null);
  const [showOtherExpenses, setShowOtherExpenses] = useState(() => loadPref('kza_goals_show_other_expenses', false));
  const [pubExpanded, setPubExpanded] = useState(() => loadPref('kza_goals_pub_expanded', false));
  const [selectedMonth, setSelectedMonth] = useState(() => loadPref('kza_goals_selected_month', new Date().toISOString().slice(0, 7)));

  useEffect(() => savePref('kza_goals_show_other_expenses', showOtherExpenses), [showOtherExpenses]);
  useEffect(() => savePref('kza_goals_pub_expanded', pubExpanded), [pubExpanded]);
  useEffect(() => savePref('kza_goals_selected_month', selectedMonth), [selectedMonth]);

  useEffect(() => {
    Promise.all([budgetForecastApi.get(), recurringExpensesApi.getAll()])
      .then(([f, r]) => {
        setForecast(f);
        setRecurringExpenses(r);
        const map: Record<string, string> = {};
        const adMap: Record<string, string> = {};
        f.products.forEach(fp => {
          map[fp.productId] = String(fp.quantity);
          if (fp.adBudgetOverride != null) adMap[fp.productId] = String(fp.adBudgetOverride);
        });
        setQtyMap(map);
        setAdBudgetMap(adMap);
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

  // Ratio historique (dépense pub / unité vendue) par produit — valeur par défaut
  // affichée en placeholder quand aucune surcharge manuelle n'est saisie.
  const adSpendPerUnit = useMemo(() => computeAdSpendPerUnit(products, sales, expenses), [products, sales, expenses]);

  // ─── Objectif vs Budget prévisionnel vs Réalisé (mois sélectionné) ──────────
  const currentForecastMonth = useMemo(
    () => forecastMonths.find(m => m.monthKey === selectedMonth),
    [forecastMonths, selectedMonth],
  );
  const realizedByProduct = useMemo(() => computeRealizedByProduct(sales, selectedMonth), [sales, selectedMonth]);

  const comparisonRows = useMemo(() => {
    const productIds = new Set<string>();
    if (currentForecastMonth) Object.keys(currentForecastMonth.quantitiesByProduct).forEach(id => productIds.add(id));

    return [...productIds].map(productId => {
      const product = products.find(p => p.id === productId);
      const forecastQty = currentForecastMonth?.quantitiesByProduct[productId] ?? null;
      const realizedQty = realizedByProduct[productId] ?? 0;
      const reference = forecastQty ?? 0;
      const pct = reference > 0 ? Math.min(100, (realizedQty / reference) * 100) : 0;
      return { productId, productName: product?.name ?? 'Produit inconnu', forecastQty, realizedQty, pct };
    }).filter(r => r.forecastQty !== null)
      .sort((a, b) => b.pct - a.pct);
  }, [currentForecastMonth, realizedByProduct, products]);

  // Progression globale du mois = moyenne de la progression (réalisé/prévisionnel) par
  // produit — même sens que les barres individuelles, résumé en un seul indicateur.
  const globalProgressPct = useMemo(
    () => comparisonRows.length > 0 ? comparisonRows.reduce((s, r) => s + r.pct, 0) / comparisonRows.length : 0,
    [comparisonRows],
  );

  // ─── Dépenses : Prévu (budget prévisionnel) vs Réalisé (vraies dépenses du mois) ──
  const realizedExpensesByCategory = useMemo(() => {
    const result: Record<string, number> = {};
    expenses
      .filter(e => e.date.slice(0, 7) === selectedMonth)
      .forEach(e => { result[e.category] = (result[e.category] ?? 0) + e.amount; });
    return result;
  }, [expenses, selectedMonth]);

  const pubExpenseRow = useMemo(() => {
    const forecastAmount = currentForecastMonth?.adBudget ?? 0;
    const realizedAmount = realizedExpensesByCategory['pub'] ?? 0;
    const pct = forecastAmount > 0 ? Math.min(100, (realizedAmount / forecastAmount) * 100) : 0;
    return { forecastAmount, realizedAmount, pct };
  }, [currentForecastMonth, realizedExpensesByCategory]);

  // Détail pub par produit (dérouable) — seule dépense rattachée à des produits
  // individuels (via Expense.productId), donc la seule à pouvoir se décliner ainsi.
  const realizedPubByProduct = useMemo(() => {
    const result: Record<string, number> = {};
    expenses
      .filter(e => e.category === 'pub' && e.date.slice(0, 7) === selectedMonth)
      .forEach(e => {
        const key = e.productId ?? '__none__';
        result[key] = (result[key] ?? 0) + e.amount;
      });
    return result;
  }, [expenses, selectedMonth]);

  const pubByProductRows = useMemo(() => {
    const productIds = new Set<string>();
    if (currentForecastMonth) Object.keys(currentForecastMonth.adBudgetByProduct).forEach(id => productIds.add(id));
    Object.keys(realizedPubByProduct).forEach(id => { if (id !== '__none__') productIds.add(id); });

    const rows = [...productIds].map(productId => {
      const forecastAmount = currentForecastMonth?.adBudgetByProduct[productId] ?? 0;
      const realizedAmount = realizedPubByProduct[productId] ?? 0;
      const pct = forecastAmount > 0 ? Math.min(100, (realizedAmount / forecastAmount) * 100) : 0;
      return { productId, productName: products.find(p => p.id === productId)?.name ?? 'Produit inconnu', forecastAmount, realizedAmount, pct };
    }).sort((a, b) => b.realizedAmount - a.realizedAmount);

    // Dépenses pub réelles sans produit rattaché — pas de prévu correspondant (le
    // prévisionnel se construit toujours à partir d'une quantité par produit).
    if (realizedPubByProduct['__none__']) {
      rows.push({ productId: '__none__', productName: 'Sans produit rattaché', forecastAmount: 0, realizedAmount: realizedPubByProduct['__none__'], pct: 0 });
    }
    return rows;
  }, [currentForecastMonth, realizedPubByProduct, products]);

  // Autres catégories d'OPEX connues (dépenses récurrentes) — optionnelles, repliées
  // par défaut derrière une case à cocher pour ne pas noyer la pub dans le détail.
  const otherExpenseRows = useMemo(() => {
    return forecastOpexCategories
      .filter(cat => cat !== 'pub')
      .map(cat => {
        const forecastAmount = currentForecastMonth?.knownOpexByCategory[cat] ?? 0;
        const realizedAmount = realizedExpensesByCategory[cat] ?? 0;
        const pct = forecastAmount > 0 ? Math.min(100, (realizedAmount / forecastAmount) * 100) : 0;
        return { category: cat, forecastAmount, realizedAmount, pct };
      });
  }, [forecastOpexCategories, currentForecastMonth, realizedExpensesByCategory]);

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
        .map(([productId, q]) => ({
          productId,
          quantity: Number(q),
          adBudgetOverride: adBudgetMap[productId] ? Number(adBudgetMap[productId]) : null,
        }));
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

  return (
    <div className="space-y-5 overflow-x-hidden">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 truncate">
            {mainTab === 'objectifs' ? 'Objectifs de Vente' : 'Budget prévisionnel'}
          </h1>
          <p className="text-xs sm:text-sm text-gray-500">
            {mainTab === 'objectifs'
              ? 'Progression du mois sélectionné par rapport au budget prévisionnel'
              : 'Projection dynamique à partir des quantités visées par produit'}
          </p>
        </div>
        {mainTab === 'objectifs' && (
          <input
            type="month"
            value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value)}
            className="shrink-0 border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300"
          />
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
      {comparisonRows.length > 0 && (
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl p-5 text-white">
          <div className="flex items-center gap-3 mb-3">
            <Target size={22} />
            <span className="font-semibold">Progression globale du mois</span>
          </div>
          <div className="text-4xl font-black mb-2">{Math.round(globalProgressPct)}%</div>
          <div className="w-full bg-white/20 rounded-full h-2">
            <div
              className="h-2 rounded-full bg-white transition-all"
              style={{ width: `${Math.min(100, globalProgressPct)}%` }}
            />
          </div>
          <div className="flex items-center gap-2 text-sm text-white/70 mt-2">
            <TrendingUp size={14} />
            Moyenne sur {comparisonRows.length} produit{comparisonRows.length !== 1 ? 's' : ''} suivi{comparisonRows.length !== 1 ? 's' : ''}
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 pb-3">
          <h2 className="font-semibold text-gray-900 text-sm">Budget prévisionnel vs Réalisé</h2>
          <p className="text-xs text-gray-400">
            {currentForecastMonth ? `Mois affiché : ${currentForecastMonth.label}` : "Le budget prévisionnel ne couvre pas ce mois-là."}
          </p>
        </div>
        {comparisonRows.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-10">Aucune quantité projetée pour ce mois — définis le budget prévisionnel dans l'autre onglet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left font-medium text-gray-500 px-4 py-2">Produit</th>
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
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 pb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-gray-900 text-sm">Dépenses : Prévu vs Réalisé</h2>
            <p className="text-xs text-gray-400">
              {currentForecastMonth ? `Mois affiché : ${currentForecastMonth.label}` : "Le budget prévisionnel ne couvre pas ce mois-là."} — surtout la publicité.
            </p>
          </div>
          {otherExpenseRows.length > 0 && (
            <label className="flex items-center gap-1.5 text-xs text-gray-500 shrink-0 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showOtherExpenses}
                onChange={e => setShowOtherExpenses(e.target.checked)}
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-300"
              />
              Autres dépenses
            </label>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left font-medium text-gray-500 px-4 py-2">Catégorie</th>
                <th className="text-right font-medium text-gray-500 px-3 py-2">Prévu</th>
                <th className="text-right font-medium text-gray-500 px-3 py-2">Réalisé</th>
                <th className="text-left font-medium text-gray-500 px-4 py-2 w-1/3">Progression</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const color = pubExpenseRow.pct >= 100 ? 'bg-red-500' : pubExpenseRow.pct >= 60 ? 'bg-amber-500' : 'bg-emerald-500';
                return (
                  <tr className="border-b border-gray-50">
                    <td className="px-4 py-2.5 text-gray-800 font-medium">
                      <button
                        onClick={() => setPubExpanded(v => !v)}
                        className="flex items-center gap-1.5 hover:text-indigo-600"
                      >
                        {pubExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        Publicité
                      </button>
                    </td>
                    <td className="text-right px-3 py-2.5 text-gray-600">{fmt(pubExpenseRow.forecastAmount)}</td>
                    <td className="text-right px-3 py-2.5 font-semibold text-gray-900">{fmt(pubExpenseRow.realizedAmount)}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-100 rounded-full h-2">
                          <div className={`h-2 rounded-full ${color}`} style={{ width: `${pubExpenseRow.pct}%` }} />
                        </div>
                        <span className="text-xs text-gray-500 w-10 text-right shrink-0">{Math.round(pubExpenseRow.pct)}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })()}
              {pubExpanded && pubByProductRows.map(r => {
                const color = r.pct >= 100 ? 'bg-red-400' : r.pct >= 60 ? 'bg-amber-400' : 'bg-emerald-400';
                return (
                  <tr key={r.productId} className="border-b border-gray-50 bg-gray-50/50">
                    <td className="pl-9 pr-4 py-2 text-gray-500 text-xs truncate max-w-[200px]">{r.productName}</td>
                    <td className="text-right px-3 py-2 text-gray-500 text-xs">{r.forecastAmount ? fmt(r.forecastAmount) : '—'}</td>
                    <td className="text-right px-3 py-2 font-medium text-gray-700 text-xs">{fmt(r.realizedAmount)}</td>
                    <td className="px-4 py-2">
                      {r.forecastAmount > 0 ? (
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                            <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${r.pct}%` }} />
                          </div>
                          <span className="text-[11px] text-gray-400 w-10 text-right shrink-0">{Math.round(r.pct)}%</span>
                        </div>
                      ) : (
                        <span className="text-[11px] text-gray-300">Pas de budget prévu</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {pubExpanded && pubByProductRows.length === 0 && (
                <tr className="border-b border-gray-50 bg-gray-50/50">
                  <td colSpan={4} className="px-9 py-2 text-xs text-gray-400">Aucune dépense pub ni quantité projetée ce mois-ci, par produit.</td>
                </tr>
              )}
              {showOtherExpenses && otherExpenseRows.map(r => {
                const color = r.pct >= 100 ? 'bg-red-500' : r.pct >= 60 ? 'bg-amber-500' : 'bg-emerald-500';
                return (
                  <tr key={r.category} className="border-b border-gray-50">
                    <td className="px-4 py-2.5 text-gray-700">{catLabel(r.category)}</td>
                    <td className="text-right px-3 py-2.5 text-gray-600">{fmt(r.forecastAmount)}</td>
                    <td className="text-right px-3 py-2.5 font-semibold text-gray-900">{fmt(r.realizedAmount)}</td>
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
        <p className="text-[11px] text-gray-400 px-4 pb-3 pt-1">Vert = sous le budget, orange = proche, rouge = dépassé.</p>
      </div>
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

          {/* Projected quantities + ad budget per product, month by month */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="flex items-center justify-between p-4 pb-3">
              <div>
                <h2 className="font-semibold text-gray-900 text-sm">Quantité et budget pub projetés, par mois</h2>
                <p className="text-xs text-gray-400">
                  Seul le premier mois se saisit — les suivants appliquent la croissance de {forecast.monthlyGrowthPct}%/mois automatiquement.
                  Budget pub laissé vide = calculé depuis l'historique du produit (dépense pub / unité vendue).
                </p>
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
                        <th key={m.monthKey} className="text-right font-medium text-gray-500 px-3 py-2 whitespace-nowrap min-w-[90px]">{m.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {products.filter(p => p.trackStock !== false).map(p => {
                      const computedAdBudget = (Number(qtyMap[p.id]) || 0) * (adSpendPerUnit[p.id] ?? 0);
                      return (
                        <tr key={p.id} className="border-b border-gray-50">
                          <td className="px-4 py-1.5 text-gray-700 truncate sticky left-0 bg-white max-w-[160px]">{p.name}</td>
                          <td className="px-2 py-1.5">
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-1">
                                <span className="text-[9px] text-gray-400 w-7 shrink-0">Qté</span>
                                <input
                                  type="number" min={0}
                                  value={qtyMap[p.id] ?? ''}
                                  onChange={e => setQtyMap(m => ({ ...m, [p.id]: e.target.value }))}
                                  placeholder="0"
                                  className="w-24 border border-gray-200 rounded-lg px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300 text-right"
                                />
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="text-[9px] text-gray-400 w-7 shrink-0">Pub</span>
                                <input
                                  type="number" min={0}
                                  value={adBudgetMap[p.id] ?? ''}
                                  onChange={e => setAdBudgetMap(m => ({ ...m, [p.id]: e.target.value }))}
                                  placeholder={computedAdBudget ? String(Math.round(computedAdBudget)) : '0'}
                                  title="Budget pub pour ce produit — vide = calculé automatiquement depuis l'historique"
                                  className="w-24 border border-gray-200 rounded-lg px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-indigo-300 text-right text-gray-500"
                                />
                              </div>
                            </div>
                          </td>
                          {forecastMonths.slice(1).map(m => (
                            <td key={m.monthKey} className="text-right px-3 py-1.5 text-gray-400">
                              <div>{Math.round(m.quantitiesByProduct[p.id] ?? 0) || '—'}</div>
                              <div className="text-[10px] text-gray-300">{m.adBudgetByProduct[p.id] ? fmt(m.adBudgetByProduct[p.id]) : '—'}</div>
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                    <tr className="bg-gray-50 font-semibold">
                      <td className="px-4 py-2 text-gray-700 sticky left-0 bg-gray-50">Total</td>
                      {forecastMonths.map(m => (
                        <td key={m.monthKey} className="text-right px-3 py-2 text-gray-800">
                          <div>{Math.round(Object.values(m.quantitiesByProduct).reduce((s, q) => s + q, 0))}</div>
                          <div className="text-[10px] font-normal text-gray-400">{fmt(m.adBudget)}</div>
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
