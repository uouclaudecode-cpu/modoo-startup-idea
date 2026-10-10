import { NextResponse } from "next/server";
import { distance } from "@/lib/ride/geo";
import { SGG_CODES } from "@/lib/sggCodes";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

const ENDPOINT = "https://apis.data.go.kr/B552061/frequentzoneBicycle/getRestFrequentzoneBicycle";
const PER_CALL = 30; // 한 번에 처리할 시·군·구 수

type Item = {
  spot_cd?: string;
  spot_nm?: string;
  sido_sgg_nm?: string;
  occrrnc_cnt?: number;
  caslt_cnt?: number;
  dth_dnv_cnt?: number;
  se_dnv_cnt?: number;
  sl_dnv_cnt?: number;
  wnd_dnv_cnt?: number;
  geom_json?: string;
  la_crd?: string;
  lo_crd?: string;
};

/** 한 시·군·구의 사고 잦은 곳. 자료가 없으면 빈 목록 (resultCode 03) */
async function fetchArea(key: string, year: number, code: string): Promise<Item[]> {
  const u = new URL(ENDPOINT);
  u.searchParams.set("serviceKey", key.includes("%") ? decodeURIComponent(key) : key);
  u.searchParams.set("searchYearCd", String(year));
  u.searchParams.set("siDo", code.slice(0, 2));
  u.searchParams.set("guGun", code.slice(2));
  u.searchParams.set("type", "json");
  u.searchParams.set("numOfRows", "100");
  u.searchParams.set("pageNo", "1");
  const r = await fetch(u, { cache: "no-store", signal: AbortSignal.timeout(20000) });
  const text = await r.text();
  let j: { resultCode?: string; resultMsg?: string; items?: { item?: Item[] | Item } };
  try {
    j = JSON.parse(text);
  } catch {
    throw new Error(text.includes("SERVICE_KEY") ? "인증키가 아직 등록되지 않았거나, 이 데이터를 활용신청하지 않았어요." : "공공데이터 서버가 응답하지 않아요. 잠시 후 다시 시도해 주세요.");
  }
  if (j.resultCode === "03") return [];
  if (j.resultCode && j.resultCode !== "00") throw new Error(`공공데이터 오류: ${j.resultMsg ?? j.resultCode}`);
  const raw = j.items?.item;
  return Array.isArray(raw) ? raw : raw ? [raw] : [];
}

/** 다발지역 원의 반지름: 경계 꼭짓점 중 가장 먼 곳까지 (보통 100m 안팎) */
function radiusOf(it: Item, lat: number, lng: number) {
  try {
    const g = JSON.parse(it.geom_json ?? "") as { coordinates?: number[][][] };
    const ring = g.coordinates?.[0] ?? [];
    const r = Math.max(0, ...ring.map(([x, y]) => distance({ lat, lng }, { lat: y, lng: x })));
    return r > 0 ? Math.round(r) : 100;
  } catch {
    return 100;
  }
}

function toRow(it: Item) {
  const lat = Number(it.la_crd), lng = Number(it.lo_crd);
  if (!it.spot_cd || !it.spot_nm || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    spot_cd: it.spot_cd,
    name: it.spot_nm,
    area_name: it.sido_sgg_nm?.replace(/\d+$/, "") ?? null,
    lat,
    lng,
    radius_m: radiusOf(it, lat, lng),
    accidents: Number(it.occrrnc_cnt ?? 0),
    casualties: Number(it.caslt_cnt ?? 0),
    deaths: Number(it.dth_dnv_cnt ?? 0),
    serious: Number(it.se_dnv_cnt ?? 0),
    minor: Number(it.sl_dnv_cnt ?? 0),
    injured: Number(it.wnd_dnv_cnt ?? 0),
  };
}

/**
 * 관리자: 도로교통공단 자전거사고 다발지역을 시·군·구 30곳씩 불러와요.
 * 화면(/admin/spots)이 next가 null이 될 때까지 여러 번 불러요.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  const { data: me } = await supabase.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
  if (!me?.is_admin) return NextResponse.json({ error: "관리자만 할 수 있어요." }, { status: 403 });

  const key = process.env.DATA_GO_KR_API_KEY?.trim();
  if (!key) return NextResponse.json({ error: "공공데이터 인증키(DATA_GO_KR_API_KEY)가 아직 설정되지 않았어요." }, { status: 500 });

  const body = (await req.json().catch(() => ({}))) as { year?: number; from?: number };
  const year = Math.floor(Number(body.year));
  if (!(year >= 2010 && year <= new Date().getFullYear())) return NextResponse.json({ error: "연도를 확인해 주세요." }, { status: 400 });
  const from = Math.max(0, Math.floor(Number(body.from) || 0));
  const codes = SGG_CODES.slice(from, from + PER_CALL);

  try {
    const items: Item[] = [];
    // 공공데이터 서버에 한꺼번에 몰리지 않게 6곳씩
    for (let i = 0; i < codes.length; i += 6) {
      const got = await Promise.all(codes.slice(i, i + 6).map(([c]) => fetchArea(key, year, c)));
      items.push(...got.flat());
    }
    const rows = items.map(toRow).filter((r): r is NonNullable<typeof r> => r !== null);
    const end = from + codes.length;
    // 마지막 묶음에서, 이 해 자료가 들어왔으면 예전 해 자료를 지워요 (자료가 없는 해를 골라도 예전 자료는 남아요)
    const { data, error } = await supabase.rpc("import_bike_hazards", { p_year: year, p_rows: rows, p_reset: end >= SGG_CODES.length });
    if (error) {
      console.error(error);
      return NextResponse.json({ error: /[가-힣]/.test(error.message) ? error.message : "데이터베이스에 넣지 못했어요. 031 설정을 실행했는지 확인해 주세요." }, { status: 500 });
    }
    return NextResponse.json({ imported: Number(data ?? 0), done: end, total: SGG_CODES.length, next: end < SGG_CODES.length ? end : null });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error && /[가-힣]/.test(e.message) ? e.message : "공공데이터를 불러오지 못했어요. 잠시 후 다시 시도해 주세요." }, { status: 502 });
  }
}
