import Link from "next/link";
import { Card } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatDistance, formatDuration } from "@/lib/ride/geo";
import { compare, formatKmCompact, summarize, type Bucket } from "@/lib/ride/stats";
import { RideBarChart } from "./RideBarChart";

export type StatsView = "week" | "month";

const VIEWS: { value: StatsView; label: string }[] = [
  { value: "week", label: "주간" },
  { value: "month", label: "월간" },
];

/** 지난 기간과 이만큼(50m) 이내로 차이 나면 '비슷해요'로 보여줘요 */
const SAME_DISTANCE_M = 50;

/**
 * 라이딩 통계 카드: 이번 주(달) 요약 + 지난 기간과 비교 + 기간별 막대그래프.
 * 주간/월간 전환은 링크(?view=)라서 자바스크립트 없이도 동작해요.
 * buckets는 오래된 순이고 마지막이 지금 기간이에요.
 */
export function RideStatsCard({ view, buckets }: { view: StatsView; buckets: Bucket[] }) {
  const current = buckets[buckets.length - 1];
  const previous = buckets[buckets.length - 2];
  if (!current) return null;
  const s = summarize(current);
  const change = compare(current.distance_m, previous?.distance_m ?? 0, SAME_DISTANCE_M);
  const isWeek = view === "week";
  const prevName = isWeek ? "지난주" : "지난달";

  const items: [string, string][] = [
    ["거리", formatDistance(s.distance_m)],
    ["시간", formatDuration(s.elapsed_sec)],
    ["횟수", `${s.count}회`],
    ["평균 속도", `${s.avgKmh.toFixed(1)} km/h`],
  ];

  return (
    <Card className="space-y-4 p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold tracking-tight">{isWeek ? "이번 주" : "이번 달"} 라이딩</h2>
        <nav aria-label="통계 기간" className="flex rounded-xl bg-slate-100 p-1">
          {VIEWS.map((v) => (
            <Link
              key={v.value}
              href={v.value === "week" ? "/rides" : `/rides?view=${v.value}`}
              scroll={false}
              replace
              aria-current={view === v.value ? "true" : undefined}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-semibold",
                view === v.value ? "bg-white text-ink shadow-card" : "text-ink-muted hover:text-ink",
              )}
            >
              {v.label}
            </Link>
          ))}
        </nav>
      </div>

      <div>
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {items.map(([k, v]) => (
            <div key={k} className="rounded-xl bg-slate-50 px-3 py-2.5">
              <dt className="text-[12px] text-ink-muted">{k}</dt>
              <dd className="mt-0.5 text-[17px] font-extrabold tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
        <p className={cn("mt-2 text-[13px] font-semibold", change.direction === "up" ? "text-emerald-700" : "text-ink-muted")}>
          {change.direction === "up" && (
            <>
              {prevName}보다 <span className="tabular-nums">{formatKmCompact(change.delta)}</span> 더 달렸어요 <span aria-hidden>↑</span>
            </>
          )}
          {change.direction === "down" && (
            <>
              {prevName}보다 <span className="tabular-nums">{formatKmCompact(change.delta)}</span> 덜 달렸어요 <span aria-hidden>↓</span>
            </>
          )}
          {change.direction === "same" &&
            (current.distance_m > 0
              ? `${prevName}${isWeek ? "와" : "과"} 비슷하게 달렸어요`
              : `${isWeek ? "이번 주" : "이번 달"} 첫 라이딩을 기다리고 있어요`)}
        </p>
      </div>

      <RideBarChart buckets={buckets} caption={isWeek ? `최근 ${buckets.length}주 거리` : `최근 ${buckets.length}개월 거리`} />
    </Card>
  );
}

/** 연속 라이딩 안내. 오늘 아직 안 탔으면 '오늘 타면 이어져요'라고 살짝 등을 밀어줘요. */
export function StreakBanner({ streak, rodeToday }: { streak: number; rodeToday: boolean }) {
  if (streak <= 0) return null;
  let text: string;
  if (streak === 1) text = rodeToday ? "오늘 라이딩 완료! 내일도 타면 2일 연속이에요" : "어제 라이딩했어요. 오늘도 타면 2일 연속이에요";
  else text = rodeToday ? `${streak}일 연속 라이딩 중` : `${streak}일 연속 라이딩 중 · 오늘도 타면 ${streak + 1}일째예요`;
  return (
    <p className="flex items-center gap-2 rounded-2xl bg-orange-50 px-4 py-3 text-[14px] font-semibold text-orange-900 ring-1 ring-orange-200">
      <span aria-hidden className="text-lg">
        🔥
      </span>
      <span className="tabular-nums">{text}</span>
    </p>
  );
}
