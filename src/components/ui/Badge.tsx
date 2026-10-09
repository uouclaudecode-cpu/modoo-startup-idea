import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Tone = "neutral" | "brand" | "success" | "warning" | "danger";

const TONES: Record<Tone, string> = {
  neutral: "bg-slate-100 text-ink-soft ring-slate-500/15",
  brand: "bg-brand-50 text-brand-700 ring-brand-600/20",
  success: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  warning: "bg-orange-50 text-orange-700 ring-orange-600/25",
  danger: "bg-rose-50 text-rose-700 ring-rose-600/25",
};

/** 짧은 상태 표시. 색만으로 구분하지 않도록 아이콘이나 글자를 함께 넣어 주세요. */
export function Badge({ tone = "neutral", icon, children }: { tone?: Tone; icon?: ReactNode; children: ReactNode }) {
  return (
    <span className={cn("inline-flex flex-none items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[13px] font-semibold ring-1 ring-inset", TONES[tone])}>
      {icon}
      {children}
    </span>
  );
}
