import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, Play, Route } from "lucide-react";
import { ButtonLink, Card, EmptyState, ErrorState } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { averageSpeed, formatDistance, formatDuration } from "@/lib/ride/geo";
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

export default async function RidesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/rides");

  const { data, error } = await supabase
    .from("rides")
    .select("id, started_at, elapsed_sec, moving_sec, distance_m, vehicle:vehicles(name, type)")
    .order("started_at", { ascending: false })
    .limit(100);
  if (error) {
    console.error(error);
    return <ErrorState title="기록을 불러오지 못했어요" description="인터넷 연결을 확인하고 새로고침해 주세요." />;
  }
  const rides = (data ?? []) as unknown as Row[];

  // 이번 달 합계 (한국 시간 기준)
  const month = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 7);
  const thisMonth = rides.filter((r) => new Date(new Date(r.started_at).getTime() + 9 * 3600e3).toISOString().startsWith(month));
  const monthKm = thisMonth.reduce((a, r) => a + r.distance_m, 0);
  const monthSec = thisMonth.reduce((a, r) => a + r.elapsed_sec, 0);

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight">라이딩 기록</h1>
        <ButtonLink href="/ride" icon={<Play aria-hidden className="h-4 w-4" />}>
          라이딩 시작
        </ButtonLink>
      </div>

      <Card className="grid grid-cols-3 gap-2 p-4 text-center">
        <div>
          <p className="text-[12px] text-ink-muted">이번 달 거리</p>
          <p className="mt-0.5 text-lg font-extrabold tabular-nums">{formatDistance(monthKm)}</p>
        </div>
        <div>
          <p className="text-[12px] text-ink-muted">이번 달 시간</p>
          <p className="mt-0.5 text-lg font-extrabold tabular-nums">{formatDuration(monthSec)}</p>
        </div>
        <div>
          <p className="text-[12px] text-ink-muted">이번 달 횟수</p>
          <p className="mt-0.5 text-lg font-extrabold tabular-nums">{thisMonth.length}회</p>
        </div>
      </Card>

      {rides.length === 0 ? (
        <EmptyState
          icon={<Route className="h-7 w-7" />}
          title="아직 라이딩 기록이 없어요"
          description="라이딩을 기록하면 거리가 소모품 수명에 자동으로 더해져서, 정비할 때를 알려드려요."
          action={
            <ButtonLink href="/ride" full icon={<Play aria-hidden className="h-4 w-4" />}>
              첫 라이딩 시작
            </ButtonLink>
          }
        />
      ) : (
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
      )}
    </div>
  );
}
