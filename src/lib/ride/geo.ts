/**
 * 라이딩 거리 계산과 GPS 걸러내기.
 * 화면과 상관없는 순수 계산이라 따로 두었어요. (단위: 미터, 초, km/h)
 */

export type LatLng = { lat: number; lng: number };

export type Fix = LatLng & {
  /** 위치 정확도 반경 (m) */
  accuracy: number;
  /** 측정 시각 (ms) */
  t: number;
  /** 기기가 알려준 속도 (m/s), 없으면 null */
  speed: number | null;
};

const R = 6371008.8; // 지구 평균 반지름 (m)
const rad = (d: number) => (d * Math.PI) / 180;

/** 두 지점 사이 거리 (하버사인, m) */
export function distance(a: LatLng, b: LatLng) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** 걸러내기 기준값 */
export const FILTER = {
  /** 정확도가 이보다 나쁜(반경이 큰) 위치는 버림 */
  maxAccuracy: 35,
  /** 자전거·킥보드로 불가능한 순간 속도 → GPS 튐으로 보고 버림 */
  maxSpeedKmh: 65,
  /** 이 속도보다 느리면 '멈춤'으로 보고 거리·이동 시간에 넣지 않음 (신호 대기 떨림 방지) */
  stopSpeedKmh: 2.5,
  /** 한 번에 이만큼 이상 움직여야 이동으로 인정 (제자리 떨림 방지) */
  minStep: 4,
} as const;

export type StepResult =
  | { kind: "first" }
  | { kind: "reject"; reason: "accuracy" | "jump" | "stale" }
  /** 너무 조금 움직임: 위치는 갱신하지 않고 기다림 */
  | { kind: "hold"; stopped: boolean }
  | { kind: "move"; meters: number; seconds: number; speedKmh: number; moving: boolean };

/**
 * 새 GPS 위치를 마지막으로 인정한 위치와 비교해 판단합니다.
 * - 정확도가 나쁘면 버림
 * - 불가능하게 빠르면(튐) 버림
 * - 정확도 반경 안에서 맴돌면(정차 중 떨림) 거리에 넣지 않음
 */
export function evaluateFix(last: Fix | null, next: Fix): StepResult {
  if (next.accuracy > FILTER.maxAccuracy) return { kind: "reject", reason: "accuracy" };
  if (!last) return { kind: "first" };
  const seconds = (next.t - last.t) / 1000;
  if (seconds <= 0) return { kind: "reject", reason: "stale" };

  const meters = distance(last, next);
  const speedKmh = (meters / seconds) * 3.6;
  if (speedKmh > FILTER.maxSpeedKmh) return { kind: "reject", reason: "jump" };

  // 움직임으로 인정하려면 고정 최소값과 두 위치 정확도 평균의 75%보다 멀리 가야 해요.
  // (정확도 10m면 7.5m 이상) 그보다 짧으면 위치를 그대로 두고, 쌓여서 넘으면 한 번에 더해요.
  const avgAccuracy = (last.accuracy + next.accuracy) / 2;
  const threshold = Math.max(FILTER.minStep, avgAccuracy * 0.75);
  const deviceSpeedKmh = next.speed != null && next.speed >= 0 ? next.speed * 3.6 : null;
  if (meters < threshold) {
    const stopped = (deviceSpeedKmh ?? speedKmh) < FILTER.stopSpeedKmh;
    return { kind: "hold", stopped };
  }
  // 기기는 '멈춰 있다'고 하는데 정확도 범위 근처로 튄 경우 → 정차 중 떨림
  if (deviceSpeedKmh != null && deviceSpeedKmh < FILTER.stopSpeedKmh && meters < avgAccuracy * 1.5) {
    return { kind: "hold", stopped: true };
  }
  const moving = speedKmh >= FILTER.stopSpeedKmh;
  return { kind: "move", meters, seconds, speedKmh, moving };
}

/** 지점에서 선분까지의 거리 (m, 짧은 거리라 평면 근사) */
function segmentDistance(p: LatLng, a: LatLng, b: LatLng) {
  const k = Math.cos(rad((a.lat + b.lat) / 2));
  const ax = a.lng * k, ay = a.lat, bx = b.lng * k, by = b.lat, px = p.lng * k, py = p.lat;
  const dx = bx - ax, dy = by - ay;
  const len = dx * dx + dy * dy;
  const tt = len === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len));
  const cx = ax + tt * dx, cy = ay + tt * dy;
  return distance({ lat: py, lng: px / k }, { lat: cy, lng: cx / k });
}

/**
 * 경로 줄이기 (더글러스-포이커). 모양은 그대로 두고 점 개수를 줄여서 저장 용량을 아껴요.
 * tolerance 미터 안쪽으로 벗어나는 점은 빼고, 그래도 많으면 기준을 키워 maxPoints 이하로 맞춥니다.
 */
export function simplify(points: LatLng[], tolerance = 4, maxPoints = 3000): LatLng[] {
  if (points.length <= 2) return points.slice();
  let tol = tolerance;
  let out = douglasPeucker(points, tol);
  while (out.length > maxPoints) {
    tol *= 1.6;
    out = douglasPeucker(points, tol);
  }
  return out;
}

function douglasPeucker(points: LatLng[], tol: number): LatLng[] {
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    let maxD = 0, idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = segmentDistance(points[i], points[s], points[e]);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (idx !== -1 && maxD > tol) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/** 저장용: [[위도, 경도], ...] 소수 6자리(약 10cm) */
export function toPathJson(points: LatLng[]): [number, number][] {
  return points.map((p) => [Math.round(p.lat * 1e6) / 1e6, Math.round(p.lng * 1e6) / 1e6]);
}

export function fromPathJson(raw: unknown): LatLng[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((p): p is [number, number] => Array.isArray(p) && typeof p[0] === "number" && typeof p[1] === "number")
    .map(([lat, lng]) => ({ lat, lng }));
}

/** 12.3 km / 850 m */
export function formatDistance(meters: number) {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(meters < 100000 ? 2 : 1)} km`;
}

/** 1:05:09 / 12:03 */
export function formatDuration(totalSec: number) {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${p(m)}:${p(sec)}` : `${p(m)}:${p(sec)}`;
}

/** 이동 시간 기준 평균 속도 (km/h) */
export function averageSpeed(meters: number, movingSec: number) {
  return movingSec > 0 ? (meters / movingSec) * 3.6 : 0;
}

/** 최고 속도용 기록: (측정 시각, 그때까지 누적 거리) */
export type SpeedSample = { t: number; d: number };

/**
 * 최근 windowSec초(기본 8초) 동안의 평균 속도 (km/h). 1초 단위 위치 오차로 순간 속도가 튀는 것을 막아요.
 * 아직 windowSec초만큼 쌓이지 않았으면 null.
 */
export function windowSpeedKmh(history: SpeedSample[], t: number, d: number, windowSec = 8): number | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const h = history[i];
    const span = (t - h.t) / 1000;
    if (span >= windowSec) return span > 0 ? ((d - h.d) / span) * 3.6 : null;
  }
  return null;
}
