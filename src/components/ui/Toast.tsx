"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { CircleCheck, CircleAlert, Info } from "lucide-react";
import { cn } from "@/lib/cn";

type ToastKind = "success" | "error" | "info";
type ToastItem = { id: number; kind: ToastKind; message: string };

type ToastApi = {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

const STYLE: Record<ToastKind, { icon: typeof Info; className: string }> = {
  success: { icon: CircleCheck, className: "text-emerald-300" },
  error: { icon: CircleAlert, className: "text-rose-300" },
  info: { icon: Info, className: "text-sky-300" },
};

/** 화면 아래에 잠깐 뜨는 알림. 성공/실패/안내 3가지 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev.slice(-2), { id, kind, message }]);
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), kind === "error" ? 6000 : 3500);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (m) => push("success", m),
      error: (m) => push("error", m),
      info: (m) => push("info", m),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        {items.map((t) => {
          const { icon: Icon, className } = STYLE[t.kind];
          return (
            <div
              key={t.id}
              role={t.kind === "error" ? "alert" : "status"}
              className="pointer-events-auto flex w-full max-w-md animate-toast-in items-start gap-3 rounded-2xl bg-slate-900 px-4 py-3.5 text-[15px] text-white shadow-lift"
            >
              <Icon aria-hidden className={cn("mt-0.5 h-5 w-5 flex-none", className)} />
              <p className="leading-snug">{t.message}</p>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast는 ToastProvider 안에서만 쓸 수 있어요.");
  return ctx;
}
