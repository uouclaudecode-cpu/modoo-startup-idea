import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Bike, Navigation, Plus, Wind } from "lucide-react";
import { ButtonLink, EmptyState, ErrorState } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { PART_META, partStatus, partsNeedingCare, type VehiclePart } from "@/lib/parts";
import { RideTracker, type CareTip, type RecentRide, type RideVehicle } from "./RideTracker";

export const metadata: Metadata = { title: "라이딩" };

export default async function RidePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/ride");

  const [{ data, error }, recentRes, partsRes] = await Promise.all([
    supabase.from("vehicles").select("id, name, type, subtype, odometer_m").is("deleted_at", null).order("created_at", { ascending: true }),
    supabase
      .from("rides")
      .select("id, started_at, elapsed_sec, distance_m, vehicle:vehicles(name, type)")
      .eq("owner_id", user.id)
      .order("started_at", { ascending: false })
      .limit(3),
    // 소모품: 교체·점검할 때가 된 게 있으면 라이딩 화면 위에 알려 줘요
    supabase.from("vehicle_parts").select("id, vehicle_id, kind, interval_km, interval_days, distance_m, last_serviced_at, enabled"),
  ]);
  if (partsRes.error) console.error(partsRes.error);
  // 최근 기록은 덤이라 실패해도 라이딩 화면은 보여요
  if (recentRes.error) console.error(recentRes.error);
  const recent: RecentRide[] = ((recentRes.data ?? []) as unknown as { id: string; started_at: string; elapsed_sec: number; distance_m: number; vehicle: { name: string; type: string } | null }[]).map((r) => ({
    id: r.id,
    started_at: r.started_at,
    elapsed_sec: r.elapsed_sec,
    distance_m: r.distance_m,
    vehicle_type: r.vehicle?.type ?? null,
    vehicle_name: r.vehicle?.name ?? null,
  }));
  if (error) {
    console.error(error);
    return <ErrorState title="이동수단을 불러오지 못했어요" description="인터넷 연결을 확인하고 새로고침해 주세요." />;
  }
  const vehicles = (data ?? []) as RideVehicle[];
  if (vehicles.length === 0) {
    // 기록은 이동수단이 있어야 하지만, 길 안내·보관소 찾기는 지금 바로 쓸 수 있어요
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <h1 className="text-2xl font-extrabold tracking-tight">라이딩</h1>
        <EmptyState
          icon={<Bike className="h-7 w-7" />}
          title="기록하려면 이동수단을 먼저 등록해 주세요"
          description="라이딩 거리는 탄 자전거·킥보드의 소모품 수명에 자동으로 더해져요."
          action={
            <ButtonLink href="/vehicles/new" full icon={<Plus aria-hidden className="h-4 w-4" />}>
              이동수단 등록
            </ButtonLink>
          }
        />
        <div className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2">
          <ButtonLink href="/navigate" variant="secondary" icon={<Navigation aria-hidden className="h-4 w-4" />}>
            길 안내
          </ButtonLink>
          <ButtonLink href="/spots" variant="secondary" icon={<Wind aria-hidden className="h-4 w-4" />}>
            보관소·공기주입기
          </ButtonLink>
        </div>
      </div>
    );
  }
  // 가장 급한 소모품 하나 (라이딩 탭 위쪽 알림)
  const now = Date.now();
  const care = vehicles
    .flatMap((v) => partsNeedingCare(((partsRes.data ?? []) as VehiclePart[]).filter((p) => p.vehicle_id === v.id), now).map((c) => ({ ...c, v })))
    .sort((a, b) => b.ratio - a.ratio);
  const careTip: CareTip | null = care[0]
    ? {
        vehicleName: care[0].v.name,
        label: PART_META[care[0].part.kind].label,
        emoji: PART_META[care[0].part.kind].emoji,
        urgent: partStatus(care[0].ratio) === "replace",
        more: care.length - 1,
      }
    : null;
  return <RideTracker vehicles={vehicles} userId={user.id} recent={recent} careTip={careTip} />;
}
