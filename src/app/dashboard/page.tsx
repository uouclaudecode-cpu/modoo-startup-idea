import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Bike, Plus } from "lucide-react";
import { ButtonLink, EmptyState, ErrorState } from "@/components/ui";
import { VehicleCard } from "@/components/vehicle/VehicleCard";
import { createClient } from "@/lib/supabase/server";
import type { Vehicle } from "@/lib/types";

export const metadata: Metadata = { title: "내 이동수단" };

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/dashboard");

  const [{ data: profile }, { data: vehicles, error }] = await Promise.all([
    supabase.from("profiles").select("nickname").eq("id", user.id).maybeSingle(),
    supabase.from("vehicles").select("*").is("deleted_at", null).order("created_at", { ascending: false }),
  ]);

  if (error) {
    console.error(error);
    return <ErrorState title="이동수단을 불러오지 못했어요" description="인터넷 연결을 확인하고 새로고침해 주세요." />;
  }

  const list = (vehicles ?? []) as Vehicle[];
  // 수색 중인 이동수단의 발견 제보 수 (발견 제보 접수 상태 계산용)
  const counts = new Map<string, number>();
  const searchingIds = list.filter((v) => v.status === "searching").map((v) => v.id);
  if (searchingIds.length) {
    const { data: reports } = await supabase.from("reports").select("vehicle_id").eq("kind", "found").in("vehicle_id", searchingIds);
    for (const r of reports ?? []) counts.set(r.vehicle_id, (counts.get(r.vehicle_id) ?? 0) + 1);
  }

  const nickname = profile?.nickname || user.email?.split("@")[0] || "회원";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">안녕하세요, {nickname}님</h1>
        <p className="mt-1 flex items-center gap-1.5 text-ink-muted">
          <Bike aria-hidden className="h-4 w-4" />내 이동수단 {list.length}개
        </p>
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={<Bike className="h-7 w-7" />}
          title="아직 등록된 이동수단이 없습니다."
          description="자전거나 킥보드를 등록하면 디지털 신분증(QR)이 자동으로 만들어져요."
          action={
            <ButtonLink href="/vehicles/new" full size="lg" icon={<Plus aria-hidden className="h-5 w-5" />}>
              이동수단 등록
            </ButtonLink>
          }
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            {list.map((v) => (
              <VehicleCard key={v.id} vehicle={v} foundReports={counts.get(v.id) ?? 0} />
            ))}
          </div>
          <ButtonLink href="/vehicles/new" full size="lg" variant="secondary" icon={<Plus aria-hidden className="h-5 w-5" />}>
            이동수단 등록
          </ButtonLink>
        </>
      )}
    </div>
  );
}
