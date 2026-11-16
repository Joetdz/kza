import { CheckCircle2, XCircle, Info, X } from 'lucide-react';
import { useToast } from '../../hooks/useToast';

const CONFIG = {
  success: { icon: CheckCircle2, icon_cls: 'text-emerald-600', bar: 'bg-emerald-500' },
  error:   { icon: XCircle,      icon_cls: 'text-red-600',     bar: 'bg-red-500' },
  info:    { icon: Info,         icon_cls: 'text-indigo-600',  bar: 'bg-indigo-500' },
};

/** Notifications: glass cards, top-right on a desk, full width at the top of a phone. */
export function Toaster() {
  const { toasts, dismiss } = useToast();

  return (
    <div className="fixed top-3 left-3 right-3 sm:left-auto sm:top-4 sm:right-4 z-[100] flex flex-col gap-2 pointer-events-none" aria-live="polite">
      {toasts.map(toast => {
        const { icon: Icon, icon_cls, bar } = CONFIG[toast.type];
        return (
          <div
            key={toast.id}
            role="status"
            className={`pointer-events-auto relative overflow-hidden flex items-center gap-3 pl-4 pr-3 py-3 rounded-2xl glass-strong border shadow-float text-fg sm:min-w-64 sm:max-w-sm
              ${toast.dying ? 'animate-slide-out-right' : 'animate-slide-in-right'}`}
          >
            <span className={`absolute left-0 top-0 bottom-0 w-1 ${bar}`} />
            <Icon size={18} className={`shrink-0 ${icon_cls}`} />
            <span className="text-sm font-medium flex-1">{toast.message}</span>
            <button
              onClick={() => dismiss(toast.id)}
              aria-label="Fermer"
              className="shrink-0 p-1 rounded-lg text-fg-4 hover:text-fg hover:bg-surface-2 transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
