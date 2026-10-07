import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, PartyPopper, Wrench } from "lucide-react";
import { ButtonLink, Card } from "@/components/ui";
import { MaintenanceAlert } from "@/components/maintenance/MaintenanceAlert";
import { RideMap } from "@/components/ride/RideMap";
import { UUID_RE } from "@/lib/community";
import { formatDateTime } from "@/lib/format";
import { partsNeedingCare, type VehiclePart } from "@/lib/parts";
import { averageSpeed, formatDistance, formatDuration, fromPathJson } from "@/lib/ride/geo";
import { createClient } from "@/lib/supabase/server";
import { DeleteRideButton } from "./DeleteRideButton";

export const metadata: Metadata = { title: "라이딩 결과" };

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
    .select("id, vehicle_id, started_at, ended_at, elapsed_sec, moving_sec, distance_m, max_speed_kmh, path, vehicle:vehicles(id, name, odometer_m, deleted_at)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!ride) notFound();
  const vehicle = ride.vehicle as unknown as { id: string; name: string; odometer_m: number; deleted_at: string | null } | null;

  // 이 라이딩 뒤로 점검·교체가 필요한 소모품 (알림)
  let care: ReturnType<typeof partsNeedingCare<VehiclePart>> = [];
  if (vehicle && !vehicle.deleted_at) {
    const { data: parts, error: pErr } = await supabase
      .from("vehicle_parts")
      .select("id, vehicle_id, kind, interval_km, interval_days, distance_m, last_serviced_at, enabled")
      .eq("vehicle_id", vehicle.id);
    if (pErr) console.error(pErr);
    care = partsNeedingCare((parts ?? []) as VehiclePart[]);
  }

  const path = fromPathJson(ride.path);
  const stats: [string, string][] = [
    ["시간", formatDuration(ride.elapsed_sec)],
    ["이동 시간", formatDuration(ride.moving_sec)],
    ["평균 속도", `${averageSpeed(ride.distance_m, ride.moving_sec).toFixed(1)} km/h`],
    ["최고 속도", `${(ride.max_speed_kmh ?? 0).toFixed(1)} km/h`],
  ];

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
