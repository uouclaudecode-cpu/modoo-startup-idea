import { cn } from "@/lib/cn";
import { chartValue, formatKmCompact, type Bucket } from "@/lib/ride/stats";

/**
 * 기간별 거리 막대그래프 (CSS만 씀, 서버에서 그려요).
 * 지금 기간은 진한 파랑, 지난 기간은 연한 파랑. 막대마다 숫자를 적어서 색을 못 봐도 값을 알 수 있어요.
 * 화면 읽기 프로그램에는 그림 대신 모든 기간 값을 문장으로 읽어줘요. (role="img" + aria-label)
 */
export function RideBarChart({ buckets, caption }: { buckets: Bucket[]; caption: string }) {
  const max = Math.max(0, ...buckets.map((b) => b.distance_m));
  const summary = `${caption} (km): ${buckets.map((b) => `${b.longLabel} ${formatKmCompact(b.distance_m)}`).join(", ")}`;

  return (
    <figure className="m-0">
      <figcaption className="mb-2 flex items-baseline justify-between text-[12px] text-ink-muted">
        <span className="font-semibold text-ink-soft">{caption}</span>
        <span>단위 km</span>
      </figcaption>
      <div role="img" aria-label={summary} className="flex h-40 items-stretch gap-1 border-b border-line">
        {buckets.map((b) => {
          const ratio = max > 0 ? b.distance_m / max : 0;
          const label = `${b.longLabel} ${formatKmCompact(b.distance_m)}, ${b.count}회`;
          return (
            <div key={b.key} aria-label={label} title={label} className="flex min-w-0 flex-1 flex-col items-center justify-end">
              <span className={cn("mb-1 text-[11px] font-semibold leading-none tabular-nums", b.current ? "text-brand-700" : "text-ink-muted")}>
                {chartValue(b.distance_m)}
              </span>
              {/* 숫자 자리(약 1.25rem)를 뺀 높이를 최댓값 기준으로 나눠요. 0이어도 바닥선이 보이게 최소 2px */}
              <div
                className={cn("w-full max-w-[32px] rounded-t-md", b.current ? "bg-brand-600" : "bg-brand-200")}
                style={{ height: `max(2px, calc((100% - 1.25rem) * ${ratio.toFixed(4)}))` }}
              />
            </div>
          );
        })}
      </div>
      {/* 좁은 화면에서 '이번 주'가 칸보다 조금 넓어도 잘리지 않고 양옆으로 고르게 넘치게 (flex 가운데 정렬) */}
      <div aria-hidden className="mt-1.5 flex gap-1">
        {buckets.map((b) => (
          <span
            key={b.key}
            className={cn("flex min-w-0 flex-1 justify-center whitespace-nowrap text-[11px] tabular-nums", b.current ? "font-bold text-ink" : "text-ink-muted")}
          >
            {b.current ? b.longLabel : b.label}
          </span>
        ))}
      </div>
    </figure>
  );
}
