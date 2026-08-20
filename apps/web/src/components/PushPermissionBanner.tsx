import { useState, useEffect } from 'react';
import { Bell, X } from 'lucide-react';
import { usePushNotifications } from '../hooks/usePushNotifications';

const STORAGE_KEY = 'push_banner_dismissed';

export function PushPermissionBanner() {
  const { permission, subscribed, loading, subscribe } = usePushNotifications();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Show banner only if: supported, not yet decided, not dismissed
    if (
      permission === 'default' &&
      !subscribed &&
      !localStorage.getItem(STORAGE_KEY)
    ) {
      // Wait 8s after mount — let the user settle into the app first (Duolingo pattern)
      const t = setTimeout(() => setVisible(true), 8000);
      return () => clearTimeout(t);
    }
  }, [permission, subscribed]);

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, '1');
    setVisible(false);
  };

  const handleSubscribe = async () => {
    const ok = await subscribe();
    if (ok || permission === 'denied') {
      localStorage.setItem(STORAGE_KEY, '1');
      setVisible(false);
    }
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-sm px-4 animate-slide-up">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden">
        {/* Indigo accent bar */}
        <div className="h-1 bg-gradient-to-r from-indigo-500 to-violet-500" />

        <div className="p-4 flex gap-3 items-start">
          {/* Animated bell */}
          <div className="w-11 h-11 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0 animate-wiggle">
            <Bell size={22} className="text-indigo-600" />
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-gray-900">Ne rate rien 🔥</p>
            <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
              Reçois des alertes pour tes ventes, messages clients et stocks faibles — même quand l'app est fermée.
            </p>

            <div className="flex gap-2 mt-3">
              <button
                onClick={handleSubscribe}
                disabled={loading}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-semibold py-2 rounded-xl transition-colors"
              >
                {loading ? 'Activation...' : 'Activer les rappels'}
              </button>
              <button
                onClick={dismiss}
                className="px-3 bg-gray-100 hover:bg-gray-200 text-gray-500 text-xs py-2 rounded-xl transition-colors"
              >
                Plus tard
              </button>
            </div>
          </div>

          <button onClick={dismiss} className="text-gray-300 hover:text-gray-500 transition-colors -mt-0.5 shrink-0">
            <X size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
