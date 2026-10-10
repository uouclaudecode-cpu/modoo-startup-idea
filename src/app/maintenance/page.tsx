import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, Plus, Wrench } from "lucide-react";
import { MaintenanceAlert } from "@/components/maintenance/MaintenanceAlert";
import { MaintenanceOverview } from "@/components/maintenance/MaintenanceOverview";
import { ButtonLink, EmptyState, ErrorState } from "@/components/ui";
import { partsNeedingCare, type VehiclePart } from "@/lib/parts";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "소모품·정비" };

/**
 * 라이딩 탭 안의 '소모품·정비': 내 모든 이동수단의 부품 상태를 한곳에서.
 * 이동수단을 누르면 그 이동수단의 정비 다이어리(교체 기록·주기 바꾸기)로 가요.
 */
export default async function MaintenanceHubPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/maintenance");

  const [{ data: vehicles, error }, { data: parts, error: pErr }] = await Promise.all([
    supabase.from("vehicles").select("id, name, odometer_m").is("deleted_at", null).order("created_at", { ascending: true }),
    supabase.from("vehicle_parts").select("id, vehicle_id, kind, interval_km, interval_days, distance_m, last_serviced_at, enabled"),
  ]);
  if (error || pErr) {
    console.error(error ?? pErr);
    return <ErrorState title="정비 정보를 불러오지 못했어요" description="인터넷 연결을 확인하고 새로고침해 주세요." />;
  }
  const list = (vehicles ?? []) as { id: string; name: string; odometer_m: number }[];
  const all = (parts ?? []) as VehiclePart[];
  const now = Date.now();
  const care = list.map((v) => ({ v, items: partsNeedingCare(all.filter((p) => p.vehicle_id === v.id), now) })).filter((x) => x.items.length > 0);

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Link href="/ride" className="-ml-2 inline-flex h-10 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-ink-muted hover:bg-slate-100 hover:text-ink">
        <ChevronLeft aria-hidden className="h-4 w-4" />
        라이딩
      </Link>
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight">
          <Wrench aria-hidden className="h-6 w-6 text-brand-600" />
          소모품·정비
        </h1>
        <p className="mt-1 text-sm leading-relaxed text-ink-muted">
          라이딩한 거리와 날짜로 타이어·체인·브레이크 교체 시기를 알려 드려요. 이동수단을 누르면 정비 기록을 남기고 주기를 바꿀 수 있어요.
        </p>
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={<Wrench className="h-7 w-7" />}
          title="먼저 이동수단을 등록해 주세요"
          description="등록하면 소모품 교체 시기를 자동으로 챙겨 드려요."
          action={
            <ButtonLink href="/vehicles/new" full icon={<Plus aria-hidden className="h-4 w-4" />}>
              이동수단 등록
            </ButtonLink>
          }
        />
      ) : (
        <>
          {care.map(({ v, items }) => (
            <MaintenanceAlert key={v.id} vehicleId={v.id} vehicleName={v.name} items={items} now={now} />
          ))}
          <MaintenanceOverview vehicles={list} parts={all} now={now} />
          {care.length === 0 && <p className="px-1 text-center text-[13px] text-ink-muted">지금은 챙길 소모품이 없어요. 👍</p>}
        </>
      )}
    </div>
  );
}
