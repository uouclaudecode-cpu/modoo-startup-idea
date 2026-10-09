import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, Play, Route } from "lucide-react";
import { ButtonLink, Card, EmptyState, ErrorState } from "@/components/ui";
import { BadgeSection } from "@/components/ride/BadgeGrid";
import { RideStatsCard, StreakBanner, type StatsView } from "@/components/ride/RideStatsCard";
import { formatDateTime } from "@/lib/format";
import { computeTotals, evaluateBadges, type BadgeRide } from "@/lib/ride/badges";
import { fetchAllPages } from "@/lib/ride/fetchAll";
import { averageSpeed, formatDistance, formatDuration } from "@/lib/ride/geo";
import { bucketByMonth, bucketByWeek, kstDay, rideDays, statsSince, streakDays, type RideLite } from "@/lib/ride/stats";
import { createClient } from "@/lib/supabase/server";
import { typeEmoji } from "@/lib/types";

export const metadata: Metadata = { title: "라이딩 기록" };

type Row = {
  id: string;
  started_at: string;
  elapsed_sec: number;
  moving_sec: number;
  distance_m: number;
  vehicle: { name: string; type: string } | null;
};

const WEEKS = 8;
const MONTHS = 6;

export default async function RidesPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view: viewParam } = await searchParams;
  const view: StatsView = viewParam === "month" ? "month" : "week";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/rides");

  const now = Date.now();
  // 세 가지를 한꺼번에 받아요: 목록(최근 100개) · 그래프용(최근 6개월, 경로 없이) · 배지용(전체, 거리·시각만)
  const [listRes, statsRes, totalsRes] = await Promise.all([
    supabase
      .from("rides")
      .select("id, started_at, elapsed_sec, moving_sec, distance_m, vehicle:vehicles(name, type)")
      .order("started_at", { ascending: false })
      .limit(100),
    fetchAllPages<RideLite>((from, to) =>
      supabase
        .from("rides")
        .select("started_at, distance_m, elapsed_sec, moving_sec")
        .eq("owner_id", user.id)
        .gte("started_at", new Date(statsSince(now, WEEKS, MONTHS)).toISOString())
        .order("started_at", { ascending: true })
        .range(from, to),
    ),
    fetchAllPages<BadgeRide>((from, to) =>
      supabase.from("rides").select("started_at, distance_m").eq("owner_id", user.id).order("started_at", { ascending: true }).range(from, to),
    ),
  ]);
  if (listRes.error) {
    console.error(listRes.error);
    return <ErrorState title="기록을 불러오지 못했어요" description="인터넷 연결을 확인하고 새로고침해 주세요." />;
  }
  const rides = (listRes.data ?? []) as unknown as Row[];

  // 통계·배지는 실패해도 목록은 보여줘요. (덜 중요한 부분 때문에 화면 전체가 막히지 않게)
  if (statsRes.error) console.error(statsRes.error);
  if (totalsRes.error) console.error(totalsRes.error);
  const statsOk = !statsRes.error;
  const totalsOk = !totalsRes.error;

  const buckets = view === "week" ? bucketByWeek(statsRes.data, now, WEEKS) : bucketByMonth(statsRes.data, now, MONTHS);
  const allRides = totalsRes.data;
  const startedAts = allRides.map((r) => r.started_at);
  const streak = streakDays(startedAts, now);
  const rodeToday = rideDays(startedAts).has(kstDay(now));
  const badges = evaluateBadges(computeTotals(allRides));

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight">라이딩 기록</h1>
        <ButtonLink href="/ride" icon={<Play aria-hidden className="h-4 w-4" />}>
          라이딩 시작
        </ButtonLink>
      </div>

      {rides.length === 0 ? (
        <>
          <EmptyState
            icon={<Route className="h-7 w-7" />}
            title="아직 라이딩 기록이 없어요"
            description="라이딩을 기록하면 거리가 소모품 수명에 자동으로 더해져서, 정비할 때를 알려 드려요."
            action={
              <ButtonLink href="/ride" full icon={<Play aria-hidden className="h-4 w-4" />}>
                첫 라이딩 시작
              </ButtonLink>
            }
          />
          {totalsOk && <BadgeSection badges={badges} />}
        </>
      ) : (
        <>
          {totalsOk && <StreakBanner streak={streak} rodeToday={rodeToday} />}
          {statsOk && <RideStatsCard view={view} buckets={buckets} />}
          {totalsOk && <BadgeSection badges={badges} />}

          <section aria-labelledby="ride-list-title" className="space-y-2">
            <h2 id="ride-list-title" className="px-1 pt-2 text-lg font-bold tracking-tight">
              최근 기록
            </h2>
            <ul className="space-y-2">
              {rides.map((r) => (
                <li key={r.id}>
                  <Link href={`/rides/${r.id}`} className="block">
                    <Card className="flex items-center gap-3 p-4 hover:shadow-lift">
                      <span aria-hidden className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-brand-50 text-xl">
                        {r.vehicle ? typeEmoji(r.vehicle.type) : "🚲"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-bold tabular-nums">
                          {formatDistance(r.distance_m)} <span className="text-sm font-medium text-ink-muted">· {formatDuration(r.elapsed_sec)}</span>
                        </p>
                        <p className="truncate text-[13px] text-ink-muted">
                          {formatDateTime(r.started_at)} · {r.vehicle?.name ?? "삭제한 이동수단"} · 평균 {averageSpeed(r.distance_m, r.moving_sec).toFixed(1)}km/h
                        </p>
                      </div>
                      <ChevronRight aria-hidden className="h-5 w-5 flex-none text-ink-faint" />
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
