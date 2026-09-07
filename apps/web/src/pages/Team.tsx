import { useState, useEffect, useCallback } from 'react';
import {
  Users, UserPlus, Link2, Copy, Check, Trash2, ShieldCheck, Headphones,
  Loader2, AlertCircle, Clock,
} from 'lucide-react';
import { teamApi, type TeamMember, type PendingInvite } from '../api';
import { useStore } from '../store/useStore';
import { useRole } from '../hooks/useRole';
import { toast } from '../hooks/useToast';

const ROLE_LABEL: Record<string, string> = {
  manager: 'Gérant',
  operator: 'Opérateur',
};

const ROLE_HELP: Record<string, string> = {
  manager: 'Accès à tout, sauf la gestion de l’équipe.',
  operator: 'WhatsApp et logistique uniquement. Ne voit pas les finances.',
};

function inviteUrl(token: string) {
  return `${window.location.origin}/#/invitation/${token}`;
}

export function Team() {
  const businesses = useStore(s => s.businesses);
  const currentBusinessId = useStore(s => s.currentBusinessId);
  const { canManageTeam } = useRole();

  const current = businesses.find(b => b.id === currentBusinessId);

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newRole, setNewRole] = useState<'manager' | 'operator'>('operator');
  const [newLabel, setNewLabel] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!currentBusinessId || !canManageTeam) { setLoading(false); return; }
    setLoading(true);
    try {
      const data = await teamApi.list(currentBusinessId);
      setMembers(data.members);
      setInvites(data.pendingInvites);
    } catch {
      /* the banner below already explains the empty state */
    } finally {
      setLoading(false);
    }
  }, [currentBusinessId, canManageTeam]);

  useEffect(() => { load(); }, [load]);

  async function handleCreateInvite() {
    if (!currentBusinessId) return;
    setCreating(true);
    try {
      const invite = await teamApi.createInvite(currentBusinessId, {
        role: newRole,
        label: newLabel.trim() || undefined,
      });
      setInvites(prev => [invite, ...prev]);
      setNewLabel('');
      await copy(invite.token);
      toast.success('Lien d’invitation créé et copié');
    } catch (e: any) {
      toast.error(e?.message ?? 'Création impossible');
    } finally {
      setCreating(false);
    }
  }

  async function copy(token: string) {
    try {
      await navigator.clipboard.writeText(inviteUrl(token));
      setCopied(token);
      setTimeout(() => setCopied(c => (c === token ? null : c)), 2000);
    } catch {
      toast.error('Copie impossible — sélectionnez le lien manuellement');
    }
  }

  async function handleRevoke(inviteId: string) {
    if (!currentBusinessId) return;
    setInvites(prev => prev.filter(i => i.id !== inviteId));
    try {
      await teamApi.revokeInvite(currentBusinessId, inviteId);
    } catch (e: any) {
      toast.error(e?.message ?? 'Annulation impossible');
      load();
    }
  }

  async function handleRoleChange(memberId: string, role: 'manager' | 'operator') {
    if (!currentBusinessId) return;
    setMembers(prev => prev.map(m => (m.id === memberId ? { ...m, role } : m)));
    try {
      await teamApi.updateRole(currentBusinessId, memberId, role);
    } catch (e: any) {
      toast.error(e?.message ?? 'Modification impossible');
      load();
    }
  }

  async function handleRemove(memberId: string) {
    if (!currentBusinessId) return;
    if (!confirm('Retirer ce membre ? Il perdra immédiatement l’accès à ce business.')) return;
    setMembers(prev => prev.filter(m => m.id !== memberId));
    try {
      await teamApi.removeMember(currentBusinessId, memberId);
      toast.success('Membre retiré');
    } catch (e: any) {
      toast.error(e?.message ?? 'Suppression impossible');
      load();
    }
  }

  if (!canManageTeam) {
    return (
      <div className="max-w-2xl mx-auto mt-10 bg-amber-50 border border-amber-200 rounded-2xl p-6 flex gap-3">
        <AlertCircle size={20} className="text-amber-600 shrink-0 mt-0.5" />
        <div>
          <h2 className="font-semibold text-amber-900">Réservé au propriétaire</h2>
          <p className="text-sm text-amber-800 mt-1">
            Seul le propriétaire de <strong>{current?.name ?? 'ce business'}</strong> peut gérer les membres.
          </p>
        </div>
      </div>
    );
  }

  const inputCls = 'w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white';

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Users size={22} className="text-indigo-600" /> Équipe
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Invitez des collaborateurs sur <strong>{current?.name}</strong>. Chacun garde son propre compte,
          mais travaille sur les données de ce business.
        </p>
      </header>

      {/* ── Créer une invitation ─────────────────────────────────────────── */}
      <section className="bg-white border border-gray-200 rounded-2xl p-5">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
          <UserPlus size={17} className="text-indigo-600" /> Inviter quelqu’un
        </h2>

        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Rôle</label>
            <select value={newRole} onChange={e => setNewRole(e.target.value as any)} className={inputCls}>
              <option value="operator">Opérateur</option>
              <option value="manager">Gérant</option>
            </select>
            <p className="text-[11px] text-gray-500 mt-1.5">{ROLE_HELP[newRole]}</p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
              Nom <span className="font-normal text-gray-400">(pour vous y retrouver)</span>
            </label>
            <input
              type="text"
              value={newLabel}
              onChange={e => setNewLabel(e.target.value)}
              placeholder="Ex: Patrick — livreur Gombe"
              className={inputCls}
            />
          </div>
        </div>

        <button
          onClick={handleCreateInvite}
          disabled={creating}
          className="mt-4 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors"
        >
          {creating ? <Loader2 size={15} className="animate-spin" /> : <Link2 size={15} />}
          Générer le lien d’invitation
        </button>
        <p className="text-[11px] text-gray-500 mt-2">
          Le lien est copié automatiquement — envoyez-le par WhatsApp. Il est valable 7 jours
          et ne fonctionne qu’une seule fois.
        </p>
      </section>

      {/* ── Invitations en attente ───────────────────────────────────────── */}
      {invites.length > 0 && (
        <section className="bg-white border border-gray-200 rounded-2xl p-5">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2 mb-3">
            <Clock size={17} className="text-amber-500" /> En attente ({invites.length})
          </h2>
          <ul className="divide-y divide-gray-100">
            {invites.map(inv => (
              <li key={inv.id} className="py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {inv.label || 'Invitation sans nom'}
                  </p>
                  <p className="text-xs text-gray-500">
                    {ROLE_LABEL[inv.role]} · expire le{' '}
                    {new Date(inv.expiresAt).toLocaleDateString('fr-FR')}
                  </p>
                </div>
                <button
                  onClick={() => copy(inv.token)}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  {copied === inv.token ? <Check size={13} className="text-green-600" /> : <Copy size={13} />}
                  {copied === inv.token ? 'Copié' : 'Copier'}
                </button>
                <button
                  onClick={() => handleRevoke(inv.id)}
                  className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                  title="Annuler l’invitation"
                >
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Membres ──────────────────────────────────────────────────────── */}
      <section className="bg-white border border-gray-200 rounded-2xl p-5">
        <h2 className="font-semibold text-gray-900 mb-3">
          Membres ({members.length})
        </h2>

        {loading ? (
          <div className="py-8 flex justify-center text-gray-400">
            <Loader2 size={20} className="animate-spin" />
          </div>
        ) : members.length === 0 ? (
          <p className="py-6 text-sm text-gray-500 text-center">
            Personne pour l’instant. Générez un lien ci-dessus pour inviter votre premier collaborateur.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {members.map(m => (
              <li key={m.id} className="py-3 flex items-center gap-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                  m.role === 'manager' ? 'bg-indigo-50 text-indigo-600' : 'bg-gray-100 text-gray-500'
                }`}>
                  {m.role === 'manager' ? <ShieldCheck size={16} /> : <Headphones size={16} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {m.displayName || m.email || 'Membre'}
                  </p>
                  <p className="text-xs text-gray-500">
                    {ROLE_HELP[m.role]}
                  </p>
                </div>
                <select
                  value={m.role}
                  onChange={e => handleRoleChange(m.id, e.target.value as any)}
                  className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="operator">Opérateur</option>
                  <option value="manager">Gérant</option>
                </select>
                <button
                  onClick={() => handleRemove(m.id)}
                  className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                  title="Retirer du business"
                >
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
