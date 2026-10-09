/**
 * 라이딩 기록 내보내기·요약 도구: GPX 파일, 집 근처 가리기, 고도(오르막) 계산.
 * 저장된 경로에는 시각이 없어서, GPX 시각은 시작~끝 시각을 거리 비율로 나눠 넣어요.
 */
import { distance, type LatLng } from "./geo";

/** 경로 앞뒤를 m만큼 잘라요 (공유할 때 집·회사 위치가 드러나지 않게) */
export function trimEnds(path: LatLng[], meters = 300): LatLng[] {
  if (path.length < 2) return [];
  if (meters <= 0) return path;
  const cut = (pts: LatLng[]) => {
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      acc += distance(pts[i - 1], pts[i]);
      if (acc >= meters) return pts.slice(i);
    }
    return [];
  };
  const head = cut(path);
  return cut([...head].reverse()).reverse();
}

export type Zone = { lat: number; lng: number; radius_m: number };

/**
 * 공유용 경로: 앞뒤 300m를 자르고, 가림 장소(집·회사 등) 원 안의 점을 빼요.
 * 빠진 곳에서 선이 끊기도록 여러 토막으로 돌려줘요. (2점 미만 토막은 버려요)
 */
export function shareSegments(path: LatLng[], zones: Zone[], endsMeters = 300): LatLng[][] {
  const out: LatLng[][] = [];
  let cur: LatLng[] = [];
  for (const p of trimEnds(path, endsMeters)) {
    if (zones.some((z) => distance(p, z) <= z.radius_m)) {
      if (cur.length > 1) out.push(cur);
      cur = [];
    } else cur.push(p);
  }
  if (cur.length > 1) out.push(cur);
  return out;
}

const esc = (s: string) => s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);

/** GPX 1.1 (스트라바·가민·코모트 등에서 불러올 수 있어요). 토막이 여러 개면 trkseg 를 나눠요 */
export function buildGpx({ name, path, startedAt, endedAt }: { name: string; path: LatLng[] | LatLng[][]; startedAt: string; endedAt: string }) {
  const segs: LatLng[][] = path.length > 0 && Array.isArray(path[0]) ? (path as LatLng[][]) : [path as LatLng[]];
  const all = segs.flat();
  const t0 = new Date(startedAt).getTime();
  const t1 = Math.max(new Date(endedAt).getTime(), t0);
  const acc: number[] = [0];
  for (let i = 1; i < all.length; i++) acc.push(acc[i - 1] + distance(all[i - 1], all[i]));
  const total = acc[acc.length - 1] || 1;
  let k = 0;
  const body = segs
    .map((s) => {
      const pts = s.map((p) => {
        const t = new Date(t0 + ((t1 - t0) * acc[k++]) / total).toISOString();
        return `      <trkpt lat="${p.lat.toFixed(6)}" lon="${p.lng.toFixed(6)}"><time>${t}</time></trkpt>`;
      });
      return ["    <trkseg>", ...pts, "    </trkseg>"].join("\n");
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="B-LOCK" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${esc(name)}</name><time>${new Date(t0).toISOString()}</time></metadata>
  <trk>
    <name>${esc(name)}</name>
    <type>cycling</type>
${body}
  </trk>
</gpx>
`;
}

/** 경로에서 고르게 n개 이하로 뽑기 */
export function samplePath(path: LatLng[], n = 100): LatLng[] {
  if (path.length <= n) return path;
  const out: LatLng[] = [];
  for (let i = 0; i < n; i++) out.push(path[Math.round((i * (path.length - 1)) / (n - 1))]);
  return out;
}

export type Elevation = { gain: number; min: number; max: number };

/**
 * 고도 요약 (Open-Meteo 무료 고도 API, 서버에서 불러요).
 * 실패하거나 느리면 null → 화면에서 고도 칸을 빼요.
 */
export async function fetchElevation(path: LatLng[]): Promise<Elevation | null> {
  const pts = samplePath(path, 100);
  if (pts.length < 2) return null;
  const url = `https://api.open-meteo.com/v1/elevation?latitude=${pts.map((p) => p.lat.toFixed(5)).join(",")}&longitude=${pts
    .map((p) => p.lng.toFixed(5))
    .join(",")}`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(2500), next: { revalidate: 60 * 60 * 24 * 30 } });
    if (!r.ok) return null;
    const j = (await r.json()) as { elevation?: number[] };
    const e = (j.elevation ?? []).filter((x) => Number.isFinite(x));
    if (e.length < 2) return null;
    // 작은 오르내림(3m 미만)은 지도 고도 오차로 보고 빼요
    let gain = 0, base = e[0];
    for (const x of e) {
      if (x - base >= 3) {
        gain += x - base;
        base = x;
      } else if (x < base) base = x;
    }
    return { gain: Math.round(gain), min: Math.round(Math.min(...e)), max: Math.round(Math.max(...e)) };
  } catch {
    return null;
  }
}
