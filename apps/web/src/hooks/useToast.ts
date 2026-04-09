import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'info';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  dying?: boolean;
}

interface ToastStore {
  toasts: Toast[];
  add: (message: string, type?: ToastType) => void;
  dismiss: (id: string) => void;
}

export const useToast = create<ToastStore>()(set => ({
  toasts: [],
  add: (message, type = 'success') => {
    const id = crypto.randomUUID();
    set(s => ({ toasts: [...s.toasts, { id, message, type }] }));
    // Start exit animation then remove
    setTimeout(() => set(s => ({
      toasts: s.toasts.map(t => t.id === id ? { ...t, dying: true } : t),
    })), 3000);
    setTimeout(() => set(s => ({
      toasts: s.toasts.filter(t => t.id !== id),
    })), 3300);
  },
  dismiss: (id) => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),
}));

// Callable outside React (from store actions)
export const toast = {
  success: (msg: string) => useToast.getState().add(msg, 'success'),
  error:   (msg: string) => useToast.getState().add(msg, 'error'),
  info:    (msg: string) => useToast.getState().add(msg, 'info'),
};
