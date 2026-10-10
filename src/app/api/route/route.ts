import { after, NextResponse } from "next/server";
import type { NavRoute, NavStep } from "@/lib/nav";
import { rateLimiter } from "@/lib/rateLimit";
import { bumpUsage } from "@/lib/usage";

/**
 * 자전거 길찾기: 오픈스트리트맵 자전거 길찾기 서버(OSRM, routing.openstreetmap.de)에 물어봐요.
 * 키가 필요 없는 공개 서버라 1분에 20번까지만 (길 안내 중 다시 찾기 포함하면 충분해요).
 */
const tooMany = rateLimiter(20, 60_000);
const OSRM = "https://routing.openstreetmap.de/routed-bike/route/v1/driving";

const parse = (s: string | null) => {
  const [lat, lng] = (s ?? "").split(",").map(Number);
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= 33 && lat <= 39 && lng >= 124 && lng <= 132 ? { lat, lng } : null;
};

type OsrmStep = { name?: string; maneuver: { type: string; modifier?: string; location: [number, number]; exit?: number } };
type OsrmRoute = { distance: number; duration: number; geometry: { coordinates: [number, number][] }; legs: { steps: OsrmStep[] }[] };

export async function GET(req: Request) {
  if (tooMany(req)) return NextResponse.json({ error: "잠시 후 다시 시도해 주세요." }, { status: 429 });
  const url = new URL(req.url);
  const from = parse(url.searchParams.get("from"));
  const to = parse(url.searchParams.get("to"));
  if (!from || !to) return NextResponse.json({ error: "출발지와 도착지를 국내 위치로 골라 주세요." }, { status: 400 });

  after(() => bumpUsage("routing"));
  const q = `${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&steps=true&alternatives=false`;
  try {
    const r = await fetch(`${OSRM}/${q}`, {
      signal: AbortSignal.timeout(12000),
      headers: { "user-agent": "B-LOCK bike app (https://b-lock-app.vercel.app)" },
      next: { revalidate: 600 },
    });
    const j = (await r.json()) as { code?: string; routes?: OsrmRoute[] };
    const route = j.routes?.[0];
    if (j.code === "NoRoute" || !route) return NextResponse.json({ error: "자전거로 갈 수 있는 길을 찾지 못했어요. 도착지를 조금 옮겨 보세요." }, { status: 404 });
    if (j.code !== "Ok") throw new Error(j.code);
    const steps: NavStep[] = route.legs.flatMap((l) =>
      l.steps.map((s) => ({
        lat: s.maneuver.location[1],
        lng: s.maneuver.location[0],
        type: s.maneuver.type,
        modifier: s.maneuver.modifier ?? null,
        name: (s.name ?? "").slice(0, 60),
        exit: s.maneuver.exit ?? null,
      })),
    );
    const out: NavRoute = {
      distance: route.distance,
      duration: route.duration,
      path: route.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })),
      steps,
    };
    return NextResponse.json(out);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "길찾기 서버가 응답하지 않아요. 잠시 후 다시 시도해 주세요." }, { status: 502 });
  }
}
