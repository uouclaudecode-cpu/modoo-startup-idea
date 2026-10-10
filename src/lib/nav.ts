/**
 * 자전거 길 안내 계산 (화면과 상관없는 순수 계산)
 * 경로는 /api/route 가 OSRM(오픈스트리트맵 자전거 길찾기)에서 받아 와요.
 */
import { distance, type LatLng } from "./ride/geo";

export type NavStep = LatLng & {
  /** depart | turn | new name | continue | merge | fork | end of road | roundabout | rotary | arrive ... */
  type: string;
  /** left | right | slight left | slight right | sharp left | sharp right | straight | uturn */
  modifier: string | null;
  /** 들어서는 길 이름 */
  name: string;
  /** 회전교차로 몇 번째 출구 */
  exit: number | null;
};

export type NavRoute = {
  /** m */
  distance: number;
  /** 초 (자전거 기준 예상) */
  duration: number;
  path: LatLng[];
  steps: NavStep[];
};

/** 경로 위 각 점까지의 누적 거리 */
export function cumulative(path: LatLng[]) {
  const out = [0];
  for (let i = 1; i < path.length; i++) out.push(out[i - 1] + distance(path[i - 1], path[i]));
  return out;
}

/** 점 p를 선분 a-b에 내린 위치 (0~1)와 거리. 짧은 거리라 평면으로 계산해요. */
function projectOnSegment(p: LatLng, a: LatLng, b: LatLng) {
  const k = Math.cos((p.lat * Math.PI) / 180);
  const ax = a.lng * k, ay = a.lat, bx = b.lng * k, by = b.lat, px = p.lng * k, py = p.lat;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
  const q = { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
  return { t, point: q, dist: distance(p, q) };
}

export type Progress = {
  /** 경로에서 떨어진 거리 (m) */
  offRoute: number;
  /** 지나온 선분 번호 */
  index: number;
  /** 출발점부터 경로를 따라 온 거리 (m) */
  along: number;
  /** 도착까지 남은 거리 (m) */
  remaining: number;
};

/**
 * 지금 위치가 경로의 어디쯤인지. hint(지난번 선분 번호) 근처부터 찾아서 빨라요.
 * 경로가 겹치는 곳(되돌아오는 길)에서 뒤로 튀지 않게 앞쪽 선분을 조금 더 쳐 줘요.
 */
export function progressOn(path: LatLng[], cum: number[], p: LatLng, hint = 0): Progress {
  if (path.length < 2) return { offRoute: path[0] ? distance(p, path[0]) : 0, index: 0, along: 0, remaining: 0 };
  const total = cum[cum.length - 1];
  const from = Math.max(0, hint - 5);
  let best = { i: from, t: 0, dist: Infinity, score: Infinity };
  for (let i = from; i < path.length - 1; i++) {
    const r = projectOnSegment(p, path[i], path[i + 1]);
    // 뒤쪽(지나온) 선분은 살짝 불리하게
    const score = r.dist + (i < hint ? 15 : 0);
    if (score < best.score) best = { i, t: r.t, dist: r.dist, score };
    // 이미 아주 가깝고 멀어지기 시작하면 그만
    if (best.dist < 8 && r.dist > best.dist + 150) break;
  }
  const along = cum[best.i] + (cum[best.i + 1] - cum[best.i]) * best.t;
  return { offRoute: best.dist, index: best.i, along, remaining: Math.max(0, total - along) };
}

/** 안내 지점(꺾는 곳)마다 경로 위 누적 거리 */
export function stepPositions(path: LatLng[], cum: number[], steps: NavStep[]) {
  let hint = 0;
  return steps.map((s) => {
    const pr = progressOn(path, cum, s, hint);
    hint = pr.index;
    return pr.along;
  });
}

const TURN: Record<string, string> = {
  left: "왼쪽으로 도세요",
  right: "오른쪽으로 도세요",
  "slight left": "왼쪽 방향으로 가세요",
  "slight right": "오른쪽 방향으로 가세요",
  "sharp left": "왼쪽으로 크게 도세요",
  "sharp right": "오른쪽으로 크게 도세요",
  straight: "곧장 가세요",
  uturn: "돌아서 가세요",
};

/** 안내 문장 (거리는 따로 붙여요) */
export function stepText(s: NavStep) {
  const road = s.name ? `${s.name} 방향, ` : "";
  switch (s.type) {
    case "depart":
      return s.name ? `${s.name}을(를) 따라 출발하세요` : "출발하세요";
    case "arrive":
      return "목적지에 도착해요";
    case "roundabout":
    case "rotary":
    case "roundabout turn":
      return s.exit ? `회전교차로에서 ${s.exit}번째 길로 나가세요` : "회전교차로를 지나가세요";
    case "fork":
      return `갈림길에서 ${s.modifier?.includes("left") ? "왼쪽" : s.modifier?.includes("right") ? "오른쪽" : "가운데"} 길로 가세요`;
    case "end of road":
      return `길 끝에서 ${TURN[s.modifier ?? ""] ?? "길을 따라가세요"}${s.name ? ` (${s.name})` : ""}`;
    case "continue":
    case "new name":
      if (!s.modifier || s.modifier === "straight") return s.name ? `${s.name} 방향으로 곧장 가세요` : "곧장 가세요";
      return `${road}${TURN[s.modifier] ?? "길을 따라가세요"}`;
    default:
      return `${road}${TURN[s.modifier ?? ""] ?? "길을 따라가세요"}`;
  }
}

/** 화살표 기호 종류 */
export function stepArrow(s: NavStep): "left" | "right" | "slight-left" | "slight-right" | "straight" | "uturn" | "roundabout" | "arrive" {
  if (s.type === "arrive") return "arrive";
  if (s.type.includes("roundabout") || s.type === "rotary") return "roundabout";
  switch (s.modifier) {
    case "left":
    case "sharp left":
      return "left";
    case "right":
    case "sharp right":
      return "right";
    case "slight left":
      return "slight-left";
    case "slight right":
      return "slight-right";
    case "uturn":
      return "uturn";
    default:
      return "straight";
  }
}

/** 안내할 필요가 없는 지점 (출발, 이름만 바뀌는 직진) */
export function isQuiet(s: NavStep) {
  return s.type === "depart" || ((s.type === "new name" || s.type === "continue") && (!s.modifier || s.modifier === "straight"));
}

export function formatMeters(m: number) {
  if (m < 50) return "곧";
  if (m < 1000) return `${Math.round(m / 10) * 10}m`;
  return `${(m / 1000).toFixed(m < 10000 ? 1 : 0)}km`;
}

export function formatDuration(sec: number) {
  const min = Math.max(1, Math.round(sec / 60));
  if (min < 60) return `${min}분`;
  return `${Math.floor(min / 60)}시간 ${min % 60 ? `${min % 60}분` : ""}`.trim();
}
