import { NextResponse } from "next/server";
import { distance } from "@/lib/ride/geo";
import { rateLimiter } from "@/lib/rateLimit";

/**
 * 장소 검색 (길 안내 도착지).
 * 1) 카카오 로컬(키워드 → 주소): KAKAO_REST_API_KEY가 있으면 써요. 내 주변 20km 안을 먼저, 없으면 전국에서 찾아요.
 *    카카오 정책상 결과는 저장하지 않고 매번 새로 불러요. (네이버 지도 위에 표시하는 것은 허용돼요)
 * 2) 키가 없거나 카카오가 실패하면 오픈스트리트맵 검색(Nominatim)으로 대신해요. (같은 검색어는 하루 동안 저장)
 * 같은 곳(IP)에서 1분에 20번까지.
 */
const tooMany = rateLimiter(20, 60_000);

export type PlaceResult = { name: string; address: string; lat: number; lng: number; category?: string };

type KakaoPlace = { place_name: string; road_address_name: string; address_name: string; x: string; y: string; category_group_name?: string; category_name?: string };
type KakaoAddress = { address_name: string; x: string; y: string; road_address?: { address_name: string; building_name?: string } | null };

async function kakao(path: string, params: Record<string, string>, key: string) {
  const u = new URL(`https://dapi.kakao.com/v2/local/search/${path}.json`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  // 카카오 정책: 결과를 서버에 저장하면 안 돼서 매번 새로 불러요 (cache: no-store)
  const r = await fetch(u, { headers: { Authorization: `KakaoAK ${key}` }, signal: AbortSignal.timeout(6000), cache: "no-store" });
  if (!r.ok) throw new Error(`kakao ${r.status}`);
  return (await r.json()) as { documents: unknown[] };
}

async function searchKakao(q: string, at: { lat: number; lng: number } | null, key: string): Promise<PlaceResult[]> {
  const near: Record<string, string> = at ? { x: String(at.lng), y: String(at.lat), radius: "20000" } : {};
  // 내 주변에서 먼저 (정확도 순), 없으면 전국
  let places = (await kakao("keyword", { query: q, size: "15", sort: "accuracy", ...near }, key)).documents as KakaoPlace[];
  if (places.length === 0 && at) places = (await kakao("keyword", { query: q, size: "15", sort: "accuracy" }, key)).documents as KakaoPlace[];
  const out: PlaceResult[] = places.map((p) => ({
    name: p.place_name,
    address: p.road_address_name || p.address_name,
    lat: Number(p.y),
    lng: Number(p.x),
    category: p.category_group_name || p.category_name?.split(">").pop()?.trim() || undefined,
  }));
  // 장소 이름으로 못 찾으면 주소로
  if (out.length === 0) {
    const addrs = (await kakao("address", { query: q, size: "10" }, key)).documents as KakaoAddress[];
    for (const a of addrs) {
      out.push({ name: a.road_address?.building_name || a.road_address?.address_name || a.address_name, address: a.road_address?.address_name || a.address_name, lat: Number(a.y), lng: Number(a.x) });
    }
  }
  return out.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
}

type NominatimItem = { lat: string; lon: string; name?: string; display_name: string };

async function searchOsm(q: string, at: { lat: number; lng: number } | null): Promise<PlaceResult[]> {
  const n = new URL("https://nominatim.openstreetmap.org/search");
  n.searchParams.set("q", q);
  n.searchParams.set("format", "jsonv2");
  n.searchParams.set("limit", "8");
  n.searchParams.set("countrycodes", "kr");
  n.searchParams.set("accept-language", "ko");
  // 내 주변(약 30km)을 먼저 보여 주기 (밖의 결과도 나와요)
  if (at) {
    const d = 0.3;
    n.searchParams.set("viewbox", `${(at.lng - d).toFixed(4)},${(at.lat + d).toFixed(4)},${(at.lng + d).toFixed(4)},${(at.lat - d).toFixed(4)}`);
  }
  const r = await fetch(n, {
    signal: AbortSignal.timeout(8000),
    headers: { "user-agent": "B-LOCK bike app (https://b-lock-app.vercel.app)" },
    next: { revalidate: 86400 },
  });
  if (!r.ok) throw new Error(String(r.status));
  const items = (await r.json()) as NominatimItem[];
  const out = items.map((it) => {
    const parts = it.display_name.split(",").map((s) => s.trim());
    return {
      name: it.name || parts[0],
      // 대한민국·우편번호는 빼고, 큰 지역부터 읽기 쉽게
      address: parts
        .slice(1)
        .filter((s) => s !== "대한민국" && !/^\d{5}$/.test(s))
        .reverse()
        .join(" "),
      lat: Number(it.lat),
      lng: Number(it.lon),
    };
  });
  return at ? out.sort((a, b) => distance(at, a) - distance(at, b)) : out;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 80);
  if (q.length < 2) return NextResponse.json({ results: [] });
  if (tooMany(req)) return NextResponse.json({ error: "검색을 너무 자주 했어요. 잠시 후 다시 시도해 주세요." }, { status: 429 });
  const lat = Number(url.searchParams.get("lat")), lng = Number(url.searchParams.get("lng"));
  const at = Number.isFinite(lat) && Number.isFinite(lng) && lat >= 33 && lat <= 39 && lng >= 124 && lng <= 132 ? { lat, lng } : null;

  const key = process.env.KAKAO_REST_API_KEY?.trim();
  if (key) {
    try {
      return NextResponse.json({ results: await searchKakao(q, at, key), source: "kakao" });
    } catch (e) {
      // 카카오가 안 되면 아래 오픈스트리트맵 검색으로 대신해요
      console.error(e);
    }
  }
  try {
    return NextResponse.json({ results: await searchOsm(q, at), source: "osm" });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "검색 서버가 응답하지 않아요. 지도를 눌러 도착지를 골라 주세요." }, { status: 502 });
  }
}
