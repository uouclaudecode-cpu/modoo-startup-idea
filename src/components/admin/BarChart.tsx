import { cn } from "@/lib/cn";

/**
 * 간단한 세로 막대 차트 (차트 라이브러리 없이 CSS만으로).
 * 서버 컴포넌트에서 그대로 그려져서 브라우저에 자바스크립트를 보내지 않아요.
 * 막대마다 숫자를 함께 적어 색이나 길이만으로 읽지 않아도 되고,
 * 화면 읽기 프로그램은 막대 하나를 "10월 6일 주: 3명"처럼 한 문장으로 읽어요.
 */

export type BarDatum = {
  /** 축에 보이는 짧은 이름 (예: "10/6주") */
  label: string;
  value: number;
  /** 화면 읽기 프로그램용 긴 이름 (예: "10월 6일 주"). 없으면 label 을 읽어요. */
  longLabel?: string;
};

type Tone = "brand" | "emerald" | "amber" | "rose";

// Tailwind 가 클래스를 찾을 수 있도록 전체 이름을 그대로 적어 둬요.
const TONES: Record<Tone, { bar: string; current: string; text: string }> = {
  brand: { bar: "bg-brand-300", current: "bg-brand-600", text: "text-brand-700" },
  emerald: { bar: "bg-emerald-300", current: "bg-emerald-600", text: "text-emerald-700" },
  amber: { bar: "bg-amber-300", current: "bg-amber-500", text: "text-amber-700" },
  rose: { bar: "bg-rose-300", current: "bg-rose-500", text: "text-rose-700" },
};

const defaultFormat = (n: number) => n.toLocaleString("ko-KR");

type Props = {
  title: string;
  data: BarDatum[];
  /** 숫자 뒤에 붙는 단위 (명·건·회) */
  unit?: string;
  tone?: Tone;
  /** 제목 아래 짧은 설명 */
  description?: string;
  /** 마지막 막대를 진하게 (진행 중인 이번 주 표시) */
  highlightLast?: boolean;
  /** 마지막 막대 뒤에 화면 읽기용으로 붙는 말 (기본: "이번 주") */
  lastLabel?: string;
  /** 제목 옆에 전체 합계를 보여줄지 */
  showTotal?: boolean;
  formatValue?: (n: number) => string;
  className?: string;
};

export function BarChart({
  title,
  data,
  unit = "",
  tone = "brand",
  description,
  highlightLast = false,
  lastLabel = "이번 주",
  showTotal = true,
  formatValue = defaultFormat,
  className,
}: Props) {
  const t = TONES[tone];
  const max = data.reduce((m, d) => Math.max(m, d.value), 0);
  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    // figure 의 이름은 figcaption(제목)으로 정해져요.
    <figure className={cn("rounded-2xl bg-white p-4 shadow-card ring-1 ring-line/70 sm:p-5", className)}>
      <figcaption>
        <span className="flex items-baseline justify-between gap-3">
          <span className="font-bold text-ink">{title}</span>
          {showTotal && data.length > 0 && (
            <span className="whitespace-nowrap text-[13px] text-ink-muted">
              합계 <b className={cn("font-bold tabular-nums", t.text)}>{formatValue(total)}</b>
              {unit}
            </span>
          )}
        </span>
        {description && <span className="mt-0.5 block text-[12px] leading-relaxed text-ink-muted">{description}</span>}
      </figcaption>

      {data.length === 0 ? (
        <p className="mt-4 rounded-xl bg-slate-50 py-8 text-center text-sm text-ink-muted">아직 보여줄 기록이 없어요.</p>
      ) : (
        <ol className="mt-3 flex gap-0.5 sm:gap-1.5">
          {data.map((d, i) => {
            const current = highlightLast && i === data.length - 1;
            // 아주 작은 값도 눈에 보이게 최소 4%, 0은 바닥에 얇은 회색 선만
            const pct = d.value > 0 && max > 0 ? Math.max(4, (d.value / max) * 100) : 0;
            const name = `${d.longLabel ?? d.label}${current ? ` (${lastLabel})` : ""}`;
            return (
              <li key={`${d.label}-${i}`} className="min-w-0 flex-1">
                <div role="img" aria-label={`${name}: ${formatValue(d.value)}${unit}`} className="flex flex-col items-center">
                  {/* 위쪽 여백(pt-5)은 가장 높은 막대 위 숫자가 들어갈 자리 */}
                  <div className="flex h-28 w-full items-end justify-center border-b border-line pt-5">
                    <div
                      className={cn(
                        "relative w-[70%] max-w-[28px] rounded-t-md",
                        d.value > 0 ? (current ? t.current : t.bar) : "bg-slate-200",
                      )}
                      style={{ height: pct > 0 ? `${pct}%` : "2px" }}
                    >
                      <span
                        className={cn(
                          "absolute bottom-full left-1/2 mb-1 -translate-x-1/2 whitespace-nowrap text-[11px] font-semibold tabular-nums",
                          current ? t.text : d.value > 0 ? "text-ink-soft" : "text-ink-faint",
                        )}
                      >
                        {formatValue(d.value)}
                      </span>
                    </div>
                  </div>
                  <span
                    className={cn(
                      "mt-1.5 whitespace-nowrap text-[10px] tabular-nums tracking-tight sm:text-[11px]",
                      current ? "font-bold text-ink" : "text-ink-muted",
                    )}
                  >
                    {d.label}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {/* 모두 0이면 빈 차트처럼 보이지 않게 이유를 적어 줘요 */}
      {data.length > 0 && max === 0 && <p className="mt-2 text-center text-[12px] text-ink-muted">이 기간에는 아직 기록이 없어요.</p>}
    </figure>
  );
}
