import { useState, useEffect } from 'react';
import { Download, X, Share, Plus } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}
function isInStandaloneMode() {
  return ('standalone' in navigator && (navigator as any).standalone) ||
    window.matchMedia('(display-mode: standalone)').matches;
}

export default function PwaInstallBanner() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (isInStandaloneMode()) return; // déjà installée
    if (sessionStorage.getItem('pwa_banner_dismissed')) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setPromptEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);

    // Sur iOS, montrer le guide après 3 secondes si sur mobile
    if (isIos() && /iphone|ipad|ipod/i.test(navigator.userAgent)) {
      const t = setTimeout(() => setShowIosGuide(true), 3000);
      return () => { clearTimeout(t); window.removeEventListener('beforeinstallprompt', handler); };
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!promptEvent) return;
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    if (outcome === 'accepted') setInstalled(true);
    setPromptEvent(null);
  };

  const handleDismiss = () => {
    setDismissed(true);
    setShowIosGuide(false);
    sessionStorage.setItem('pwa_banner_dismissed', '1');
  };

  if (installed || dismissed || isInStandaloneMode()) return null;

  // Android / Chrome — bouton natif
  if (promptEvent) return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 flex justify-center pointer-events-none">
      <div className="pointer-events-auto w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden animate-slide-up">
        <div className="h-1 bg-gradient-to-r from-indigo-500 to-purple-500" />
        <div className="p-4 flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center shrink-0">
            <span className="text-white font-black text-lg">K</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-gray-900 text-sm">Installer KZA sur votre téléphone</p>
            <p className="text-xs text-gray-500 mt-0.5">Accès rapide, fonctionne hors-ligne</p>
          </div>
          <button onClick={handleDismiss} className="p-1 text-gray-400 hover:text-gray-600 shrink-0">
            <X size={16} />
          </button>
        </div>
        <div className="px-4 pb-4 flex gap-2">
          <button
            onClick={handleInstall}
            className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-indigo-700 active:scale-95 transition-all"
          >
            <Download size={15} /> Installer l'app
          </button>
          <button
            onClick={handleDismiss}
            className="px-4 py-2.5 text-gray-500 rounded-xl text-sm hover:bg-gray-100 transition-colors"
          >
            Plus tard
          </button>
        </div>
      </div>
    </div>
  );

  // iOS — guide manuel
  if (showIosGuide) return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 flex justify-center pointer-events-none">
      <div className="pointer-events-auto w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden animate-slide-up">
        <div className="h-1 bg-gradient-to-r from-indigo-500 to-purple-500" />
        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center">
                <span className="text-white font-black text-base">K</span>
              </div>
              <div>
                <p className="font-bold text-gray-900 text-sm">Installer KZA sur iPhone</p>
                <p className="text-[11px] text-gray-500">Accès en 1 tap depuis l'écran d'accueil</p>
              </div>
            </div>
            <button onClick={handleDismiss} className="p-1 text-gray-400">
              <X size={16} />
            </button>
          </div>
          <div className="bg-gray-50 rounded-xl p-3 space-y-2.5">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                <Share size={14} className="text-blue-600" />
              </div>
              <p className="text-xs text-gray-700">1. Appuie sur <span className="font-semibold">Partager</span> en bas de Safari</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg bg-green-100 flex items-center justify-center shrink-0">
                <Plus size={14} className="text-green-600" />
              </div>
              <p className="text-xs text-gray-700">2. Sélectionne <span className="font-semibold">Sur l'écran d'accueil</span></p>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0">
                <span className="text-indigo-600 font-black text-xs">K</span>
              </div>
              <p className="text-xs text-gray-700">3. Confirme — l'app KZA apparaît !</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return null;
}
