import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Card } from "@/components/ui";
import { requireAdmin } from "@/lib/admin";
import { HazardImporter, SpotImporter } from "./SpotImporter";

export const metadata: Metadata = { title: "보관소·공기주입기 관리", robots: { index: false } };

type Counts = { public: number; public_pump: number; user: number; hidden: number; broken: number; last_import: string | null };

/** 관리자 전용: 공공데이터 불러오기와 개수 */
export default async function AdminSpotsPage() {
  const { supabase } = await requireAdmin("/admin/spots");
  const { data, error } = await supabase.rpc("admin_bike_spot_counts");
  if (error) console.error(error);
  const c = (data ?? null) as Counts | null;
  const { data: hz } = await supabase.rpc("admin_bike_hazard_counts");
  const h = (hz ?? null) as { count: number; year: number | null; first_year?: number | null } | null;
  const stats: [string, number | string][] = c
    ? [
        ["보관소 (공공데이터)", c.public],
        ["그중 공기주입기", c.public_pump],
        ["회원이 알려 준 공기주입기", c.user],
        ["최근 고장 표시", c.broken],
        ["숨긴 장소", c.hidden],
        [`사고 잦은 곳${h?.year ? ` (${h.first_year && h.first_year !== h.year ? `${h.first_year}~` : ""}${h.year}년)` : ""}`, h?.count ?? 0],
      ]
    : [];

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Link href="/admin" className="-ml-2 inline-flex h-10 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-ink-muted hover:bg-slate-100 hover:text-ink">
        <ChevronLeft aria-hidden className="h-4 w-4" />
        운영 통계
      </Link>
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">보관소·공기주입기 관리</h1>
        <p className="mt-1 text-sm leading-relaxed text-ink-muted">
          행정안전부 자전거보관소정보와 도로교통공단 자전거사고 다발지역(공공데이터포털)을 불러와 지도에 보여 줘요. 매달 2일 새벽 3시에 자동으로 다시 불러와요(035 설정 필요). 버튼으로 바로 불러올 수도 있어요. 같은 장소는 새 정보로 덮어써요.
        </p>
      </div>
      {error ? (
        <p className="rounded-xl bg-amber-50 p-3 text-[13px] leading-relaxed text-amber-900 ring-1 ring-amber-200">
          개수를 불러오지 못했어요. Supabase에서 <b>031_profile_spots.sql</b>을 실행했는지 확인해 주세요.
        </p>
      ) : (
        c && (
          <Card className="grid grid-cols-2 gap-3 p-4">
            {stats.map(([label, n]) => (
              <div key={label}>
                <p className="text-[12px] font-semibold text-ink-muted">{label}</p>
                <p className="text-xl font-extrabold tabular-nums">{Number(n).toLocaleString("ko-KR")}</p>
              </div>
            ))}
            <div>
              <p className="text-[12px] font-semibold text-ink-muted">마지막으로 불러온 때</p>
              <p className="text-[15px] font-bold">{c.last_import ? new Date(c.last_import).toLocaleDateString("ko-KR") : "아직 없음"}</p>
            </div>
          </Card>
        )
      )}
      <SpotImporter />
      <HazardImporter />
      <Link href="/spots" className="block text-center text-sm font-semibold text-brand-700 hover:underline">
        지도에서 보기
      </Link>
    </div>
  );
}
