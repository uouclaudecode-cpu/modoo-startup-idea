/**
 * '나의 B-LOCK 활동' (039_my_activity.sql 의 my_activity)
 * 칭호는 남을 도운 만큼 올라가요: 도와준 1점 · 고맙다는 인정 3점 · 되찾아 준 이동수단 10점
 * (잃어버린 횟수는 일부러 세지 않아요. 랭킹(2단계)은 회원이 모이면 '인정받은 도움'으로만 매길 예정)
 */
export type Activity = {
  helped: number;
  thanked: number;
  returned: number;
  recovered: number;
  vehicles: number;
  ride_m: number;
  ride_count: number;
  since: string | null;
};

export const LEVELS = [
  { min: 0, emoji: "🌱", name: "새싹", hint: "길에서 본 자전거 QR을 찍어 주인에게 알려 주면 칭호가 올라가요." },
  { min: 1, emoji: "🤝", name: "좋은 이웃", hint: "제보가 도움이 됐다고 인정받으면 더 빨리 올라가요." },
  { min: 10, emoji: "🛡️", name: "동네 지킴이", hint: "누군가의 이동수단을 되찾아 주면 크게 올라가요." },
  { min: 30, emoji: "🦸", name: "우리 동네 영웅", hint: "벌써 동네의 든든한 영웅이에요!" },
  { min: 100, emoji: "👑", name: "전설의 지킴이", hint: "최고 칭호예요. 고마워요!" },
] as const;

export function activityPoints(a: Pick<Activity, "helped" | "thanked" | "returned">) {
  return a.helped + a.thanked * 3 + a.returned * 10;
}

/** 지금 칭호와 다음 칭호까지 남은 점수 */
export function activityLevel(a: Pick<Activity, "helped" | "thanked" | "returned">) {
  const points = activityPoints(a);
  let i = 0;
  for (let k = 0; k < LEVELS.length; k++) if (points >= LEVELS[k].min) i = k;
  const now = LEVELS[i];
  const next = LEVELS[i + 1] ?? null;
  const progress = next ? (points - now.min) / (next.min - now.min) : 1;
  return { points, now, next, progress: Math.max(0, Math.min(1, progress)), toNext: next ? next.min - points : 0 };
}
