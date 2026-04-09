import { CheckCircle, XCircle, Info, X } from 'lucide-react';
import { useToast } from '../../hooks/useToast';

const CONFIG = {
  success: { icon: CheckCircle, bg: 'bg-emerald-600', bar: 'bg-emerald-400' },
  error:   { icon: XCircle,     bg: 'bg-red-600',     bar: 'bg-red-400' },
  info:    { icon: Info,        bg: 'bg-indigo-600',  bar: 'bg-indigo-400' },
};

export function Toaster() {
  const { toasts, dismiss } = useToast();

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map(toast => {
        const { icon: Icon, bg } = CONFIG[toast.type];
        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl text-white min-w-64 max-w-sm
              ${bg} ${toast.dying ? 'animate-slide-out-right' : 'animate-slide-in-right'}`}
          >
            <Icon size={18} className="shrink-0" />
            <span className="text-sm font-medium flex-1">{toast.message}</span>
            <button
              onClick={() => dismiss(toast.id)}
              className="shrink-0 opacity-70 hover:opacity-100 transition-opacity"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
