import { useState, useEffect } from 'react';
import { Building2, Check, Loader2, AlertCircle, LogIn } from 'lucide-react';
import { teamApi, type InvitePreview } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { AuthModal, type AuthMode } from './Landing';

const STATUS_MESSAGE: Record<string, string> = {
  revoked: 'Cette invitation a été annulée par le propriétaire.',
  accepted: 'Cette invitation a déjà été utilisée.',
  expired: 'Cette invitation a expiré. Demandez-en une nouvelle.',
};

const ROLE_LABEL: Record<string, string> = {
  manager: 'Gérant',
  operator: 'Opérateur',
};

/**
 * Rendered from the hash router in App, *before* the session and
 * "you have no business yet" gates — an invitee legitimately has neither.
 */
export function AcceptInvite({ token }: { token: string }) {
  const { session, loading: authLoading } = useAuth();

  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState('');
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);

  useEffect(() => {
    if (!token) return;
    teamApi
      .peekInvite(token)
      .then(setPreview)
      .catch(() => setError('Invitation introuvable. Vérifiez le lien reçu.'))
      .finally(() => setLoading(false));
  }, [token]);

  // Signing in/up updates `session` via AuthContext's onAuthStateChange listener —
  // once that lands, the modal has done its job and dismisses itself.
  useEffect(() => {
    if (session) setAuthMode(null);
  }, [session]);

  async function handleAccept() {
    setAccepting(true);
    setError('');
    try {
      const result = await teamApi.acceptInvite(token);
      // Select the business we just joined, then reload so the whole app
      // bootstraps against it (businesses, sockets, WhatsApp session).
      localStorage.setItem('kza_business_id', result.businessId);
      window.location.hash = '#/';
      window.location.reload();
    } catch (e: any) {
      setError(e?.message ?? 'Impossible de rejoindre ce business.');
      setAccepting(false);
    }
  }

  const card = 'bg-white rounded-2xl shadow-sm border border-gray-200 p-7 w-full max-w-md';
  const shell = 'min-h-screen bg-gray-50 flex items-center justify-center p-4';

  if (loading || authLoading) {
    return (
      <div className={shell}>
        <Loader2 size={26} className="animate-spin text-indigo-600" />
      </div>
    );
  }

  if (error && !preview) {
    return (
      <div className={shell}>
        <div className={card}>
          <AlertCircle size={26} className="text-red-500 mb-3" />
          <h1 className="text-lg font-bold text-gray-900">Lien invalide</h1>
          <p className="text-sm text-gray-600 mt-2">{error}</p>
        </div>
      </div>
    );
  }

  if (preview && preview.status !== 'pending') {
    return (
      <div className={shell}>
        <div className={card}>
          <AlertCircle size={26} className="text-amber-500 mb-3" />
          <h1 className="text-lg font-bold text-gray-900">Invitation indisponible</h1>
          <p className="text-sm text-gray-600 mt-2">{STATUS_MESSAGE[preview.status]}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={shell}>
      <div className={card}>
        <div className="flex items-center gap-3 mb-5">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center overflow-hidden shrink-0">
            {preview?.businessLogo
              ? <img src={preview.businessLogo} alt="" className="w-full h-full object-cover" />
              : <Building2 size={22} className="text-indigo-600" />}
          </div>
          <div className="min-w-0">
            <p className="text-xs text-gray-500">Invitation à rejoindre</p>
            <h1 className="text-lg font-bold text-gray-900 truncate">{preview?.businessName}</h1>
            {preview?.businessCity && (
              <p className="text-xs text-gray-500">{preview.businessCity}</p>
            )}
          </div>
        </div>

        <div className="bg-gray-50 rounded-xl p-4 mb-5">
          <p className="text-xs font-semibold text-gray-700">
            Votre rôle : {ROLE_LABEL[preview?.role ?? 'operator']}
          </p>
          <p className="text-xs text-gray-600 mt-1">
            {preview?.role === 'manager'
              ? 'Vous aurez accès à tout, sauf à la gestion de l’équipe.'
              : 'Vous aurez accès à WhatsApp et à la logistique. Les finances resteront masquées.'}
          </p>
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mb-4">
            {error}
          </p>
        )}

        {session ? (
          <button
            onClick={handleAccept}
            disabled={accepting}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white px-4 py-3 rounded-xl text-sm font-semibold transition-colors"
          >
            {accepting ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            Rejoindre ce business
          </button>
        ) : (
          <div className="space-y-2">
            <button
              onClick={() => setAuthMode('login')}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-3 rounded-xl text-sm font-semibold transition-colors"
            >
              <LogIn size={16} /> Se connecter
            </button>
            <button
              onClick={() => setAuthMode('register')}
              className="w-full text-center text-xs text-gray-500 hover:text-gray-700 py-1"
            >
              Pas encore de compte ? <span className="font-semibold text-indigo-600">Créer un compte</span>
            </button>
          </div>
        )}
      </div>

      {authMode && (
        <AuthModal initialMode={authMode} onClose={() => setAuthMode(null)} />
      )}
    </div>
  );
}
