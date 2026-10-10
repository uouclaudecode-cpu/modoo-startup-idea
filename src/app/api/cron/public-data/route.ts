import { NextResponse, type NextRequest } from "next/server";
import { dataKey, fetchHazardRows, fetchSpotRows, HAZARD_YEARS, latestHazardYear, SPOTS_PER_PAGE } from "@/lib/publicData";
import { secretMatches } from "@/lib/secret";
import { supabaseEnv } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 한 달마다 공공데이터 자동 갱신 (035_public_data_cron.sql 의 데이터베이스 예약 작업이 불러요).
 * 로그인 대신 데이터베이스와 서버만 아는 비밀값(x-push-secret, 알림과 같은 값)으로 확인해요.
 *   ?job=spots&page=1|41|81|121|161|201   보관소를 40페이지(4천 건)씩 나눠서 (예약 작업이 몇 분 간격으로 하나씩 불러요)
 *   ?job=hazards&offset=2|1|0   사고 잦은 곳: 가장 최근 해에서 offset만큼 전 해. offset 0이 끝나면 오래된 자료 정리.
 */
const SPOT_PAGES_PER_RUN = 40;

async function rpc(name: string, args: Record<string, unknown>) {
  const { url, key } = supabaseEnv();
  const r = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`${name} ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json() as Promise<number>;
}

export async function POST(req: NextRequest) {
  const secret = process.env.PUSH_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "not configured" }, { status: 503 });
  if (!secretMatches(req.headers.get("x-push-secret"), secret)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const key = dataKey();
  if (!key) return NextResponse.json({ error: "DATA_GO_KR_API_KEY missing" }, { status: 503 });

  const job = req.nextUrl.searchParams.get("job");
  const started = Date.now();
  try {
    if (job === "spots") {
      let page = Math.max(1, Number(req.nextUrl.searchParams.get("page")) || 1);
      let imported = 0;
      let lastPage = Infinity;
      const end = page + SPOT_PAGES_PER_RUN;
      // 8페이지씩, 맡은 40페이지까지 (시간이 모자라면 거기서 멈춰요. 다음 달에 다시 채워져요)
      while (page < end && page <= lastPage && Date.now() - started < 45000) {
        const { total, rows } = await fetchSpotRows(key, page, Math.min(8, end - page));
        lastPage = Math.ceil(total / SPOTS_PER_PAGE);
        for (let i = 0; i < rows.length; i += 400) imported += await rpc("cron_import_bike_spots", { p_secret: secret, p_rows: rows.slice(i, i + 400) });
        page += 8;
      }
      return NextResponse.json({ job, imported, stoppedAt: Math.min(page, end) });
    }

    if (job === "hazards") {
      const offset = Math.min(HAZARD_YEARS - 1, Math.max(0, Number(req.nextUrl.searchParams.get("offset")) || 0));
      const latest = await latestHazardYear(key);
      const year = latest - offset;
      let from: number | null = 0;
      let imported = 0;
      while (from !== null) {
        const r = await fetchHazardRows(key, year, from, 60);
        imported += await rpc("cron_import_bike_hazards", { p_secret: secret, p_year: year, p_rows: r.rows, p_reset: offset === 0 && r.next === null });
        from = r.next;
      }
      return NextResponse.json({ job, year, imported });
    }
    return NextResponse.json({ error: "unknown job" }, { status: 400 });
  } catch (e) {
    console.error(e);
    // 오류 알림으로도 남겨요
    await rpc("report_app_error", { p_source: "server", p_message: `공공데이터 자동 갱신 실패(${job}): ${e instanceof Error ? e.message : String(e)}`.slice(0, 500), p_path: "/api/cron/public-data", p_stack: null, p_user_agent: null }).catch(() => {});
    return NextResponse.json({ error: "failed" }, { status: 502 });
  }
}
