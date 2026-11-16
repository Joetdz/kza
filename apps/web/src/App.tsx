import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Suspense, useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw, Ban, LogOut } from 'lucide-react';
import { DashboardSkeleton } from './components/ui/Skeleton';
import { AppShell } from './components/layout/AppShell';
import { OnboardingTour } from './components/OnboardingTour';
import { BusinessModal } from './components/BusinessModal';
import { BusinessAdvisor } from './components/BusinessAdvisor';
import PwaInstallBanner from './components/PwaInstallBanner';
import { PushPermissionBanner } from './components/PushPermissionBanner';
import { GlobalWaNotifier } from './components/GlobalWaNotifier';
import { RequireModule } from './components/RequireModule';
import { useStore } from './store/useStore';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { lazyPage } from './lazyPages';

// Each page is its own chunk, loaded the first time it opens (see lazyPages).
const Dashboard = lazyPage('Dashboard');
const Stock = lazyPage('Stock');
const Sales = lazyPage('Sales');
const Expenses = lazyPage('Expenses');
const Treasury = lazyPage('Treasury');
const Analytics = lazyPage('Analytics');
const Goals = lazyPage('Goals');
const Fundraising = lazyPage('Fundraising');
const Export = lazyPage('Export');
const StorePage = lazyPage('StorePage');
const AdminDashboard = lazyPage('AdminDashboard');
const Logistics = lazyPage('Logistics');
const Clients = lazyPage('Clients');
const Agenda = lazyPage('Agenda');
const Credit = lazyPage('Credit');
const Documents = lazyPage('Documents');
const Team = lazyPage('Team');
const WhatsAppLayout = lazyPage('WhatsAppLayout');
const Inbox = lazyPage('Inbox');
const AIConfig = lazyPage('AIConfig');
const Automations = lazyPage('Automations');
const KnowledgeBase = lazyPage('KnowledgeBase');
const Audience = lazyPage('Audience');
const Landing = lazyPage('Landing');
const PublicStore = lazyPage('PublicStore');
const CustomerAccount = lazyPage('CustomerAccount');
const ResetPasswordPage = lazyPage('ResetPasswordPage');
const InvestorPortal = lazyPage('InvestorPortal');
const PartnerPortal = lazyPage('PartnerPortal');
const AcceptInvite = lazyPage('AcceptInvite');
const Pricing = lazyPage('Pricing');

const Spinner = () => (
  <div className="min-h-screen flex items-center justify-center">
    <span className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
  </div>
);

function AppInner() {
  const { session, loading: authLoading, signOut } = useAuth();
  const { businesses, currentBusinessId, loadBusinesses, hydrate, loading, error, clearError, setCurrentBusiness } = useStore();

  const userId = session?.user?.id;

  const [busLoaded, setBusLoaded] = useState(false);
  const [showTour, setShowTour] = useState(() => {
    const uid = session?.user?.id;
    return uid ? !localStorage.getItem(`tour_done_${uid}`) : false;
  });

  useEffect(() => {
    if (!userId) return;
    loadBusinesses().then(() => setBusLoaded(true));
  }, [userId, loadBusinesses]);

  useEffect(() => {
    if (busLoaded && currentBusinessId) hydrate();
  }, [busLoaded, currentBusinessId, hydrate]);

  // Chargement de l'état d'authentification
  if (authLoading) {
    return <Spinner />;
  }

  // Reset password via lien email
  const hash = window.location.hash;
  if (hash.includes('type=recovery')) {
    return <ResetPasswordPage />;
  }

  // Boutique publique — accessible sans authentification
  // Supports /#/boutique/:slug and /#/boutique/:slug/reel/:reelId
  if (hash.startsWith('#/partenaire/')) {
    const token = hash.split('/')[2];
    if (token) return <PartnerPortal token={token} />;
  }

  // Portail investisseur — auth email/mot de passe propre, séparée de Supabase.
  if (hash.startsWith('#/investisseur')) {
    return <InvestorPortal />;
  }

  // Team invite — must sit above the session and "no business yet" gates below,
  // since an invited user has neither when they open the link.
  if (hash.startsWith('#/invitation/')) {
    const token = hash.split('/')[2];
    if (token) return <AcceptInvite token={token} />;
  }

  if (hash.startsWith('#/boutique/')) {
    const parts = hash.split('/');
    const slug = parts[2];
    const reelId = parts[3] === 'reel' && parts[4] ? parts[4] : undefined;
    // Once Ikele is online, the stores live there: links already shared keep working.
    const ikeleUrl = (import.meta.env.VITE_IKELE_URL as string | undefined)?.replace(/\/$/, '');
    if (ikeleUrl && slug && slug !== 'undefined') {
      window.location.replace(`${ikeleUrl}/#/@${slug}${reelId ? `/reels/${reelId}` : ''}`);
      return null;
    }
    if (slug && slug !== 'undefined') return <PublicStore slug={slug} initialReelId={reelId} />;
  }

  // Compte client des boutiques en ligne — auth propre, séparée de Supabase.
  if (hash.startsWith('#/compte')) {
    return <CustomerAccount />;
  }

  if (hash.startsWith('#/pricing')) {
    return <Pricing />;
  }

  // Non authentifié → landing page
  if (!session) {
    return <Landing />;
  }

  // Businesses not loaded yet → spinner
  if (!busLoaded) {
    return <Spinner />;
  }

  // Premier login : aucun business → création obligatoire avant d'accéder à l'app
  if (businesses.length === 0) {
    return (
      <BusinessModal
        isFirstBusiness
        onClose={() => { /* ne peut pas fermer sans créer un business */ }}
      />
    );
  }

  // Business suspendu par l'administration : rien n'y est accessible, on peut passer à un autre.
  const currentBusiness = businesses.find(b => b.id === currentBusinessId);
  if (currentBusiness?.suspendedAt) {
    const others = businesses.filter(b => b.id !== currentBusiness.id && !b.suspendedAt);
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="card p-8 max-w-md w-full text-center animate-scale-in">
          <div className="w-14 h-14 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Ban size={26} />
          </div>
          <h2 className="font-bold text-fg text-lg mb-1">{currentBusiness.name} est suspendu</h2>
          <p className="text-sm text-fg-3">
            L'administration de Kzion a suspendu ce business
            {currentBusiness.suspendedAt ? ` le ${new Date(currentBusiness.suspendedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}` : ''}.
            Tes données sont conservées.
          </p>
          {currentBusiness.suspendedReason && (
            <p className="mt-3 text-sm text-fg-2 bg-surface-2 border border-line rounded-xl px-4 py-3 text-left">
              <span className="block text-[11px] font-semibold uppercase tracking-wider text-fg-4 mb-1">Motif</span>
              {currentBusiness.suspendedReason}
            </p>
          )}
          {others.length > 0 && (
            <div className="mt-5 space-y-2 text-left">
              <p className="text-xs font-semibold text-fg-3">Continuer avec un autre business</p>
              {others.map(b => (
                <button key={b.id} onClick={() => setCurrentBusiness(b.id)}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-line hover:border-indigo-500 hover:bg-indigo-600/[0.05] text-sm font-medium text-fg transition-colors">
                  {b.name} <span className="text-xs text-fg-3">{b.currency}</span>
                </button>
              ))}
            </div>
          )}
          <p className="mt-5 text-xs text-fg-4">Pour toute question, contacte le support Kzion.</p>
          <button onClick={signOut} className="mt-4 inline-flex items-center gap-1.5 text-sm text-fg-3 hover:text-red-600">
            <LogOut size={14} /> Se déconnecter
          </button>
        </div>
      </div>
    );
  }

  // Écran de chargement initial des données
  if (loading) {
    return (
      <div className="min-h-screen lg:pl-64">
        {/* Fake header */}
        <div className="sticky top-0 glass border-b px-6 py-3 flex items-center gap-3">
          <div className="flex-1" />
          <div className="skeleton h-8 w-24 rounded-xl" />
          <div className="skeleton h-8 w-52 rounded-xl" />
        </div>
        {/* Fake sidebar */}
        <div className="hidden lg:flex fixed top-0 left-0 h-full w-64 glass border-r flex-col px-5 py-5 gap-4">
          <div className="skeleton h-10 w-24 rounded-xl" />
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="skeleton h-9 rounded-xl" />
          ))}
        </div>
        <main className="p-6">
          <DashboardSkeleton />
        </main>
      </div>
    );
  }

  // Erreur de connexion API
  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6">
        <div className="card border-red-200 p-8 max-w-sm w-full text-center animate-scale-in">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="text-red-600" size={24} />
          </div>
          <h2 className="font-bold text-fg text-lg mb-2">Connexion impossible</h2>
          <p className="text-sm text-fg-3 mb-1">{error}</p>
          <p className="text-xs text-fg-4 mb-6">
            Vérifiez que le backend NestJS tourne sur{' '}
            <code className="bg-surface-2 px-1 rounded">localhost:3000</code>
          </p>
          <button
            onClick={() => { clearError(); hydrate(); }}
            className="flex items-center gap-2 mx-auto bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors"
          >
            <RefreshCw size={16} /> Réessayer
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {showTour && userId && (
        <OnboardingTour userId={userId} onClose={() => setShowTour(false)} />
      )}
    <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <GlobalWaNotifier />
      <BusinessAdvisor />
      <PwaInstallBanner />
      <PushPermissionBanner />
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/stock" element={<Stock />} />
          <Route path="/ventes" element={<Sales />} />
          <Route path="/depenses" element={<Expenses />} />
          <Route path="/tresorerie" element={<Treasury />} />
          <Route path="/analytique" element={<Analytics />} />
          <Route path="/objectifs" element={<RequireModule module="goals"><Goals /></RequireModule>} />
          <Route path="/financement" element={<RequireModule module="fundraising"><Fundraising /></RequireModule>} />
          <Route path="/export" element={<Export />} />
          <Route path="/boutique" element={<RequireModule module="online_store"><StorePage /></RequireModule>} />
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/logistique" element={<RequireModule module="logistics"><Logistics /></RequireModule>} />
          <Route path="/clients" element={<Clients />} />
          <Route path="/agenda" element={<RequireModule module="agenda"><Agenda /></RequireModule>} />
          <Route path="/creances" element={<RequireModule module="credit"><Credit /></RequireModule>} />
          <Route path="/factures" element={<RequireModule module="invoices"><Documents /></RequireModule>} />
          <Route path="/equipe" element={<Team />} />
          <Route path="/whatsapp" element={<RequireModule module="whatsapp"><WhatsAppLayout /></RequireModule>}>
            <Route index element={<Inbox />} />
            <Route path="ia" element={<AIConfig />} />
            <Route path="automatisations" element={<Automations />} />
            <Route path="base" element={<KnowledgeBase />} />
            <Route path="audience" element={<Audience />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
    </>
  );
}

export function App() {
  return (
    <AuthProvider>
      {/* The pages outside the shell (store, portals, landing) load on demand too. */}
      <Suspense fallback={<Spinner />}>
        <AppInner />
      </Suspense>
    </AuthProvider>
  );
}
