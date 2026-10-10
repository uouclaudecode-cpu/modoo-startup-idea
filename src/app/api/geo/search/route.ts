import { NextResponse } from "next/server";
import { rateLimiter } from "@/lib/rateLimit";

/**
 * 장소 검색: 오픈스트리트맵 검색(Nominatim)에 물어봐요. 키가 필요 없지만 1초에 1번 정도로 아껴 써야 해서
 * 1분에 15번까지, 같은 검색어는 하루 동안 저장해 둔 결과를 써요.
 */
const tooMany = rateLimiter(15, 60_000);

export type PlaceResult = { name: string; address: string; lat: number; lng: number };

type NominatimItem = { lat: string; lon: string; name?: string; display_name: string };

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 80);
  if (q.length < 2) return NextResponse.json({ results: [] });
  if (tooMany(req)) return NextResponse.json({ error: "검색을 너무 자주 했어요. 잠시 후 다시 시도해 주세요." }, { status: 429 });
  const lat = Number(url.searchParams.get("lat")), lng = Number(url.searchParams.get("lng"));

  const n = new URL("https://nominatim.openstreetmap.org/search");
  n.searchParams.set("q", q);
  n.searchParams.set("format", "jsonv2");
  n.searchParams.set("limit", "8");
  n.searchParams.set("countrycodes", "kr");
  n.searchParams.set("accept-language", "ko");
  // 내 주변(약 30km)을 먼저 보여 주기 (밖의 결과도 나와요)
  if (Number.isFinite(lat) && Number.isFinite(lng) && lat && lng) {
    const d = 0.3;
    n.searchParams.set("viewbox", `${(lng - d).toFixed(4)},${(lat + d).toFixed(4)},${(lng + d).toFixed(4)},${(lat - d).toFixed(4)}`);
  }
  try {
    const r = await fetch(n, {
      signal: AbortSignal.timeout(8000),
      headers: { "user-agent": "B-LOCK bike app (https://b-lock-app.vercel.app)" },
      next: { revalidate: 86400 },
    });
    if (!r.ok) throw new Error(String(r.status));
    const items = (await r.json()) as NominatimItem[];
    const results: PlaceResult[] = items.map((it) => {
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
    return NextResponse.json({ results });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "검색 서버가 응답하지 않아요. 지도를 눌러 도착지를 골라 주세요." }, { status: 502 });
  }
}
