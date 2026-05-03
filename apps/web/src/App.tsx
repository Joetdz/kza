import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { DashboardSkeleton } from './components/ui/Skeleton';
import { AppShell } from './components/layout/AppShell';
import { Dashboard } from './pages/Dashboard';
import { Stock } from './pages/Stock';
import { Sales } from './pages/Sales';
import { Expenses } from './pages/Expenses';
import { Analytics } from './pages/Analytics';
import { Goals } from './pages/Goals';
import { Export } from './pages/Export';
import { Login } from './pages/Login';
import { WhatsAppLayout } from './pages/whatsapp/WhatsAppLayout';
import { AdminDashboard } from './pages/AdminDashboard';
import { Inbox } from './pages/whatsapp/Inbox';
import { AIConfig } from './pages/whatsapp/AIConfig';
import { Automations } from './pages/whatsapp/Automations';
import { KnowledgeBase } from './pages/whatsapp/KnowledgeBase';
import { Audience } from './pages/whatsapp/Audience';
import { BusinessAdvisor } from './components/BusinessAdvisor';
import { useStore } from './store/useStore';
import { AuthProvider, useAuth } from './contexts/AuthContext';

function AppInner() {
  const { session, loading: authLoading } = useAuth();
  const { hydrate, loading, error, clearError } = useStore();

  const userId = session?.user?.id;
  useEffect(() => {
    if (userId) hydrate();
  }, [userId, hydrate]);

  // Chargement de l'état d'authentification
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <span className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  // Non authentifié → page de connexion
  if (!session) {
    return <Login />;
  }

  // Écran de chargement initial des données
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 lg:pl-64">
        {/* Fake header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3">
          <div className="flex-1" />
          <div className="skeleton h-8 w-24 rounded-xl" />
          <div className="skeleton h-8 w-52 rounded-xl" />
        </div>
        {/* Fake sidebar */}
        <div className="hidden lg:flex fixed top-0 left-0 h-full w-64 bg-gray-900 flex-col px-5 py-5 gap-4">
          <div className="skeleton h-10 w-24 rounded-xl opacity-20" />
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="skeleton h-9 rounded-xl opacity-10" />
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
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4 p-6">
        <div className="bg-white rounded-2xl shadow-sm border border-red-100 p-8 max-w-sm w-full text-center">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="text-red-600" size={24} />
          </div>
          <h2 className="font-bold text-gray-900 text-lg mb-2">Connexion impossible</h2>
          <p className="text-sm text-gray-500 mb-1">{error}</p>
          <p className="text-xs text-gray-400 mb-6">
            Vérifiez que le backend NestJS tourne sur{' '}
            <code className="bg-gray-100 px-1 rounded">localhost:3000</code>
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
    <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <BusinessAdvisor />
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/stock" element={<Stock />} />
          <Route path="/ventes" element={<Sales />} />
          <Route path="/depenses" element={<Expenses />} />
          <Route path="/analytique" element={<Analytics />} />
          <Route path="/objectifs" element={<Goals />} />
          <Route path="/export" element={<Export />} />
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/whatsapp" element={<WhatsAppLayout />}>
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
  );
}

export function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}
