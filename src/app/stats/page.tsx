import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3, MapPinned, RotateCw, Search, Siren } from "lucide-react";
import { ButtonLink, Card, ErrorState, buttonClass } from "@/components/ui";
import { PinMap, type MapPin as PinMapPin } from "@/components/map/PinMap";
import { createClient } from "@/lib/supabase/server";

// 홈 '도난 다발 지도' 칸에서 들어오는 화면이라 같은 이름으로 불러요
export const metadata: Metadata = {
  title: "도난 다발 지도·통계",
  description: "최근 1년 자전거·킥보드 도난 경보가 많았던 곳과 B-LOCK 등록·회수 현황",
};

type Stats = {
  vehicles: number;
  stickers: number;
  users: number;
  alerts: number;
  recovered: number;
  found_reports: number;
  lookups: number;
  lookups_stolen: number;
  sightings: number;
};
type Cell = { lat: number; lng: number; n: number; recovered: number };

/** 불러오기 실패: 0건·'아직 없어요'로 보이지 않게 따로 알려요 (화면을 통째로 다시 불러오는 버튼) */
function LoadError({ title }: { title: string }) {
  return (
    <ErrorState
      title={title}
      description="인터넷 연결을 확인하고 잠시 후 다시 시도해 주세요."
      action={
        <a href="/stats" className={buttonClass("primary", "md", true)}>
          <RotateCw aria-hidden className="h-4 w-4" />
          다시 시도
        </a>
      }
    />
  );
}

export default async function StatsPage() {
  const supabase = await createClient();
  const [{ data: s, error: sErr }, { data: c, error: cErr }] = await Promise.all([supabase.rpc("public_stats"), supabase.rpc("theft_cells", { p_days: 365 })]);
  if (sErr) console.error(sErr);
  if (cErr) console.error(cErr);
  const stats = (s ?? {}) as Partial<Stats>;
  const cells = (c ?? []) as Cell[];
  const n = (k: keyof Stats) => (stats[k] ?? 0).toLocaleString("ko-KR");
  const rate = stats.alerts ? Math.round(((stats.recovered ?? 0) / stats.alerts) * 100) : null;

  const pins: PinMapPin[] = cells.map((x) => ({
    lat: x.lat,
    lng: x.lng,
    mark: String(x.n),
    label: `이 근처(약 500m) 도난 경보 ${x.n}건${x.recovered ? ` · 되찾음 ${x.recovered}건` : ""}`,
    color: x.n >= 5 ? "rose" : x.n >= 2 ? "orange" : "brand",
  }));

  const tiles: [string, string, string][] = [
    ["등록된 이동수단", n("vehicles"), "대"],
    ["연결된 QR 스티커", n("stickers"), "장"],
    ["도난 경보", n("alerts"), "건"],
    ["되찾음", n("recovered"), rate != null ? `건 (${rate}%)` : "건"],
    ["발견 제보", n("found_reports"), "건"],
    ["구매 전 도난 조회", n("lookups"), "번"],
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight">
          <BarChart3 aria-hidden className="h-6 w-6 text-brand-600" />
          도난 다발 지도·통계
        </h1>
        <p className="mt-1 text-[15px] text-ink-muted">B-LOCK에 쌓인 실제 데이터로 계산해요. 개인을 알아볼 수 있는 정보는 없어요.</p>
      </div>

      {sErr ? (
        <LoadError title="통계를 불러오지 못했어요" />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {tiles.map(([label, value, unit]) => (
            <Card key={label} className="p-4">
              <p className="text-[13px] text-ink-muted">{label}</p>
              <p className="mt-1 text-2xl font-extrabold tabular-nums text-ink">
                {value}
                <span className="ml-0.5 text-[13px] font-semibold text-ink-muted">{unit}</span>
              </p>
            </Card>
          ))}
        </div>
      )}
      {!sErr && (stats.lookups_stolen ?? 0) > 0 && (
        <p className="rounded-xl bg-rose-50 p-3 text-[14px] text-rose-800">구매 전 조회로 도난 신고된 이동수단을 {n("lookups_stolen")}번 걸러냈어요.</p>
      )}

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <MapPinned aria-hidden className="h-5 w-5 text-rose-600" />
          도난 다발 지역 (최근 1년)
        </h2>
        {cErr ? (
          <LoadError title="도난 다발 지도를 불러오지 못했어요" />
        ) : pins.length > 0 ? (
          <>
            <PinMap pins={pins} className="h-80" />
            <p className="text-[13px] leading-relaxed text-ink-muted">
              도난 경보 위치를 약 500m 칸으로 묶은 개수예요. 숫자가 큰 곳에 세울 땐 기둥에 U자 자물쇠로 프레임까지 묶고, 사람 많은 곳에 세워 주세요.
            </p>
          </>
        ) : (
          <Card className="text-[15px] text-ink-muted">아직 도난 경보가 쌓이지 않았어요. 경보가 생기면 여기에 지도로 보여요.</Card>
        )}
      </section>

      <div className="grid gap-2 sm:grid-cols-2">
        <ButtonLink href="/check" variant="secondary" icon={<Search aria-hidden className="h-4 w-4" />}>
          중고 구매 전 도난 조회
        </ButtonLink>
        <ButtonLink href="/alerts" variant="secondary" icon={<Siren aria-hidden className="h-4 w-4" />}>
          근처 도난 경보
        </ButtonLink>
      </div>
      <p className="text-center text-[12px] text-ink-muted">
        이 통계는 B-LOCK에 등록된 데이터만 집계해요. 전체 도난 건수는 <Link href="https://www.police.go.kr" className="underline">경찰청</Link> 통계를 참고해 주세요.
      </p>
    </div>
  );
}
