/**
 * 관리자 운영 통계 (supabase/007_admin_stats.sql 의 admin_stats() 결과)
 * DB가 jsonb 하나로 돌려주므로, 화면에서 쓰기 전에 숫자·배열 모양을 여기서 한 번 맞춰요.
 * (함수를 고치다 키가 빠져도 화면이 깨지지 않고 0으로 보이게)
 */

export type WeeklyPoint = {
  /** 그 주 월요일 (YYYY-MM-DD, 한국 시간) */
  week_start: string;
  signups: number;
  lost_posts: number;
  resolved_posts: number;
  rides: number;
};

export type BatchStat = {
  id: string;
  label: string;
  quantity: number;
  claimed: number;
  created_at: string;
};

export type AdminStats = {
  generated_at: string | null;
  users_total: number;
  users_7d: number;
  vehicles_total: number;
  vehicles_by_type: { bicycle: number; kickboard: number; other: number };
  vehicles_searching: number;
  vehicles_recovered: number;
  stickers_total: number;
  stickers_claimed: number;
  batches: BatchStat[];
  posts_total: number;
  posts_open: number;
  posts_resolved: number;
  /** 회수 완료 글 / 전체 글 (0~1). 글이 없으면 null */
  recovery_rate: number | null;
  finder_reports_total: number;
  finder_reports_7d: number;
  comments_total: number;
  rides_total: number;
  rides_km_total: number;
  riders_30d: number;
  weekly: WeeklyPoint[];
};

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** bigint·numeric 이 문자열로 올 수도 있어서 숫자로 바꾸고, 못 바꾸면 0 */
function num(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : 0;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export function normalizeAdminStats(raw: unknown): AdminStats {
  const o = isObj(raw) ? raw : {};
  const byType = isObj(o.vehicles_by_type) ? o.vehicles_by_type : {};
  const rate = o.recovery_rate;
  return {
    generated_at: typeof o.generated_at === "string" ? o.generated_at : null,
    users_total: num(o.users_total),
    users_7d: num(o.users_7d),
    vehicles_total: num(o.vehicles_total),
    vehicles_by_type: { bicycle: num(byType.bicycle), kickboard: num(byType.kickboard), other: num(byType.other) },
    vehicles_searching: num(o.vehicles_searching),
    vehicles_recovered: num(o.vehicles_recovered),
    stickers_total: num(o.stickers_total),
    stickers_claimed: num(o.stickers_claimed),
    batches: (Array.isArray(o.batches) ? o.batches : []).filter(isObj).map((b) => ({
      id: str(b.id),
      label: str(b.label),
      quantity: num(b.quantity),
      claimed: num(b.claimed),
      created_at: str(b.created_at),
    })),
    posts_total: num(o.posts_total),
    posts_open: num(o.posts_open),
    posts_resolved: num(o.posts_resolved),
    recovery_rate: rate === null || rate === undefined ? null : num(rate),
    finder_reports_total: num(o.finder_reports_total),
    finder_reports_7d: num(o.finder_reports_7d),
    comments_total: num(o.comments_total),
    rides_total: num(o.rides_total),
    rides_km_total: num(o.rides_km_total),
    riders_30d: num(o.riders_30d),
    weekly: (Array.isArray(o.weekly) ? o.weekly : []).filter(isObj).map((w) => ({
      week_start: str(w.week_start),
      signups: num(w.signups),
      lost_posts: num(w.lost_posts),
      resolved_posts: num(w.resolved_posts),
      rides: num(w.rides),
    })),
  };
}

/** 1234 → "1,234" */
export function formatCount(n: number) {
  return n.toLocaleString("ko-KR");
}

/** 비율(0~1)을 "37%"로. 10% 미만은 소수 첫째 자리까지 ("4.5%") */
export function formatPercent(ratio: number | null) {
  if (ratio === null || !Number.isFinite(ratio)) return "—";
  const p = ratio * 100;
  if (p > 0 && p < 10) return `${p.toFixed(1)}%`;
  return `${Math.round(p)}%`;
}

/** 분모가 0이면 null (0%와 '아직 없음'을 구분하려고) */
export function ratio(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null;
}

/** "2026-10-06" → 축 이름 "10/6주" */
export function weekLabel(weekStart: string) {
  const [, m, d] = weekStart.split("-").map(Number);
  if (!m || !d) return weekStart;
  return `${m}/${d}주`;
}

/** "2026-10-06" → 화면 읽기 프로그램용 "10월 6일 주" */
export function weekLabelLong(weekStart: string) {
  const [, m, d] = weekStart.split("-").map(Number);
  if (!m || !d) return weekStart;
  return `${m}월 ${d}일 주`;
}
