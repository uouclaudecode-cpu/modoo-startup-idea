import { cn } from "@/lib/cn";

type RateTone = "good" | "fair" | "low" | "none";

/** 비율(0~1)에 따른 상태: 60% 이상 좋음 · 30% 이상 보통 · 그 아래 낮음 · 분모가 없으면 없음 */
export function rateTone(ratio: number | null): RateTone {
  if (ratio === null || !Number.isFinite(ratio)) return "none";
  if (ratio >= 0.6) return "good";
  if (ratio >= 0.3) return "fair";
  return "low";
}

export const RATE_TEXT: Record<RateTone, string> = {
  good: "text-emerald-700",
  fair: "text-amber-700",
  low: "text-rose-700",
  none: "text-ink-muted",
};

const RATE_BAR: Record<RateTone, string> = {
  good: "bg-emerald-500",
  fair: "bg-amber-500",
  low: "bg-rose-500",
  none: "bg-slate-300",
};

/**
 * 등록률·회수율 같은 비율 막대. 색만으로 구분하지 않도록 옆에 퍼센트 글자를 꼭 함께 보여 주세요.
 * label 은 화면 읽기 프로그램이 읽는 이름이에요 (예: "울산대 1차 등록률").
 */
export function RateBar({ ratio, label, className }: { ratio: number | null; label: string; className?: string }) {
  const tone = rateTone(ratio);
  const pct = ratio === null || !Number.isFinite(ratio) ? 0 : Math.round(Math.min(1, Math.max(0, ratio)) * 100);
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-valuetext={tone === "none" ? "아직 없음" : `${pct}%`}
      aria-label={label}
      className={cn("h-2 overflow-hidden rounded-full bg-slate-100", className)}
    >
      {/* 0이 아니면 아주 작은 값도 보이게 최소 3% */}
      <div className={cn("h-full rounded-full", RATE_BAR[tone])} style={{ width: `${pct > 0 ? Math.max(pct, 3) : 0}%` }} />
    </div>
  );
}
