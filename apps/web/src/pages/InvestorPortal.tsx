import { useState, useEffect } from 'react';
import { PiggyBank, LogOut, KeyRound, Calendar, Building2 } from 'lucide-react';
import {
  investorAuthApi, investorPortalApi, getInvestorToken, setInvestorToken, clearInvestorToken,
  type InvestorProfile, type InvestorInvestment,
} from '../api/investor';

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: 'En attente', color: 'bg-gray-100 text-gray-600' },
  partially_repaid: { label: 'Partiellement remboursé', color: 'bg-amber-100 text-amber-700' },
  repaid: { label: 'Remboursé', color: 'bg-emerald-100 text-emerald-700' },
};

function fmt(n: number) {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(n);
}

function LoginForm({ onSuccess }: { onSuccess: (token: string, investor: InvestorProfile) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await investorAuthApi.login(email, password);
      if (!res.ok || !res.token || !res.investor) {
        setError('Email ou mot de passe incorrect.');
        return;
      }
      onSuccess(res.token, res.investor);
    } catch {
      setError('Erreur de connexion. Réessayez.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <form onSubmit={submit} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 max-w-sm w-full">
        <div className="flex items-center gap-2 mb-1">
          <PiggyBank className="text-indigo-600" size={28} />
          <span className="text-xl font-black text-gray-900">KZA</span>
        </div>
        <h1 className="text-lg font-semibold text-gray-900 mb-1">Portail investisseur</h1>
        <p className="text-sm text-gray-500 mb-6">Connecte-toi pour voir tes investissements.</p>

        <label className="text-xs font-medium text-gray-600 mb-1 block">Email</label>
        <input
          type="email" required value={email} onChange={e => setEmail(e.target.value)}
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300 mb-4"
        />
        <label className="text-xs font-medium text-gray-600 mb-1 block">Mot de passe</label>
        <input
          type="password" required value={password} onChange={e => setPassword(e.target.value)}
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300 mb-4"
        />
        {error && <p className="text-xs text-red-500 mb-4">{error}</p>}
        <button type="submit" disabled={loading}
          className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors">
          {loading ? 'Connexion...' : 'Se connecter'}
        </button>
        <p className="text-xs text-gray-400 mt-4 text-center">
          Pas encore de compte ? L'entreprise dans laquelle tu as investi t'en crée un.
        </p>
      </form>
    </div>
  );
}

function ChangePasswordModal({ token, onClose }: { token: string; onClose: () => void }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const ERROR_LABELS: Record<string, string> = {
    wrong_password: 'Mot de passe actuel incorrect.',
    password_too_short: 'Le nouveau mot de passe doit contenir au moins 6 caractères.',
    invalid_token: 'Session expirée — reconnecte-toi.',
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await investorAuthApi.changePassword(token, currentPassword, newPassword);
      if (!res.ok) {
        setError(ERROR_LABELS[res.error ?? ''] ?? 'Impossible de changer le mot de passe');
        return;
      }
      setSuccess(true);
    } catch {
      setError('Erreur de connexion. Réessayez.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-lg p-6 max-w-sm w-full">
        <h2 className="font-semibold text-gray-900 mb-4">Changer mon mot de passe</h2>
        {success ? (
          <>
            <p className="text-sm text-emerald-600 mb-4">Mot de passe mis à jour.</p>
            <button onClick={onClose} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium">Fermer</button>
          </>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Mot de passe actuel</label>
              <input type="password" required value={currentPassword} onChange={e => setCurrentPassword(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Nouveau mot de passe</label>
              <input type="password" required minLength={6} value={newPassword} onChange={e => setNewPassword(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300" />
            </div>
            {error && <p className="text-xs text-red-500">{error}</p>}
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700">Annuler</button>
              <button type="submit" disabled={loading} className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-60">
                {loading ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function InvestmentCard({ inv }: { inv: InvestorInvestment }) {
  const st = STATUS_LABELS[inv.status] ?? STATUS_LABELS.pending;
  const pct = inv.repaymentAmount > 0 ? Math.min(100, (inv.repaidAmount / inv.repaymentAmount) * 100) : 0;

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
      <div className="flex items-start justify-between gap-2 mb-1">
        <div>
          <div className="font-semibold text-gray-900">{inv.campaign.name}</div>
          {inv.campaign.businessName && (
            <div className="text-xs text-gray-400 flex items-center gap-1 mt-0.5"><Building2 size={11} /> {inv.campaign.businessName}</div>
          )}
        </div>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${st.color}`}>{st.label}</span>
      </div>
      {inv.campaign.description && <p className="text-xs text-gray-500 mt-2">{inv.campaign.description}</p>}

      <div className="grid grid-cols-2 gap-3 mt-4 text-sm">
        <div>
          <div className="text-xs text-gray-400">Montant investi</div>
          <div className="font-semibold text-gray-900">{fmt(inv.amount)}</div>
        </div>
        <div>
          <div className="text-xs text-gray-400">À recevoir</div>
          <div className="font-semibold text-gray-900">{fmt(inv.repaymentAmount)}</div>
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className="text-gray-500">Remboursé : <strong className="text-gray-800">{fmt(inv.repaidAmount)}</strong></span>
          <span className="text-gray-400">{Math.round(pct)}%</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2">
          <div className={`h-2 rounded-full ${pct >= 100 ? 'bg-emerald-500' : 'bg-indigo-500'}`} style={{ width: `${pct}%` }} />
        </div>
      </div>

      {inv.repaymentDueDate && (
        <div className="flex items-center gap-1.5 text-xs text-gray-400 mt-3">
          <Calendar size={12} /> Échéance : {inv.repaymentDueDate}
        </div>
      )}
    </div>
  );
}

export function InvestorPortal() {
  const [phase, setPhase] = useState<'loading' | 'login' | 'portal'>('loading');
  const [token, setToken] = useState<string | null>(null);
  const [investor, setInvestor] = useState<InvestorProfile | null>(null);
  const [investments, setInvestments] = useState<InvestorInvestment[]>([]);
  const [showChangePassword, setShowChangePassword] = useState(false);

  useEffect(() => {
    const saved = getInvestorToken();
    if (!saved) { setPhase('login'); return; }
    investorAuthApi.me(saved)
      .then(inv => {
        if (!inv) { clearInvestorToken(); setPhase('login'); return; }
        setToken(saved);
        setInvestor(inv);
        return loadInvestments(saved).then(() => setPhase('portal'));
      })
      .catch(() => { clearInvestorToken(); setPhase('login'); });
  }, []);

  const loadInvestments = (t: string) => investorPortalApi.getInvestments(t).then(invs => setInvestments(invs ?? []));

  const handleLoginSuccess = async (t: string, inv: InvestorProfile) => {
    setInvestorToken(t);
    setToken(t);
    setInvestor(inv);
    await loadInvestments(t);
    setPhase('portal');
  };

  const logout = () => {
    clearInvestorToken();
    setToken(null);
    setInvestor(null);
    setInvestments([]);
    setPhase('login');
  };

  if (phase === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <span className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (phase === 'login' || !investor || !token) {
    return <LoginForm onSuccess={handleLoginSuccess} />;
  }

  const totals = investments.reduce((acc, i) => ({
    invested: acc.invested + i.amount,
    toReceive: acc.toReceive + i.repaymentAmount,
    received: acc.received + i.repaidAmount,
  }), { invested: 0, toReceive: 0, received: 0 });

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur-md border-b border-gray-200 px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PiggyBank className="text-indigo-600" size={22} />
          <div>
            <div className="font-bold text-gray-900 text-sm leading-tight">{investor.name}</div>
            <div className="text-xs text-gray-400">{investor.email}</div>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowChangePassword(true)} className="p-2 rounded-xl bg-gray-100 text-gray-500 hover:bg-gray-200" title="Changer mon mot de passe">
            <KeyRound size={16} />
          </button>
          <button onClick={logout} className="p-2 rounded-xl bg-gray-100 text-gray-500 hover:bg-red-50 hover:text-red-500" title="Se déconnecter">
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-5 space-y-5">
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 text-center">
            <div className="text-xs text-gray-400 mb-1">Investi</div>
            <div className="font-bold text-gray-900">{fmt(totals.invested)}</div>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 text-center">
            <div className="text-xs text-gray-400 mb-1">À recevoir</div>
            <div className="font-bold text-gray-900">{fmt(totals.toReceive)}</div>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 text-center">
            <div className="text-xs text-gray-400 mb-1">Reçu</div>
            <div className="font-bold text-emerald-600">{fmt(totals.received)}</div>
          </div>
        </div>

        {investments.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <PiggyBank size={40} className="mx-auto mb-3 text-gray-200" />
            <p>Aucun investissement enregistré pour le moment.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {investments.map(inv => <InvestmentCard key={inv.id} inv={inv} />)}
          </div>
        )}
      </main>

      {showChangePassword && <ChangePasswordModal token={token} onClose={() => setShowChangePassword(false)} />}
    </div>
  );
}
