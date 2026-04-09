import { useState, useMemo } from 'react';
import { Plus, Trash2, Edit2, Target, TrendingUp } from 'lucide-react';
import { useStore } from '../store/useStore';
import { computeGoalProgress } from '../utils/calculations';
import { useCurrency } from '../hooks/useCurrency';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { ProgressBar } from '../components/ui/ProgressBar';
import type { SalesGoal } from '../types';

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

export function Goals() {
  const { products, sales, goals, addGoal, updateGoal, deleteGoal } = useStore();
  const { fmt } = useCurrency();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SalesGoal | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());

  const progress = useMemo(() => computeGoalProgress(goals, sales, products), [goals, sales, products]);

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
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Objectifs de Vente</h1>
          <p className="text-sm text-gray-500">{goals.length} objectif{goals.length !== 1 ? 's' : ''} définis</p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
        >
          <Plus size={16} /> Définir objectif
        </button>
      </div>

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
    </div>
  );
}
