import { create } from 'zustand';
import { createId } from '@/lib/id';

export interface ToastAction {
  label: string;
  run: () => void;
}

export interface Toast {
  id: string;
  message: string;
  detail?: string;
  action?: ToastAction;
  secondary?: ToastAction;
  tone?: 'default' | 'reminder';
  duration: number;
}

interface ToastState {
  toasts: Toast[];
  push: (t: Omit<Toast, 'id' | 'duration'> & { duration?: number }) => string;
  dismiss: (id: string) => void;
}

export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (t) => {
    const id = createId('toast_');
    const toast: Toast = { duration: t.action ? 6000 : 3200, ...t, id };
    // Keep the stack short: a calm UI never shows a pile of notifications.
    set((s) => ({ toasts: [...s.toasts.filter((x) => x.tone === 'reminder').slice(-2), toast].slice(-3) }));
    return id;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export const toast = (message: string, opts: Partial<Omit<Toast, 'id' | 'message'>> = {}) =>
  useToasts.getState().push({ message, ...opts });
