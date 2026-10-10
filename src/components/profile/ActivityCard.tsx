import { Card } from "@/components/ui";
import { activityLevel, type Activity } from "@/lib/activity";
import { formatDistance } from "@/lib/ride/geo";

/**
 * MY '나의 B-LOCK 활동': 칭호 + 숫자 5개.
 * 남을 도운 일이 먼저 보이고, 내 이동수단은 '되찾은' 쪽으로만 보여 줘요 (잃어버린 횟수는 보여 주지 않아요).
 */
export function ActivityCard({ a }: { a: Activity }) {
  const lv = activityLevel(a);
  const stats: { emoji: string; label: string; value: string; note: string }[] = [
    { emoji: "🙌", label: "주인에게 알려 준 횟수", value: `${a.helped}번`, note: "QR을 찍어 알려 주거나 도난 경보에 본 곳을 알려 준 횟수" },
    { emoji: "💛", label: "받은 감사 인사", value: `${a.thanked}번`, note: "주인이 내 제보에 '도움이 됐어요'를 눌렀어요" },
    { emoji: "🎉", label: "되찾아 준 이동수단", value: `${a.returned}대`, note: "내가 알려 준 뒤 주인이 찾았어요" },
    { emoji: "🚲", label: "되찾은 내 이동수단", value: `${a.recovered}대`, note: "잃어버렸다가 다시 찾았어요" },
    { emoji: "📏", label: "라이딩 거리", value: a.ride_m > 0 ? formatDistance(a.ride_m) : "0 km", note: a.ride_count > 0 ? `모두 ${a.ride_count}번 탔어요` : "아직 탄 기록이 없어요" },
  ];
  return (
    <Card id="activity" className="scroll-mt-20 space-y-4 p-4">
      <div className="flex items-center gap-3">
        <span aria-hidden className="grid h-14 w-14 flex-none place-items-center rounded-2xl bg-gradient-to-br from-amber-100 to-amber-50 text-3xl ring-1 ring-amber-200">
          {lv.now.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-bold text-ink-muted">나의 B-LOCK 칭호</p>
          <p className="text-xl font-extrabold tracking-tight">{lv.now.name}</p>
          {lv.next ? (
            <p className="text-[13px] text-ink-muted">
              <b className="text-ink">{lv.toNext}점</b>만 더 모으면 {lv.next.emoji} {lv.next.name}
            </p>
          ) : (
            <p className="text-[13px] text-ink-muted">최고 칭호예요!</p>
          )}
        </div>
      </div>
      {lv.next && (
        <div className="h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(lv.progress * 100)} aria-label="다음 칭호까지">
          <div className="h-full rounded-full bg-amber-400" style={{ width: `${Math.max(lv.progress * 100, 3)}%` }} />
        </div>
      )}
      <dl className="grid grid-cols-2 gap-2">
        {stats.map((s, i) => (
          <div key={s.label} className={i === 0 ? "col-span-2 rounded-xl bg-slate-50 p-3" : "rounded-xl bg-slate-50 p-3"}>
            <dt className="text-[12px] font-semibold text-ink-muted">
              <span aria-hidden>{s.emoji}</span> {s.label}
            </dt>
            <dd className="mt-0.5 text-lg font-extrabold tabular-nums">{s.value}</dd>
            <dd className="text-[11px] leading-snug text-ink-faint">{s.note}</dd>
          </div>
        ))}
      </dl>
      <div className="space-y-0.5 text-[12px] leading-relaxed text-ink-muted">
        <p>{lv.now.hint}</p>
        <p className="text-ink-faint">점수 모으는 법: 알려 주기 1점 · 감사 인사 받기 3점 · 되찾아 주기 10점</p>
      </div>
    </Card>
  );
}
