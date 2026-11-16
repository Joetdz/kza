import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle } from 'lucide-react';
import { Button } from './Button';

interface Props {
  open: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
}

export function ConfirmDialog({ open, title, message, onConfirm, onCancel, confirmLabel = 'Supprimer' }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4" role="alertdialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in" onClick={onCancel} />
      <div className="relative bg-surface border border-line shadow-float p-6 w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl animate-sheet-up sm:animate-scale-in pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="flex items-start gap-4">
          <div className="p-2.5 bg-red-100 rounded-xl text-red-600 shrink-0 animate-pop">
            <AlertTriangle size={22} />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-fg mb-1">{title}</h3>
            <p className="text-sm text-fg-3">{message}</p>
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <Button variant="secondary" onClick={onCancel} className="flex-1">Annuler</Button>
          <Button variant="danger" onClick={onConfirm} className="flex-1">{confirmLabel}</Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
