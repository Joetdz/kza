import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * A dialog over the page. On the phone it rises from the bottom as a sheet and takes the
 * height it needs (the keyboard included); on larger screens it opens centred.
 */
export function Modal({ open, onClose, title, children, size = 'md' }: Props) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', onKey); };
  }, [open, onClose]);

  if (!open) return null;

  const widths = { sm: 'sm:max-w-sm', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl' };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in" onClick={onClose} />

      {/* Panel: a sheet on the phone, a window from sm up */}
      <div
        className={`relative w-full ${widths[size]} bg-surface border border-line shadow-float flex flex-col
          rounded-t-3xl sm:rounded-2xl animate-sheet-up sm:animate-scale-in max-h-[92dvh] sm:max-h-[85vh]`}
      >
        {/* Grab handle (phone) */}
        <div className="sm:hidden flex justify-center pt-2.5 -mb-1">
          <span className="w-10 h-1 rounded-full bg-line-strong" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-line shrink-0">
          <h2 className="font-semibold text-fg text-lg">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="p-1.5 rounded-lg hover:bg-surface-2 text-fg-3 hover:text-fg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable body, with room above the phone's home indicator */}
        <div className="overflow-y-auto flex-1 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">{children}</div>
      </div>
    </div>,
    document.body
  );
}
