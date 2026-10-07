import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Bike, Play, Plus, Printer } from "lucide-react";
import { MaintenanceAlert } from "@/components/maintenance/MaintenanceAlert";
import { partsNeedingCare, type VehiclePart } from "@/lib/parts";
import { ButtonLink, EmptyState, ErrorState } from "@/components/ui";
import { VehicleCard } from "@/components/vehicle/VehicleCard";
import { PostCard, type PostListItem } from "@/components/community/PostCard";
import { POST_LIST_COLUMNS } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import type { Vehicle } from "@/lib/types";

export const metadata: Metadata = { title: "내 이동수단" };

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/dashboard");

  const [{ data: profile }, { data: vehicles, error }, { data: myPosts }, { data: allParts, error: partsErr }] = await Promise.all([
    supabase.from("profiles").select("nickname, is_admin").eq("id", user.id).maybeSingle(),
    supabase.from("vehicles").select("*").is("deleted_at", null).order("created_at", { ascending: false }),
    supabase
      .from("lost_posts")
      .select(POST_LIST_COLUMNS)
      .eq("author_id", user.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase.from("vehicle_parts").select("id, vehicle_id, kind, interval_km, interval_days, distance_m, last_serviced_at, enabled"),
  ]);
  if (partsErr) console.error(partsErr);

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

  // 이동수단별 정비 알림 (점검 필요·교체 권장)
  const now = Date.now();
  const careByVehicle = list
    .map((v) => ({ v, items: partsNeedingCare(((allParts ?? []) as VehiclePart[]).filter((p) => p.vehicle_id === v.id), now) }))
    .filter((x) => x.items.length > 0);

  const nickname = profile?.nickname || user.email?.split("@")[0] || "회원";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">안녕하세요, {nickname}님</h1>
        <p className="mt-1 flex items-center gap-1.5 text-ink-muted">
          <Bike aria-hidden className="h-4 w-4" />내 이동수단 {list.length}개
        </p>
      </div>

      {list.length > 0 && (
        <ButtonLink href="/ride" full size="lg" icon={<Play aria-hidden className="h-5 w-5" />}>
          라이딩 시작
        </ButtonLink>
      )}

      {careByVehicle.map(({ v, items }) => (
        <MaintenanceAlert key={v.id} vehicleId={v.id} vehicleName={v.name} items={items} now={now} />
      ))}

      {profile?.is_admin && (
        <ButtonLink href="/admin/stickers" variant="secondary" full icon={<Printer aria-hidden className="h-4 w-4" />}>
          🏷️ 스티커 관리 (관리자)
        </ButtonLink>
      )}

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

      {(myPosts ?? []).length > 0 && (
        <section className="space-y-3 pt-2">
          <h2 className="text-lg font-bold">내 분실 글</h2>
          <ul className="space-y-3">
            {(myPosts as PostListItem[]).map((p) => (
              <li key={p.id}>
                <PostCard post={p} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
