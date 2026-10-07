/**
 * 라이딩 통계 (주간·월간 묶기, 연속 라이딩, 지난 기간과 비교).
 * 화면·DB와 상관없는 순수 계산이라, now를 넘겨서 언제든 같은 결과가 나오게 했어요. (테스트하기 쉽게)
 *
 * 시간 기준은 모두 한국 시간(KST, UTC+9)이에요.
 * 서버(Vercel)는 UTC로 돌기 때문에 new Date().getDay() 같은 걸 그대로 쓰면 밤 9시 이후 기록이 하루 밀려요.
 * 그래서 시각에 9시간을 더한 뒤 UTC 함수로 날짜를 읽습니다. (한국은 서머타임이 없어서 항상 +9시간)
 */
import { averageSpeed } from "./geo";

export const KST_OFFSET_MS = 9 * 3600e3;
const DAY_MS = 86400e3;
const WEEK_MS = 7 * DAY_MS;

/** 통계 계산에 필요한 라이딩 값만 (경로 path는 무거워서 받지 않아요) */
export type RideLite = {
  started_at: string;
  distance_m: number;
  elapsed_sec: number;
  moving_sec: number;
};

export type Bucket = {
  /** "2026-10-05"(그 주 월요일) 또는 "2026-10" */
  key: string;
  /** 기간 시작 (UTC ms, 포함) */
  start: number;
  /** 기간 끝 (UTC ms, 포함하지 않음) */
  end: number;
  /** 그래프 아래 짧은 이름: "10/5", "10월" */
  label: string;
  /** 화면 읽기 프로그램용 긴 이름: "10월 5일 주", "2026년 10월" */
  longLabel: string;
  distance_m: number;
  elapsed_sec: number;
  moving_sec: number;
  count: number;
  /** 지금 기간(이번 주·이번 달)인지 */
  current: boolean;
};

const toMs = (t: string | number) => (typeof t === "number" ? t : Date.parse(t));

/** 한국 시간 기준 날짜 번호 (1970-01-01 = 0). 같은 날이면 같은 숫자예요. */
export function kstDay(t: string | number): number {
  return Math.floor((toMs(t) + KST_OFFSET_MS) / DAY_MS);
}

/** 한국 시간 기준 시(0~23) */
export function kstHour(t: string | number): number {
  return new Date(toMs(t) + KST_OFFSET_MS).getUTCHours();
}

/** t가 속한 주의 월요일 0시(한국 시간)를 UTC ms로 */
export function weekStartOf(t: number): number {
  const day = kstDay(t);
  // 1970-01-01은 목요일이라, (day + 3) % 7 이 0이면 월요일이에요. (월=0 … 일=6)
  const weekday = (((day + 3) % 7) + 7) % 7;
  return (day - weekday) * DAY_MS - KST_OFFSET_MS;
}

/** t가 속한 달에서 offset달 옮긴 달의 1일 0시(한국 시간)를 UTC ms로 (offset -1 = 지난달) */
export function monthStartOf(t: number, offset = 0): number {
  const k = new Date(t + KST_OFFSET_MS);
  // Date.UTC는 월이 음수거나 12를 넘어도 연도를 알아서 넘겨줘요.
  return Date.UTC(k.getUTCFullYear(), k.getUTCMonth() + offset, 1) - KST_OFFSET_MS;
}

const pad = (n: number) => String(n).padStart(2, "0");

function emptyBucket(start: number, end: number, current: boolean, key: string, label: string, longLabel: string): Bucket {
  return { key, start, end, label, longLabel, distance_m: 0, elapsed_sec: 0, moving_sec: 0, count: 0, current };
}

/** 기간 틀에 라이딩을 나눠 담기 (시작 시각 기준, 범위 밖 기록은 버려요) */
function fill(buckets: Bucket[], rides: RideLite[]): Bucket[] {
  if (buckets.length === 0) return buckets;
  const first = buckets[0].start;
  const last = buckets[buckets.length - 1].end;
  for (const r of rides) {
    const t = toMs(r.started_at);
    if (!Number.isFinite(t) || t < first || t >= last) continue;
    const b = buckets.find((x) => t >= x.start && t < x.end);
    if (!b) continue;
    b.distance_m += r.distance_m || 0;
    b.elapsed_sec += r.elapsed_sec || 0;
    b.moving_sec += r.moving_sec || 0;
    b.count += 1;
  }
  return buckets;
}

/** 최근 weeks주(이번 주 포함, 월요일 시작)를 오래된 순으로. 탄 기록이 없는 주도 0으로 들어가요. */
export function bucketByWeek(rides: RideLite[], now: number, weeks = 8): Bucket[] {
  const thisWeek = weekStartOf(now);
  const buckets: Bucket[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const start = thisWeek - i * WEEK_MS;
    const k = new Date(start + KST_OFFSET_MS);
    const m = k.getUTCMonth() + 1;
    const d = k.getUTCDate();
    buckets.push(
      emptyBucket(start, start + WEEK_MS, i === 0, `${k.getUTCFullYear()}-${pad(m)}-${pad(d)}`, `${m}/${d}`, i === 0 ? "이번 주" : `${m}월 ${d}일 주`),
    );
  }
  return fill(buckets, rides);
}

/** 최근 months달(이번 달 포함)을 오래된 순으로 */
export function bucketByMonth(rides: RideLite[], now: number, months = 6): Bucket[] {
  const buckets: Bucket[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const start = monthStartOf(now, -i);
    const end = monthStartOf(now, -i + 1);
    const k = new Date(start + KST_OFFSET_MS);
    const y = k.getUTCFullYear();
    const m = k.getUTCMonth() + 1;
    buckets.push(emptyBucket(start, end, i === 0, `${y}-${pad(m)}`, `${m}월`, i === 0 ? "이번 달" : `${y}년 ${m}월`));
  }
  return fill(buckets, rides);
}

/** 주간 8주·월간 6달 그래프를 그리려면 언제부터 기록을 받아야 하는지 (UTC ms) */
export function statsSince(now: number, weeks = 8, months = 6): number {
  return Math.min(weekStartOf(now) - (weeks - 1) * WEEK_MS, monthStartOf(now, -(months - 1)));
}

/** 라이딩한 날(한국 시간) 모음. dates는 시작 시각(ISO 문자열 또는 UTC ms)이에요. 날짜 번호를 넣으면 안 돼요. */
export function rideDays(dates: Iterable<string | number>): Set<number> {
  const days = new Set<number>();
  for (const d of dates) {
    const t = toMs(d);
    if (Number.isFinite(t)) days.add(kstDay(t));
  }
  return days;
}

/**
 * 지금 이어지고 있는 연속 라이딩 일수.
 * 오늘 탔으면 오늘부터, 오늘 아직 안 탔어도 어제 탔으면 어제부터 거꾸로 셉니다.
 * (아침에 앱을 열었을 때 '연속 기록이 끊겼다'고 보이면 맥이 빠지니까, 오늘 하루는 기회를 줘요)
 */
export function streakDays(dates: Iterable<string | number>, now: number): number {
  const days = rideDays(dates);
  const today = kstDay(now);
  let day = days.has(today) ? today : days.has(today - 1) ? today - 1 : null;
  if (day === null) return 0;
  let n = 0;
  while (days.has(day)) {
    n += 1;
    day -= 1;
  }
  return n;
}

/** 지금까지 가장 길게 이어진 연속 라이딩 일수 (배지용) */
export function longestStreak(dates: Iterable<string | number>): number {
  const sorted = [...rideDays(dates)].sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  for (let i = 0; i < sorted.length; i++) {
    run = i > 0 && sorted[i] === sorted[i - 1] + 1 ? run + 1 : 1;
    if (run > best) best = run;
  }
  return best;
}

export type Change = {
  /** 이번 값 - 지난 값 (절댓값 아님) */
  delta: number;
  direction: "up" | "down" | "same";
};

/** 지난 기간과 비교. 차이가 minDelta보다 작으면 '같음'으로 봐요. (GPS 오차로 "0.0km ↑"가 뜨지 않게) */
export function compare(current: number, previous: number, minDelta = 0): Change {
  const delta = current - previous;
  if (Math.abs(delta) <= minDelta) return { delta, direction: "same" };
  return { delta, direction: delta > 0 ? "up" : "down" };
}

export type PeriodSummary = {
  distance_m: number;
  elapsed_sec: number;
  count: number;
  /** 이동 시간 기준 평균 속도 (km/h) */
  avgKmh: number;
};

export function summarize(b: Pick<Bucket, "distance_m" | "elapsed_sec" | "moving_sec" | "count">): PeriodSummary {
  return { distance_m: b.distance_m, elapsed_sec: b.elapsed_sec, count: b.count, avgKmh: averageSpeed(b.distance_m, b.moving_sec) };
}

/** 짧은 거리 글자: 850m, 3.2km, 1,234km */
export function formatKmCompact(meters: number): string {
  const m = Math.abs(meters);
  if (m < 1000) return `${Math.round(m)}m`;
  const km = m / 1000;
  return km < 100 ? `${km.toFixed(1)}km` : `${Math.round(km).toLocaleString("ko-KR")}km`;
}

/** 막대 위 숫자 (단위 km는 그래프 제목에 따로 적어요): 0, 0.4, 12.3, 156 */
export function chartValue(meters: number): string {
  if (meters <= 0) return "0";
  const km = meters / 1000;
  if (km < 100) return String(Math.round(km * 10) / 10);
  return Math.round(km).toLocaleString("ko-KR");
}
