/**
 * 라이딩 배지. 따로 DB 표를 두지 않고, 지금까지의 라이딩 기록에서 그때그때 계산해요.
 * (기록을 지우면 배지도 따라 사라지는데, 그게 오히려 정직하다고 봤어요)
 * 순수 계산이라 서버·브라우저·테스트 어디서든 같은 결과가 나와요.
 */
import { kstHour, longestStreak } from "./stats";

/** 배지 계산에 필요한 라이딩 값 */
export type BadgeRide = { started_at: string; distance_m: number };

/** 지금까지 쌓인 기록 요약 */
export type RideTotals = {
  count: number;
  distance_m: number;
  /** 한 번에 가장 멀리 탄 거리 */
  longest_m: number;
  /** 가장 길게 이어진 연속 라이딩 일수 */
  bestStreak: number;
  /** 새벽 5~7시에 시작한 라이딩 수 */
  dawnCount: number;
  /** 저녁 8시~자정에 시작한 라이딩 수 */
  nightCount: number;
};

export function computeTotals(rides: BadgeRide[]): RideTotals {
  const t: RideTotals = { count: 0, distance_m: 0, longest_m: 0, bestStreak: 0, dawnCount: 0, nightCount: 0 };
  for (const r of rides) {
    const d = r.distance_m || 0;
    t.count += 1;
    t.distance_m += d;
    if (d > t.longest_m) t.longest_m = d;
    const h = kstHour(r.started_at);
    if (h >= 5 && h < 7) t.dawnCount += 1;
    if (h >= 20) t.nightCount += 1;
  }
  t.bestStreak = longestStreak(rides.map((r) => r.started_at));
  return t;
}

type Unit = "km" | "회" | "일";

type BadgeDef = {
  id: string;
  emoji: string;
  title: string;
  description: string;
  /** 받았을 때 함께 보여줄 안전 안내 */
  tip?: string;
  goal: number;
  unit: Unit;
  /** 목표와 비교할 현재 값 (km 배지는 km 단위) */
  value: (t: RideTotals) => number;
};

const km = (t: RideTotals) => t.distance_m / 1000;

/** 화면에 보이는 순서 그대로예요. (쉬운 것 → 어려운 것) */
export const BADGE_DEFS: BadgeDef[] = [
  { id: "first", emoji: "🚲", title: "첫 라이딩", description: "첫 라이딩을 기록했어요. 시작이 반이에요!", goal: 1, unit: "회", value: (t) => t.count },
  { id: "km10", emoji: "🌱", title: "누적 10km", description: "모두 합쳐 10km를 달렸어요.", goal: 10, unit: "km", value: km },
  { id: "km50", emoji: "🌿", title: "누적 50km", description: "모두 합쳐 50km를 달렸어요.", goal: 50, unit: "km", value: km },
  { id: "km100", emoji: "🌳", title: "누적 100km", description: "모두 합쳐 100km를 달렸어요.", goal: 100, unit: "km", value: km },
  { id: "km500", emoji: "⛰️", title: "누적 500km", description: "서울에서 부산까지 가고도 남는 거리예요.", goal: 500, unit: "km", value: km },
  { id: "km1000", emoji: "🌏", title: "누적 1,000km", description: "서울–부산을 왕복하고도 남는 거리를 달렸어요.", goal: 1000, unit: "km", value: km },
  { id: "rides10", emoji: "🎟️", title: "라이딩 10회", description: "라이딩을 10번 기록했어요.", goal: 10, unit: "회", value: (t) => t.count },
  { id: "rides50", emoji: "🏅", title: "라이딩 50회", description: "라이딩을 50번 기록했어요. 이제 생활이 됐네요!", goal: 50, unit: "회", value: (t) => t.count },
  { id: "single20", emoji: "⚡", title: "한 번에 20km", description: "한 번의 라이딩으로 20km를 달렸어요.", goal: 20, unit: "km", value: (t) => t.longest_m / 1000 },
  { id: "single50", emoji: "🚀", title: "한 번에 50km", description: "한 번의 라이딩으로 50km를 달렸어요.", goal: 50, unit: "km", value: (t) => t.longest_m / 1000 },
  { id: "streak3", emoji: "🔥", title: "3일 연속", description: "3일 연속으로 라이딩했어요.", goal: 3, unit: "일", value: (t) => t.bestStreak },
  { id: "streak7", emoji: "💪", title: "7일 연속", description: "일주일 내내 라이딩했어요.", goal: 7, unit: "일", value: (t) => t.bestStreak },
  { id: "dawn", emoji: "🌅", title: "새벽 라이더", description: "새벽 5~7시에 라이딩을 시작했어요.", goal: 1, unit: "회", value: (t) => t.dawnCount },
  {
    id: "night",
    emoji: "🌙",
    title: "야간 라이더",
    description: "저녁 8시~자정 사이에 라이딩을 시작했어요.",
    tip: "밤에는 앞뒤 라이트를 꼭 켜고, 밝은 옷을 입어 주세요.",
    goal: 1,
    unit: "회",
    value: (t) => t.nightCount,
  },
];

export type Badge = {
  id: string;
  emoji: string;
  title: string;
  description: string;
  tip?: string;
  achieved: boolean;
  /** 0~1 */
  progress: number;
  /** "62/100km", "3/10회" */
  progressText: string;
};

/** 진행 숫자는 내림해요. 99.96km를 "100/100km"로 보여주면 받은 줄 착각하니까요. */
function progressNumber(v: number, unit: Unit): string {
  if (unit !== "km") return String(Math.floor(v));
  const floored = v < 100 ? Math.floor(v * 10) / 10 : Math.floor(v);
  return floored.toLocaleString("ko-KR", { maximumFractionDigits: 1 });
}

export function evaluateBadges(totals: RideTotals): Badge[] {
  return BADGE_DEFS.map((def) => {
    const raw = Math.max(0, def.value(totals));
    const achieved = raw >= def.goal;
    const shown = Math.min(raw, def.goal);
    return {
      id: def.id,
      emoji: def.emoji,
      title: def.title,
      description: def.description,
      tip: def.tip,
      achieved,
      progress: achieved ? 1 : Math.min(1, raw / def.goal),
      progressText: `${achieved ? def.goal.toLocaleString("ko-KR") : progressNumber(shown, def.unit)}/${def.goal.toLocaleString("ko-KR")}${def.unit}`,
    };
  });
}

/** 다음으로 받을 만한 배지 n개: 아직 못 받은 것 중 가장 가까운 것부터 (같으면 목록 순서) */
export function nextBadges(badges: Badge[], n = 3): Badge[] {
  return badges
    .map((b, i) => ({ b, i }))
    .filter(({ b }) => !b.achieved)
    .sort((x, y) => y.b.progress - x.b.progress || x.i - y.i)
    .slice(0, n)
    .map(({ b }) => b);
}

/** before에는 없고 after에서 새로 받은 배지 (라이딩 한 번으로 받은 배지 알림용) */
export function newlyEarned(before: RideTotals, after: RideTotals): Badge[] {
  const had = new Set(evaluateBadges(before).filter((b) => b.achieved).map((b) => b.id));
  return evaluateBadges(after).filter((b) => b.achieved && !had.has(b.id));
}
