import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, Play } from "lucide-react";
import { ButtonLink, ErrorState } from "@/components/ui";
import { formatDistance } from "@/lib/ride/geo";
import type { MaintenanceLog, VehiclePart } from "@/lib/parts";
import { getOwnedVehicle } from "@/lib/vehicles";
import { MaintenanceDiary } from "./MaintenanceDiary";
import { PartsBoard } from "./PartsBoard";
import { ManualDistance } from "@/components/maintenance/ManualDistance";
import { pressureTip } from "@/lib/subtypes";

export const metadata: Metadata = { title: "소모품·정비 다이어리" };

export default async function MaintenancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, vehicle } = await getOwnedVehicle(id, `/vehicles/${id}/maintenance`);
  const [{ data: parts, error: pErr }, { data: logs, error: lErr }] = await Promise.all([
    supabase
      .from("vehicle_parts")
      .select("id, vehicle_id, kind, interval_km, interval_days, distance_m, last_serviced_at, enabled")
      .eq("vehicle_id", vehicle.id),
    supabase
      .from("maintenance_logs")
      .select("id, vehicle_id, part_id, kind, serviced_on, cost, shop, memo, distance_m, created_at")
      .eq("vehicle_id", vehicle.id)
      .order("serviced_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200),
  ]);
  if (pErr || lErr) {
    console.error(pErr ?? lErr);
    return <ErrorState title="정비 정보를 불러오지 못했어요" description="인터넷 연결을 확인하고 새로고침해 주세요." />;
  }
  // 부품별 지난번 실제 수명: 가장 최근 정비 기록에 남은 '그때까지 달린 거리'
  const lastLife: Record<string, number> = {};
  for (const l of (logs ?? []) as MaintenanceLog[]) {
    if (l.part_id && l.distance_m > 0 && lastLife[l.part_id] == null) lastLife[l.part_id] = l.distance_m;
  }
  // 서버와 브라우저가 같은 기준 시각으로 남은 기간을 계산하도록 넘겨요.
  const now = Date.now();

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <Link href={`/vehicles/${vehicle.id}`} className="-ml-2 inline-flex h-10 max-w-full items-center gap-1 rounded-lg px-2 text-sm font-semibold text-ink-muted hover:bg-slate-100 hover:text-ink">
        <ChevronLeft aria-hidden className="h-4 w-4 flex-none" />
        <span className="truncate">{vehicle.name}</span>
      </Link>
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">소모품·정비</h1>
          <p className="mt-1 text-sm text-ink-muted">
            누적 주행 <b className="text-ink">{formatDistance(vehicle.odometer_m ?? 0)}</b>
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <ButtonLink href="/ride" variant="secondary" icon={<Play aria-hidden className="h-4 w-4" />}>
          라이딩 시작
        </ButtonLink>
        <ManualDistance vehicleId={vehicle.id} />
      </div>
      <p className="rounded-xl bg-slate-50 p-3 text-[13px] leading-relaxed text-ink-soft">
        라이딩을 기록하면 거리가 자동으로 쌓여요. 앱 없이 탔다면 &lsquo;탄 거리 더하기&rsquo;로 직접 더해 주세요. 날짜로 정하는 항목(공기압 등)은 라이딩과 상관없이 계산돼요.
        <span className="mt-1 block font-semibold text-ink">공기압: {pressureTip(vehicle.type, vehicle.subtype)}</span>
      </p>
      <PartsBoard parts={(parts ?? []) as VehiclePart[]} now={now} lastLife={lastLife} />
      <MaintenanceDiary logs={(logs ?? []) as MaintenanceLog[]} ownedSince={vehicle.owned_since ?? null} />
    </div>
  );
}
