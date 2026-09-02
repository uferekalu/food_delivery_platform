"use client";

import { cn } from "@/lib/cn";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";
import { Portal } from "./portal";

export type ToastVariant = "neutral" | "success" | "warning" | "danger";

export interface ToastOptions {
  title: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
}

interface ToastRecord extends ToastOptions {
  id: string;
}

interface ToastContextValue {
  toast: (options: ToastOptions) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}

const variantClasses: Record<ToastVariant, string> = {
  neutral: "border-border bg-surface-raised text-text",
  success: "border-success/20 bg-success-bg text-success",
  warning: "border-warning/20 bg-warning-bg text-warning",
  danger: "border-danger/20 bg-danger-bg text-danger",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const t = useTranslations("Common");
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const toast = useCallback(
    (options: ToastOptions) => {
      const id = crypto.randomUUID();
      setToasts((current) => [...current, { id, variant: "neutral", duration: 5000, ...options }]);
      const timer = setTimeout(() => dismiss(id), options.duration ?? 5000);
      timers.current.set(id, timer);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Portal>
        <ol
          aria-live="polite"
          aria-label={t("notifications")}
          style={{ zIndex: "var(--z-toast)" }}
          className="fixed bottom-4 right-4 flex w-full max-w-sm flex-col gap-2"
        >
          {toasts.map((toastItem) => (
            <li
              key={toastItem.id}
              className={cn(
                "flex items-start justify-between gap-3 rounded-lg border p-4 text-sm shadow-lg",
                variantClasses[toastItem.variant ?? "neutral"],
              )}
            >
              <div className="flex flex-col gap-0.5">
                <p className="font-medium">{toastItem.title}</p>
                {toastItem.description && <p className="text-text-muted">{toastItem.description}</p>}
              </div>
              <button
                type="button"
                aria-label={t("dismissNotification")}
                onClick={() => dismiss(toastItem.id)}
                className="shrink-0 text-text-muted hover:text-text"
              >
                <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="size-4">
                  <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </li>
          ))}
        </ol>
      </Portal>
    </ToastContext.Provider>
  );
}
