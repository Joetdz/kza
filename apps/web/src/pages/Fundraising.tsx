import { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2, Edit2, ArrowLeft, PiggyBank, Users, Ticket, Calendar, Lock } from 'lucide-react';
import { fundraisingApi, type FundraisingCampaign, type FundraisingInvestment } from '../api';
import { useCurrency } from '../hooks/useCurrency';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { NumberInput } from '../components/ui/NumberInput';
import { toast } from '../hooks/useToast';

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: 'En attente', color: 'bg-gray-100 text-gray-600' },
  partially_repaid: { label: 'Partiellement remboursé', color: 'bg-amber-100 text-amber-700' },
  repaid: { label: 'Remboursé', color: 'bg-emerald-100 text-emerald-700' },
};

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

const emptyCampaignForm = () => ({
  name: '',
  description: '',
  targetAmount: 0,
  entryTicket: 0,
  maxInvestors: '' as string | number,
  repaymentDueDate: '',
});

const emptyInvestmentForm = () => ({
  investorEmail: '',
  investorName: '',
  investorPhone: '',
  investorPassword: '',
  amount: 0,
  repaymentAmount: 0,
  repaymentDueDate: '',
  investedAt: todayStr(),
});

export function Fundraising() {
  const { fmt } = useCurrency();
  const [campaigns, setCampaigns] = useState<FundraisingCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [campaignModalOpen, setCampaignModalOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<FundraisingCampaign | null>(null);
  const [campaignForm, setCampaignForm] = useState(emptyCampaignForm());
  const [deleteCampaignId, setDeleteCampaignId] = useState<string | null>(null);

  const [investmentModalOpen, setInvestmentModalOpen] = useState(false);
  const [investmentForm, setInvestmentForm] = useState(emptyInvestmentForm());
  const [editingInvestment, setEditingInvestment] = useState<FundraisingInvestment | null>(null);
  const [repayForm, setRepayForm] = useState({ repaidAmount: 0, repaymentAmount: 0, repaymentDueDate: '' });
  const [deleteInvestmentId, setDeleteInvestmentId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    fundraisingApi.listCampaigns()
      .then(setCampaigns)
      .catch(e => toast.error(e?.message ?? 'Impossible de charger les cagnottes'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const selected = campaigns.find(c => c.id === selectedId) ?? null;

  const campaignStats = useMemo(() => {
    return campaigns.reduce<Record<string, { raised: number; investorCount: number; repaid: number; promised: number }>>((acc, c) => {
      const investorIds = new Set(c.investments.map(i => i.investorId));
      acc[c.id] = {
        raised: c.investments.reduce((s, i) => s + i.amount, 0),
        investorCount: investorIds.size,
        repaid: c.investments.reduce((s, i) => s + i.repaidAmount, 0),
        promised: c.investments.reduce((s, i) => s + i.repaymentAmount, 0),
      };
      return acc;
    }, {});
  }, [campaigns]);

  // ─── Campagnes ────────────────────────────────────────────────
  const openAddCampaign = () => {
    setEditingCampaign(null);
    setCampaignForm(emptyCampaignForm());
    setCampaignModalOpen(true);
  };

  const openEditCampaign = (c: FundraisingCampaign) => {
    setEditingCampaign(c);
    setCampaignForm({
      name: c.name,
      description: c.description,
      targetAmount: c.targetAmount,
      entryTicket: c.entryTicket,
      maxInvestors: c.maxInvestors ?? '',
      repaymentDueDate: c.repaymentDueDate ?? '',
    });
    setCampaignModalOpen(true);
  };

  const handleSaveCampaign = async () => {
    if (!campaignForm.name.trim() || campaignForm.targetAmount <= 0 || campaignForm.entryTicket <= 0) {
      toast.error('Nom, cagnotte visée et ticket d\'entrée sont obligatoires');
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: campaignForm.name,
        description: campaignForm.description,
        targetAmount: campaignForm.targetAmount,
        entryTicket: campaignForm.entryTicket,
        maxInvestors: campaignForm.maxInvestors === '' ? null : Number(campaignForm.maxInvestors),
        repaymentDueDate: campaignForm.repaymentDueDate || null,
      };
      if (editingCampaign) {
        const updated = await fundraisingApi.updateCampaign(editingCampaign.id, body);
        setCampaigns(cs => cs.map(c => c.id === updated.id ? updated : c));
      } else {
        const created = await fundraisingApi.createCampaign(body);
        setCampaigns(cs => [created, ...cs]);
      }
      setCampaignModalOpen(false);
    } catch (e: any) {
      toast.error(e?.message ?? 'Impossible de sauvegarder la cagnotte');
    } finally {
      setSaving(false);
    }
  };

  const toggleCampaignStatus = async (c: FundraisingCampaign) => {
    try {
      const updated = await fundraisingApi.updateCampaign(c.id, { status: c.status === 'active' ? 'closed' : 'active' });
      setCampaigns(cs => cs.map(x => x.id === updated.id ? updated : x));
    } catch (e: any) {
      toast.error(e?.message ?? 'Impossible de changer le statut');
    }
  };

  const handleDeleteCampaign = async () => {
    if (!deleteCampaignId) return;
    try {
      await fundraisingApi.removeCampaign(deleteCampaignId);
      setCampaigns(cs => cs.filter(c => c.id !== deleteCampaignId));
      if (selectedId === deleteCampaignId) setSelectedId(null);
    } catch (e: any) {
      toast.error(e?.message ?? 'Impossible de supprimer');
    } finally {
      setDeleteCampaignId(null);
    }
  };

  // ─── Investissements ──────────────────────────────────────────
  const openAddInvestment = () => {
    if (!selected) return;
    setInvestmentForm({
      ...emptyInvestmentForm(),
      amount: selected.entryTicket,
      repaymentAmount: selected.entryTicket,
      repaymentDueDate: selected.repaymentDueDate ?? '',
    });
    setInvestmentModalOpen(true);
  };

  const handleSaveInvestment = async () => {
    if (!selected) return;
    if (!investmentForm.investorEmail.trim() || !investmentForm.investorName.trim() || investmentForm.amount <= 0) {
      toast.error('Email, nom et montant investi sont obligatoires');
      return;
    }
    setSaving(true);
    try {
      const created = await fundraisingApi.addInvestment(selected.id, {
        investorEmail: investmentForm.investorEmail,
        investorName: investmentForm.investorName,
        investorPhone: investmentForm.investorPhone || undefined,
        investorPassword: investmentForm.investorPassword || undefined,
        amount: investmentForm.amount,
        repaymentAmount: investmentForm.repaymentAmount || investmentForm.amount,
        repaymentDueDate: investmentForm.repaymentDueDate || undefined,
        investedAt: investmentForm.investedAt || undefined,
      });
      setCampaigns(cs => cs.map(c => c.id === selected.id ? { ...c, investments: [created, ...c.investments] } : c));
      setInvestmentModalOpen(false);
    } catch (e: any) {
      toast.error(e?.message ?? 'Impossible d\'ajouter cet investisseur');
    } finally {
      setSaving(false);
    }
  };

  const openRepay = (inv: FundraisingInvestment) => {
    setEditingInvestment(inv);
    setRepayForm({ repaidAmount: inv.repaidAmount, repaymentAmount: inv.repaymentAmount, repaymentDueDate: inv.repaymentDueDate ?? '' });
  };

  const handleSaveRepay = async () => {
    if (!editingInvestment || !selected) return;
    setSaving(true);
    try {
      const updated = await fundraisingApi.updateInvestment(editingInvestment.id, {
        repaidAmount: repayForm.repaidAmount,
        repaymentAmount: repayForm.repaymentAmount,
        repaymentDueDate: repayForm.repaymentDueDate || undefined,
      });
      setCampaigns(cs => cs.map(c => c.id === selected.id
        ? { ...c, investments: c.investments.map(i => i.id === updated.id ? { ...updated, investor: i.investor } : i) }
        : c));
      setEditingInvestment(null);
    } catch (e: any) {
      toast.error(e?.message ?? 'Impossible de mettre à jour');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteInvestment = async () => {
    if (!deleteInvestmentId || !selected) return;
    try {
      await fundraisingApi.removeInvestment(deleteInvestmentId);
      setCampaigns(cs => cs.map(c => c.id === selected.id
        ? { ...c, investments: c.investments.filter(i => i.id !== deleteInvestmentId) }
        : c));
    } catch (e: any) {
      toast.error(e?.message ?? 'Impossible de supprimer');
    } finally {
      setDeleteInvestmentId(null);
    }
  };

  if (loading) {
    return <p className="text-sm text-gray-400 text-center py-16">Chargement...</p>;
  }

  // ─── Vue détail d'une cagnotte ────────────────────────────────
  if (selected) {
    const stats = campaignStats[selected.id] ?? { raised: 0, investorCount: 0, repaid: 0, promised: 0 };
    const raisedPct = selected.targetAmount > 0 ? Math.min(100, (stats.raised / selected.targetAmount) * 100) : 0;
    const repaidPct = stats.promised > 0 ? Math.min(100, (stats.repaid / stats.promised) * 100) : 0;

    return (
      <div className="space-y-5 overflow-x-hidden">
        <button onClick={() => setSelectedId(null)} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
          <ArrowLeft size={16} /> Toutes les cagnottes
        </button>

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 truncate">{selected.name}</h1>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${selected.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
                {selected.status === 'active' ? 'Active' : 'Clôturée'}
              </span>
            </div>
            {selected.description && <p className="text-sm text-gray-500 mt-1">{selected.description}</p>}
          </div>
          <div className="flex gap-2 shrink-0">
            <button onClick={() => openEditCampaign(selected)} className="p-2 rounded-xl bg-gray-100 text-gray-500 hover:bg-gray-200"><Edit2 size={16} /></button>
            <button onClick={() => toggleCampaignStatus(selected)} className="px-3 py-2 rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200 text-xs font-medium">
              {selected.status === 'active' ? 'Clôturer' : 'Réactiver'}
            </button>
            {selected.investments.length === 0 && (
              <button onClick={() => setDeleteCampaignId(selected.id)} className="p-2 rounded-xl bg-red-50 text-red-400 hover:bg-red-100"><Trash2 size={16} /></button>
            )}
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-2"><PiggyBank size={16} /> Montant levé</div>
            <div className="text-2xl font-bold text-gray-900">{fmt(stats.raised)} <span className="text-sm font-normal text-gray-400">/ {fmt(selected.targetAmount)}</span></div>
            <div className="w-full bg-gray-100 rounded-full h-2 mt-3">
              <div className="h-2 rounded-full bg-indigo-500" style={{ width: `${raisedPct}%` }} />
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-2"><Users size={16} /> Remboursement</div>
            <div className="text-2xl font-bold text-gray-900">{fmt(stats.repaid)} <span className="text-sm font-normal text-gray-400">/ {fmt(stats.promised)}</span></div>
            <div className="w-full bg-gray-100 rounded-full h-2 mt-3">
              <div className={`h-2 rounded-full ${repaidPct >= 100 ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${repaidPct}%` }} />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1.5"><Ticket size={13} /> Ticket d'entrée : <strong className="text-gray-700">{fmt(selected.entryTicket)}</strong></span>
          <span className="flex items-center gap-1.5"><Users size={13} /> Investisseurs : <strong className="text-gray-700">{stats.investorCount}{selected.maxInvestors ? ` / ${selected.maxInvestors}` : ''}</strong></span>
          {selected.repaymentDueDate && <span className="flex items-center gap-1.5"><Calendar size={13} /> Échéance par défaut : <strong className="text-gray-700">{selected.repaymentDueDate}</strong></span>}
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="flex items-center justify-between p-4 pb-3">
            <h2 className="font-semibold text-gray-900 text-sm">Investisseurs</h2>
            <button onClick={openAddInvestment} className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-xl text-xs font-medium transition-colors">
              <Plus size={14} /> Ajouter un investisseur
            </button>
          </div>
          {selected.investments.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10">Aucun investisseur pour l'instant.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left font-medium text-gray-500 px-4 py-2">Investisseur</th>
                    <th className="text-right font-medium text-gray-500 px-3 py-2">Investi</th>
                    <th className="text-right font-medium text-gray-500 px-3 py-2">À rembourser</th>
                    <th className="text-right font-medium text-gray-500 px-3 py-2">Remboursé</th>
                    <th className="text-left font-medium text-gray-500 px-3 py-2">Échéance</th>
                    <th className="text-left font-medium text-gray-500 px-3 py-2">Statut</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {selected.investments.map(inv => {
                    const st = STATUS_LABELS[inv.status] ?? STATUS_LABELS.pending;
                    return (
                      <tr key={inv.id} className="border-b border-gray-50">
                        <td className="px-4 py-2.5">
                          <div className="font-medium text-gray-800 truncate max-w-[160px]">{inv.investor?.name ?? '—'}</div>
                          <div className="text-xs text-gray-400 truncate max-w-[160px]">{inv.investor?.email}</div>
                        </td>
                        <td className="text-right px-3 py-2.5 text-gray-700">{fmt(inv.amount)}</td>
                        <td className="text-right px-3 py-2.5 text-gray-700">{fmt(inv.repaymentAmount)}</td>
                        <td className="text-right px-3 py-2.5 font-semibold text-gray-900">{fmt(inv.repaidAmount)}</td>
                        <td className="px-3 py-2.5 text-gray-500 text-xs">{inv.repaymentDueDate ?? '—'}</td>
                        <td className="px-3 py-2.5">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex gap-1 justify-end">
                            <button onClick={() => openRepay(inv)} className="p-1.5 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200" title="Mettre à jour le remboursement"><Edit2 size={13} /></button>
                            <button onClick={() => setDeleteInvestmentId(inv.id)} className="p-1.5 rounded-lg bg-red-50 text-red-400 hover:bg-red-100"><Trash2 size={13} /></button>
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

        {/* Modal ajout investisseur */}
        <Modal open={investmentModalOpen} onClose={() => setInvestmentModalOpen(false)} title="Ajouter un investisseur" size="sm">
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Email *</label>
              <input type="email" value={investmentForm.investorEmail} onChange={e => setInvestmentForm(f => ({ ...f, investorEmail: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Nom *</label>
              <input type="text" value={investmentForm.investorName} onChange={e => setInvestmentForm(f => ({ ...f, investorName: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Téléphone</label>
              <input type="text" value={investmentForm.investorPhone} onChange={e => setInvestmentForm(f => ({ ...f, investorPhone: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 flex items-center gap-1.5"><Lock size={12} /> Mot de passe initial du portail *</label>
              <input type="text" value={investmentForm.investorPassword} onChange={e => setInvestmentForm(f => ({ ...f, investorPassword: e.target.value }))}
                placeholder="6 caractères minimum"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300" />
              <p className="text-xs text-gray-400 mt-1">Communique-le toi-même à l'investisseur (WhatsApp, téléphone...). Ignoré si cet email a déjà un compte.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Montant investi *</label>
                <NumberInput value={investmentForm.amount} onChange={val => setInvestmentForm(f => ({ ...f, amount: val }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Montant à rembourser</label>
                <NumberInput value={investmentForm.repaymentAmount} onChange={val => setInvestmentForm(f => ({ ...f, repaymentAmount: val }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Date d'investissement</label>
                <input type="date" value={investmentForm.investedAt} onChange={e => setInvestmentForm(f => ({ ...f, investedAt: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Échéance de remboursement</label>
                <input type="date" value={investmentForm.repaymentDueDate} onChange={e => setInvestmentForm(f => ({ ...f, repaymentDueDate: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300" />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setInvestmentModalOpen(false)} className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700">Annuler</button>
              <button onClick={handleSaveInvestment} disabled={saving} className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-60">
                {saving ? 'Ajout...' : 'Ajouter'}
              </button>
            </div>
          </div>
        </Modal>

        {/* Modal mise à jour remboursement */}
        <Modal open={!!editingInvestment} onClose={() => setEditingInvestment(null)} title="Mettre à jour le remboursement" size="sm">
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Montant à rembourser</label>
              <NumberInput value={repayForm.repaymentAmount} onChange={val => setRepayForm(f => ({ ...f, repaymentAmount: val }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Montant déjà remboursé</label>
              <NumberInput value={repayForm.repaidAmount} onChange={val => setRepayForm(f => ({ ...f, repaidAmount: val }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300" />
              <p className="text-xs text-gray-400 mt-1">Le statut (en attente / partiel / remboursé) se met à jour automatiquement.</p>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Échéance de remboursement</label>
              <input type="date" value={repayForm.repaymentDueDate} onChange={e => setRepayForm(f => ({ ...f, repaymentDueDate: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300" />
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setEditingInvestment(null)} className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700">Annuler</button>
              <button onClick={handleSaveRepay} disabled={saving} className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-60">
                {saving ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </Modal>

        <ConfirmDialog
          open={!!deleteInvestmentId}
          title="Supprimer cet investissement"
          message="Cette ligne sera définitivement supprimée."
          onConfirm={handleDeleteInvestment}
          onCancel={() => setDeleteInvestmentId(null)}
        />
      </div>
    );
  }

  // ─── Vue liste des cagnottes ───────────────────────────────────
  return (
    <div className="space-y-5 overflow-x-hidden">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 truncate">Levée de fonds</h1>
          <p className="text-xs sm:text-sm text-gray-500">{campaigns.length} cagnotte{campaigns.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={openAddCampaign} className="shrink-0 flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3 sm:px-4 py-2.5 rounded-xl text-sm font-medium transition-colors">
          <Plus size={16} /><span className="hidden sm:inline">Nouvelle cagnotte</span>
        </button>
      </div>

      {campaigns.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <PiggyBank size={48} className="mx-auto mb-3 text-gray-200" />
          <p className="text-lg">Aucune cagnotte</p>
          <p className="text-sm mt-1">Crée ta première campagne de levée de fonds</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {campaigns.map(c => {
            const stats = campaignStats[c.id] ?? { raised: 0, investorCount: 0, repaid: 0, promised: 0 };
            const raisedPct = c.targetAmount > 0 ? Math.min(100, (stats.raised / c.targetAmount) * 100) : 0;
            return (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className="text-left bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:border-indigo-200 transition-all"
              >
                <div className="flex items-start justify-between mb-2 gap-2">
                  <div className="font-semibold text-gray-900 truncate">{c.name}</div>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${c.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
                    {c.status === 'active' ? 'Active' : 'Clôturée'}
                  </span>
                </div>
                <div className="text-lg font-bold text-gray-900">{fmt(stats.raised)}</div>
                <div className="text-xs text-gray-400 mb-2">sur {fmt(c.targetAmount)} visés</div>
                <div className="w-full bg-gray-100 rounded-full h-2 mb-3">
                  <div className="h-2 rounded-full bg-indigo-500" style={{ width: `${raisedPct}%` }} />
                </div>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span className="flex items-center gap-1"><Users size={12} /> {stats.investorCount}{c.maxInvestors ? `/${c.maxInvestors}` : ''}</span>
                  <span className="flex items-center gap-1"><Ticket size={12} /> {fmt(c.entryTicket)}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <Modal open={campaignModalOpen} onClose={() => setCampaignModalOpen(false)} title={editingCampaign ? 'Modifier la cagnotte' : 'Nouvelle cagnotte'} size="sm">
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Nom *</label>
            <input type="text" value={campaignForm.name} onChange={e => setCampaignForm(f => ({ ...f, name: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Description</label>
            <input type="text" value={campaignForm.description} onChange={e => setCampaignForm(f => ({ ...f, description: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Cagnotte visée *</label>
              <NumberInput value={campaignForm.targetAmount} onChange={val => setCampaignForm(f => ({ ...f, targetAmount: val }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Ticket d'entrée *</label>
              <NumberInput value={campaignForm.entryTicket} onChange={val => setCampaignForm(f => ({ ...f, entryTicket: val }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Nombre d'investisseurs max</label>
              <input type="number" min={1} value={campaignForm.maxInvestors}
                onChange={e => setCampaignForm(f => ({ ...f, maxInvestors: e.target.value }))}
                placeholder="Illimité"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Échéance par défaut</label>
              <input type="date" value={campaignForm.repaymentDueDate}
                onChange={e => setCampaignForm(f => ({ ...f, repaymentDueDate: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300" />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setCampaignModalOpen(false)} className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700">Annuler</button>
            <button onClick={handleSaveCampaign} disabled={saving} className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-60">
              {saving ? 'Enregistrement...' : editingCampaign ? 'Enregistrer' : 'Créer'}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteCampaignId}
        title="Supprimer cette cagnotte"
        message="Cette cagnotte sera définitivement supprimée."
        onConfirm={handleDeleteCampaign}
        onCancel={() => setDeleteCampaignId(null)}
      />
    </div>
  );
}
