import type { ReactNode } from "react";
import { Card } from "@/components/ui";
import { cn } from "@/lib/cn";

type Tone = "brand" | "emerald" | "amber" | "rose" | "slate";

const ICON_TONES: Record<Tone, string> = {
  brand: "bg-brand-50 text-brand-600",
  emerald: "bg-emerald-50 text-emerald-600",
  amber: "bg-amber-50 text-amber-600",
  rose: "bg-rose-50 text-rose-600",
  slate: "bg-slate-100 text-ink-soft",
};

type Props = {
  icon: ReactNode;
  label: string;
  /** 크게 보이는 숫자 (이미 형식을 맞춘 글자) */
  value: string;
  unit?: string;
  /** 숫자 아래 보조 설명 */
  sub?: ReactNode;
  tone?: Tone;
  /** 맨 아래에 붙는 내용 (비율 막대 등) */
  children?: ReactNode;
};

/** 관리자 통계의 핵심 숫자 카드 (한 화면에 2열로 놓기 좋은 크기) */
export function StatCard({ icon, label, value, unit, sub, tone = "brand", children }: Props) {
  return (
    <Card className="flex h-full flex-col gap-2 p-4">
      <p className="flex items-center gap-2 text-[13px] font-semibold text-ink-soft">
        <span aria-hidden className={cn("grid h-8 w-8 flex-none place-items-center rounded-lg", ICON_TONES[tone])}>
          {icon}
        </span>
        <span className="min-w-0 leading-tight">{label}</span>
      </p>
      {/* 좁은 2열 카드: 아주 큰 숫자는 넘치지 않게 줄을 바꾸고, 설명은 낱말 단위로만 줄바꿈 */}
      <p className="break-words text-2xl font-extrabold tracking-tight text-ink tabular-nums">
        {value}
        {unit && <span className="ml-0.5 text-sm font-semibold text-ink-muted">{unit}</span>}
      </p>
      {sub && <div className="break-keep text-[12px] leading-snug text-ink-muted">{sub}</div>}
      {children && <div className="mt-auto pt-1">{children}</div>}
    </Card>
  );
}
