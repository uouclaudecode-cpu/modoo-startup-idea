/**
 * 공공데이터포털 불러오기 (서버에서만): 관리자 버튼(/admin/spots)과 한 달마다 자동 갱신(/api/cron/public-data)이 함께 써요.
 * - 행정안전부 자전거보관소정보 (공기주입기·수리대 포함)
 * - 도로교통공단 자전거사고 다발지역 (시·군·구마다 따로 불러와요)
 */
import { distance } from "./ride/geo";
import { SGG_CODES } from "./sggCodes";
import { toSpotRow, type PublicParkingItem } from "./spots";

const SPOTS_ENDPOINT = "https://apis.data.go.kr/1741000/bicycle_parking_info/info";
const HAZARD_ENDPOINT = "https://apis.data.go.kr/B552061/frequentzoneBicycle/getRestFrequentzoneBicycle";
export const SPOTS_PER_PAGE = 100; // 이 서비스의 한 번 최대
/** 사고 잦은 곳은 최근 몇 해를 함께 보여 줄지 */
export const HAZARD_YEARS = 3;

export function dataKey() {
  return process.env.DATA_GO_KR_API_KEY?.trim() || null;
}

/** Encoding 키(%가 들어간 키)를 넣었어도 두 번 바뀌지 않게 풀어서 넣어요 */
const keyParam = (key: string) => (key.includes("%") ? decodeURIComponent(key) : key);

type SpotsBody = { totalCount?: number; items?: { item?: PublicParkingItem[] | PublicParkingItem } | "" };

/** 보관소 한 페이지 (100건) */
export async function fetchSpotsPage(key: string, page: number) {
  const u = new URL(SPOTS_ENDPOINT);
  u.searchParams.set("serviceKey", keyParam(key));
  u.searchParams.set("pageNo", String(page));
  u.searchParams.set("numOfRows", String(SPOTS_PER_PAGE));
  u.searchParams.set("returnType", "json");
  const r = await fetch(u, { cache: "no-store", signal: AbortSignal.timeout(20000) });
  const text = await r.text();
  let json: { response?: { header?: { resultCode?: string; resultMsg?: string }; body?: SpotsBody } };
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(text.includes("SERVICE_KEY") ? "인증키가 아직 등록되지 않았거나 틀렸어요." : "공공데이터 서버가 응답하지 않아요. 잠시 후 다시 시도해 주세요.");
  }
  const code = json.response?.header?.resultCode;
  if (code && code !== "0" && code !== "00") throw new Error(`공공데이터 오류: ${json.response?.header?.resultMsg ?? code}`);
  const body = json.response?.body ?? {};
  const raw = body.items && typeof body.items === "object" ? body.items.item : [];
  const items = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return { total: Number(body.totalCount ?? 0), items };
}

/** 보관소 여러 페이지를 받아 데이터베이스에 넣을 행으로 */
export async function fetchSpotRows(key: string, start: number, pages: number) {
  const got = await Promise.all(Array.from({ length: pages }, (_, i) => fetchSpotsPage(key, start + i)));
  const raw = got.flatMap((p) => p.items);
  const rows = raw.map(toSpotRow).filter((r): r is NonNullable<typeof r> => r !== null);
  return { total: got[0]?.total ?? 0, rows, skipped: raw.length - rows.length };
}

type HazardItem = {
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
async function fetchHazardArea(key: string, year: number, code: string): Promise<HazardItem[]> {
  const u = new URL(HAZARD_ENDPOINT);
  u.searchParams.set("serviceKey", keyParam(key));
  u.searchParams.set("searchYearCd", String(year));
  u.searchParams.set("siDo", code.slice(0, 2));
  u.searchParams.set("guGun", code.slice(2));
  u.searchParams.set("type", "json");
  u.searchParams.set("numOfRows", "100");
  u.searchParams.set("pageNo", "1");
  const r = await fetch(u, { cache: "no-store", signal: AbortSignal.timeout(20000) });
  const text = await r.text();
  let j: { resultCode?: string; resultMsg?: string; items?: { item?: HazardItem[] | HazardItem } };
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
function radiusOf(it: HazardItem, lat: number, lng: number) {
  try {
    const g = JSON.parse(it.geom_json ?? "") as { coordinates?: number[][][] };
    const ring = g.coordinates?.[0] ?? [];
    const r = Math.max(0, ...ring.map(([x, y]) => distance({ lat, lng }, { lat: y, lng: x })));
    return r > 0 ? Math.round(r) : 100;
  } catch {
    return 100;
  }
}

function toHazardRow(it: HazardItem) {
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

/** 시·군·구 목록의 from부터 count곳을 불러와 데이터베이스에 넣을 행으로 (서버에 몰리지 않게 6곳씩) */
export async function fetchHazardRows(key: string, year: number, from: number, count: number) {
  const codes = SGG_CODES.slice(from, from + count);
  const items: HazardItem[] = [];
  for (let i = 0; i < codes.length; i += 6) {
    const got = await Promise.all(codes.slice(i, i + 6).map(([c]) => fetchHazardArea(key, year, c)));
    items.push(...got.flat());
  }
  const rows = items.map(toHazardRow).filter((r): r is NonNullable<typeof r> => r !== null);
  const end = from + codes.length;
  return { rows, done: end, total: SGG_CODES.length, next: end < SGG_CODES.length ? end : null };
}

/** 자료가 올라온 가장 최근 해: 지난해 자료가 아직 없으면 그 전 해 (서울 강남구로 확인) */
export async function latestHazardYear(key: string) {
  const y = new Date().getFullYear() - 1;
  return (await fetchHazardArea(key, y, "11680")).length > 0 ? y : y - 1;
}
