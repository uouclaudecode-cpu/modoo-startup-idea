import Link from "next/link";
import { ChevronDown, ChevronRight, Lock } from "lucide-react";
import { Card } from "@/components/ui";
import { cn } from "@/lib/cn";
import { nextBadges, type Badge } from "@/lib/ride/badges";

/**
 * 라이딩 배지 화면 조각들 (서버에서 그려요, 자바스크립트 없이 동작).
 * 받은 배지는 색으로, 못 받은 배지는 회색 + 진행 막대로 보여줘요.
 * 색만으로 구분하지 않도록 자물쇠 아이콘과 '받음/진행 숫자' 글자를 함께 둡니다.
 */

function ProgressBar({ badge, className }: { badge: Badge; className?: string }) {
  const pct = Math.round(badge.progress * 100);
  return (
    <div
      className={cn("h-1.5 overflow-hidden rounded-full bg-slate-200/80", className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={`${badge.title} 진행 ${badge.progressText}`}
    >
      {/* 조금이라도 진행했으면 눈에 보이게 최소 4% */}
      <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct === 0 ? 0 : Math.max(4, pct)}%` }} />
    </div>
  );
}

function Medal({ badge, size = "md" }: { badge: Badge; size?: "md" | "lg" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative grid flex-none place-items-center rounded-full",
        size === "lg" ? "h-14 w-14 text-3xl" : "h-11 w-11 text-2xl",
        badge.achieved ? "bg-gradient-to-br from-amber-100 to-orange-100 ring-2 ring-amber-300" : "bg-slate-100 ring-1 ring-slate-200",
      )}
    >
      <span className={cn(!badge.achieved && "opacity-40 grayscale")}>{badge.emoji}</span>
      {!badge.achieved && (
        <span className="absolute -bottom-0.5 -right-0.5 grid h-5 w-5 place-items-center rounded-full bg-white text-ink-faint ring-1 ring-slate-200">
          <Lock className="h-3 w-3" />
        </span>
      )}
    </span>
  );
}

/** 작은 배지 칸 (받은 배지 모음·모든 배지 목록) */
export function BadgeTile({ badge, detailed = false }: { badge: Badge; detailed?: boolean }) {
  return (
    <li
      className={cn(
        "flex flex-col items-center rounded-2xl px-2 py-3 text-center",
        badge.achieved ? "bg-amber-50/70 ring-1 ring-amber-200/70" : "bg-slate-50 ring-1 ring-line/70",
      )}
    >
      <Medal badge={badge} size="lg" />
      <p className={cn("mt-2 text-[13px] font-bold leading-tight", badge.achieved ? "text-ink" : "text-ink-muted")}>
        {badge.title}
        <span className="sr-only">{badge.achieved ? " (받음)" : ` (아직 못 받음, ${badge.progressText})`}</span>
      </p>
      {detailed && <p className="mt-1 text-[12px] leading-snug text-ink-muted">{badge.description}</p>}
      {detailed && badge.tip && <p className="mt-1 text-[12px] font-medium leading-snug text-amber-800">💡 {badge.tip}</p>}
      {!badge.achieved && (
        <div aria-hidden className="mt-2 w-full max-w-[96px]">
          <div className="h-1 overflow-hidden rounded-full bg-slate-200">
            <div className="h-full rounded-full bg-slate-400" style={{ width: `${Math.round(badge.progress * 100)}%` }} />
          </div>
          <p className="mt-1 text-[11px] tabular-nums text-ink-faint">{badge.progressText}</p>
        </div>
      )}
    </li>
  );
}

/** 다음 목표 배지 한 줄: 무엇을 하면 받는지 + 진행 막대 */
function NextBadgeRow({ badge }: { badge: Badge }) {
  return (
    <li className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3 ring-1 ring-line/70">
      <Medal badge={badge} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-[14px] font-bold text-ink-soft">{badge.title}</p>
          <p className="flex-none text-[12px] font-semibold tabular-nums text-ink-muted">{badge.progressText}</p>
        </div>
        <p className="truncate text-[12px] text-ink-muted">{badge.description}</p>
        <ProgressBar badge={badge} className="mt-1.5" />
      </div>
    </li>
  );
}

/** /rides 화면의 '배지' 영역 */
export function BadgeSection({ badges }: { badges: Badge[] }) {
  const achieved = badges.filter((b) => b.achieved);
  const next = nextBadges(badges, 3);
  return (
    <section id="badges" aria-labelledby="badges-title" className="scroll-mt-20">
      <Card className="space-y-4 p-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="badges-title" className="text-lg font-bold tracking-tight">
            배지
          </h2>
          <p className="text-[13px] tabular-nums text-ink-muted">
            <b className="text-ink">{achieved.length}</b>/{badges.length}개 모았어요
          </p>
        </div>

        {achieved.length > 0 ? (
          <ul aria-label="받은 배지" className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {achieved.map((b) => (
              <BadgeTile key={b.id} badge={b} />
            ))}
          </ul>
        ) : (
          <p className="rounded-xl bg-slate-50 px-3 py-3 text-[14px] text-ink-soft">첫 라이딩을 기록하면 첫 배지를 받아요. 가볍게 한 바퀴 어때요?</p>
        )}

        {next.length > 0 && (
          <div>
            <h3 className="text-[13px] font-semibold text-ink-muted">다음 배지까지</h3>
            <ul className="mt-2 space-y-2">
              {next.map((b) => (
                <NextBadgeRow key={b.id} badge={b} />
              ))}
            </ul>
          </div>
        )}

        {/* 자바스크립트 없이 펼치고 접는 기본 기능(details)을 써요 */}
        <details className="group">
          <summary className="flex h-11 cursor-pointer list-none items-center justify-between rounded-xl bg-slate-50 px-3 text-[14px] font-semibold text-ink-soft hover:bg-slate-100 [&::-webkit-details-marker]:hidden">
            모든 배지 보기
            <ChevronDown aria-hidden className="h-4 w-4 transition-transform group-open:rotate-180" />
          </summary>
          <ul aria-label="모든 배지" className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {badges.map((b) => (
              <BadgeTile key={b.id} badge={b} detailed />
            ))}
          </ul>
        </details>
      </Card>
    </section>
  );
}

/** 라이딩 결과 화면: 이번 라이딩으로 새로 받은 배지 */
export function NewBadgesNotice({ badges }: { badges: Badge[] }) {
  if (badges.length === 0) return null;
  return (
    <section aria-label="새로 받은 배지" className="rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 p-4 ring-1 ring-amber-200">
      <ul className="space-y-3">
        {badges.map((b) => (
          <li key={b.id} className="flex items-start gap-3">
            <Medal badge={b} />
            <div className="min-w-0 flex-1">
              <p className="font-bold text-amber-950">
                <span aria-hidden>🎉 </span>새 배지: {b.title}!
              </p>
              <p className="text-[14px] leading-relaxed text-amber-900/80">{b.description}</p>
              {b.tip && <p className="mt-0.5 text-[13px] font-medium text-amber-900">💡 {b.tip}</p>}
            </div>
          </li>
        ))}
      </ul>
      <Link href="/rides#badges" className="mt-3 inline-flex items-center gap-0.5 text-[13px] font-semibold text-amber-900 hover:underline">
        내 배지 모두 보기
        <ChevronRight aria-hidden className="h-4 w-4" />
      </Link>
    </section>
  );
}
