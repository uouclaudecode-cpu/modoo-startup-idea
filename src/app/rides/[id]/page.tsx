import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, PartyPopper, Wrench } from "lucide-react";
import { ButtonLink, Card } from "@/components/ui";
import { MaintenanceAlert } from "@/components/maintenance/MaintenanceAlert";
import { NewBadgesNotice } from "@/components/ride/BadgeGrid";
import { RideMap } from "@/components/ride/RideMap";
import { UUID_RE } from "@/lib/community";
import { formatDateTime } from "@/lib/format";
import { partsNeedingCare, type VehiclePart } from "@/lib/parts";
import { computeTotals, newlyEarned, type Badge, type BadgeRide } from "@/lib/ride/badges";
import { fetchAllPages } from "@/lib/ride/fetchAll";
import { averageSpeed, formatDistance, formatDuration, fromPathJson } from "@/lib/ride/geo";
import { createClient } from "@/lib/supabase/server";
import { fetchElevation } from "@/lib/ride/export";
import { DeleteRideButton } from "./DeleteRideButton";
import { RideExport } from "./RideExport";

export const metadata: Metadata = { title: "라이딩 결과" };

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/** 이 라이딩 뒤로 점검·교체가 필요한 소모품 (알림) */
async function loadCare(supabase: ServerClient, vehicleId: string) {
  const { data: parts, error } = await supabase
    .from("vehicle_parts")
    .select("id, vehicle_id, kind, interval_km, interval_days, distance_m, last_serviced_at, enabled")
    .eq("vehicle_id", vehicleId);
  if (error) console.error(error);
  return partsNeedingCare((parts ?? []) as VehiclePart[]);
}

/**
 * 이번 라이딩으로 새로 받은 배지.
 * '이 라이딩보다 먼저 시작한 기록'과 '거기에 이 라이딩을 더한 기록'의 배지를 비교해요.
 * 시작 시각 기준이라 결과 화면을 새로고침하거나 나중에 다시 열어도 같은 배지가 나와요.
 * 배지 알림은 덤이라, 불러오기에 실패하면 조용히 빈 목록으로 넘어가요.
 */
async function loadNewBadges(supabase: ServerClient, userId: string, ride: BadgeRide): Promise<Badge[]> {
  const { data: prev, error } = await fetchAllPages<BadgeRide>((from, to) =>
    supabase
      .from("rides")
      .select("started_at, distance_m")
      .eq("owner_id", userId)
      .lt("started_at", ride.started_at)
      .order("started_at", { ascending: true })
      .range(from, to),
  );
  if (error) {
    console.error(error);
    return [];
  }
  const self: BadgeRide = { started_at: ride.started_at, distance_m: ride.distance_m };
  return newlyEarned(computeTotals(prev), computeTotals([...prev, self]));
}

export default async function RideDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ done?: string }> }) {
  const { id } = await params;
  const { done } = await searchParams;
  if (!UUID_RE.test(id)) notFound();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/rides/${id}`);

  const { data: ride, error } = await supabase
    .from("rides")
    .select("id, vehicle_id, started_at, ended_at, elapsed_sec, moving_sec, distance_m, max_speed_kmh, battery_start, battery_end, path, vehicle:vehicles(id, name, odometer_m, deleted_at)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!ride) notFound();
  const vehicle = ride.vehicle as unknown as { id: string; name: string; odometer_m: number; deleted_at: string | null } | null;

  // 소모품 알림과 새 배지 계산은 서로 상관없어서 동시에 받아요.
  const path = fromPathJson(ride.path);
  const [care, earned, elev] = await Promise.all([
    vehicle && !vehicle.deleted_at ? loadCare(supabase, vehicle.id) : Promise.resolve([]),
    done ? loadNewBadges(supabase, user.id, ride) : Promise.resolve<Badge[]>([]),
    ride.distance_m >= 500 ? fetchElevation(path) : Promise.resolve(null),
  ]);
  const stats: [string, string][] = [
    ["시간", formatDuration(ride.elapsed_sec)],
    ["이동 시간", formatDuration(ride.moving_sec)],
    ["평균 속도", `${averageSpeed(ride.distance_m, ride.moving_sec).toFixed(1)} km/h`],
    ["최고 속도", `${(ride.max_speed_kmh ?? 0).toFixed(1)} km/h`],
  ];
  if (elev) stats.push(["오르막", `+${elev.gain} m`], ["최고 고도", `${elev.max} m`]);
  // 배터리: 쓴 만큼으로 1회 충전 주행거리를 어림해요 (5% 이상 썼을 때만)
  const bs = ride.battery_start as number | null, be = ride.battery_end as number | null;
  const used = bs != null && be != null ? bs - be : null;
  if (bs != null && be != null) stats.push(["배터리", `${bs}% → ${be}%`]);
  if (used != null && used >= 5 && ride.distance_m >= 1000) stats.push(["1회 충전 예상", `약 ${Math.round(ride.distance_m / 10 / used)} km`]);

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Link href="/rides" className="inline-flex items-center gap-1 text-sm font-semibold text-ink-muted hover:text-ink">
        <ChevronLeft aria-hidden className="h-4 w-4" />
        라이딩 기록
      </Link>

      {done && (
        <div className="flex items-start gap-3 rounded-2xl bg-emerald-50 p-4 text-emerald-800 ring-1 ring-emerald-200">
          <PartyPopper aria-hidden className="mt-0.5 h-5 w-5 flex-none" />
          <p className="text-[15px] leading-relaxed">
            <b>수고했어요!</b> {formatDistance(ride.distance_m)}를 {vehicle?.name ?? "이동수단"}의 누적 거리와 소모품 거리에 더했어요.
          </p>
        </div>
      )}

      <NewBadgesNotice badges={earned} />

      <RideMap path={path} fit className="h-[40vh] min-h-[240px]" />

      <Card className="p-4">
        <p className="text-[13px] text-ink-muted">
          {formatDateTime(ride.started_at)} ~ {formatDateTime(ride.ended_at).slice(11)} · {vehicle?.name ?? "삭제한 이동수단"}
        </p>
        <p className="mt-1 text-4xl font-extrabold tabular-nums tracking-tight">{formatDistance(ride.distance_m)}</p>
        <dl className="mt-4 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
          {stats.map(([k, v]) => (
            <div key={k} className="rounded-xl bg-slate-50 px-2 py-2.5">
              <dt className="text-[12px] text-ink-muted">{k}</dt>
              <dd className="mt-0.5 font-bold tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
        {vehicle && !vehicle.deleted_at && (
          <p className="mt-3 text-[13px] text-ink-muted">
            {vehicle.name} 누적 주행 <b className="text-ink">{formatDistance(vehicle.odometer_m)}</b>
          </p>
        )}
      </Card>

      {path.length > 1 && <RideExport rideId={ride.id} />}

      {vehicle && !vehicle.deleted_at && care.length > 0 && <MaintenanceAlert vehicleId={vehicle.id} vehicleName={vehicle.name} items={care} />}

      {vehicle && !vehicle.deleted_at && (
        <ButtonLink href={`/vehicles/${vehicle.id}/maintenance`} variant="secondary" full icon={<Wrench aria-hidden className="h-4 w-4" />}>
          소모품·정비 다이어리
        </ButtonLink>
      )}
      <DeleteRideButton rideId={ride.id} />
    </div>
  );
}
