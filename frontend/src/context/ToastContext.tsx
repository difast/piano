import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

export type ToastKind = 'info' | 'success' | 'warn';
interface Toast { id: number; text: string; kind: ToastKind }
interface ToastApi { toast: (text: string, kind?: ToastKind, ms?: number) => void }

const Ctx = createContext<ToastApi>({ toast: () => undefined });

/** Аккуратные всплывающие уведомления. Не больше трёх одновременно, исчезают сами. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const seq = useRef(0);

  const toast = useCallback((text: string, kind: ToastKind = 'info', ms = 5500) => {
    const id = ++seq.current;
    setItems((l) => [...l.slice(-2), { id, text, kind }]);
    window.setTimeout(() => setItems((l) => l.filter((t) => t.id !== id)), ms);
  }, []);
  const api = useMemo(() => ({ toast }), [toast]);

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="toasts" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`} role="status">
            <span>{t.text}</span>
            <button aria-label="Закрыть" onClick={() => setItems((l) => l.filter((x) => x.id !== t.id))}>×</button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
