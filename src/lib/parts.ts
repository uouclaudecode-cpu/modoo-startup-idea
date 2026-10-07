/**
 * 소모품 종류·기본 주기·상태 판별.
 * 상태는 '마모율' = max(달린 거리 ÷ 거리 주기, 지난 날 ÷ 기간 주기) 로 계산해요.
 */

export type PartKind = "tire_pressure" | "chain_lube" | "brake_pad" | "chain" | "tire";

export type VehiclePart = {
  id: string;
  vehicle_id: string;
  kind: PartKind;
  interval_km: number | null;
  interval_days: number | null;
  distance_m: number;
  last_serviced_at: string;
  enabled: boolean;
};

export type MaintenanceLog = {
  id: string;
  vehicle_id: string;
  part_id: string | null;
  kind: string;
  serviced_on: string;
  cost: number | null;
  shop: string | null;
  memo: string | null;
  distance_m: number;
  created_at: string;
};

export const PART_META: Record<PartKind, { label: string; emoji: string; action: string; doneLabel: string; tip: string }> = {
  tire_pressure: {
    label: "타이어 공기압",
    emoji: "🎈",
    action: "공기 넣기",
    doneLabel: "공기 넣었어요",
    tip: "공기압이 낮으면 펑크가 잘 나고 힘이 더 들어요. 거리와 상관없이 2주마다 확인해요.",
  },
  chain_lube: {
    label: "체인 윤활",
    emoji: "🛢️",
    action: "체인 기름칠",
    doneLabel: "기름칠했어요",
    tip: "비를 맞았다면 주기보다 일찍 해 주세요. 체인 소리가 나면 바로 할 때예요.",
  },
  brake_pad: {
    label: "브레이크 패드",
    emoji: "🛑",
    action: "패드 교체",
    doneLabel: "교체했어요",
    tip: "브레이크가 밀리거나 쇳소리가 나면 주기 전이라도 점검하세요.",
  },
  chain: {
    label: "체인 교체",
    emoji: "⛓️",
    action: "체인 교체",
    doneLabel: "교체했어요",
    tip: "늘어난 체인은 기어(스프라켓)까지 닳게 해요.",
  },
  tire: {
    label: "타이어 교체",
    emoji: "🛞",
    action: "타이어 교체",
    doneLabel: "교체했어요",
    tip: "트레드(무늬)가 닳거나 옆면이 갈라지면 교체하세요.",
  },
};

export const PART_ORDER: PartKind[] = ["tire_pressure", "chain_lube", "brake_pad", "chain", "tire"];

/** 3단계 상태 */
export type PartStatus = "good" | "check" | "replace";

export const PART_STATUS_META: Record<PartStatus, { label: string; bar: string; badge: string; text: string }> = {
  good: { label: "양호", bar: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700 ring-emerald-600/20", text: "text-emerald-700" },
  check: { label: "점검 필요", bar: "bg-amber-500", badge: "bg-amber-50 text-amber-800 ring-amber-600/25", text: "text-amber-800" },
  replace: { label: "교체 권장", bar: "bg-rose-500", badge: "bg-rose-50 text-rose-700 ring-rose-600/25", text: "text-rose-700" },
};

/** 마모율이 이 값 이상이면 '점검 필요', 1 이상이면 '교체 권장' */
export const CHECK_RATIO = 0.8;

export function daysSince(iso: string, now = Date.now()) {
  return Math.max(0, (now - new Date(iso).getTime()) / 86400e3);
}

/** 마모율 (0 = 새것, 1 = 주기 도달) */
export function wearRatio(p: Pick<VehiclePart, "interval_km" | "interval_days" | "distance_m" | "last_serviced_at">, now = Date.now()) {
  const byKm = p.interval_km ? p.distance_m / 1000 / p.interval_km : 0;
  const byDays = p.interval_days ? daysSince(p.last_serviced_at, now) / p.interval_days : 0;
  return Math.max(byKm, byDays);
}

export function partStatus(ratio: number): PartStatus {
  if (ratio >= 1) return "replace";
  if (ratio >= CHECK_RATIO) return "check";
  return "good";
}

/** 남은 양 설명: "180km 남음" / "3일 남음" / "120km 지남" */
export function remainingText(p: Pick<VehiclePart, "interval_km" | "interval_days" | "distance_m" | "last_serviced_at">, now = Date.now()) {
  const parts: string[] = [];
  // 주기에 딱 닿은 순간(남은 양 0)부터는 상태가 교체 권장이라, 문구도 지남·오늘로 맞춰요.
  if (p.interval_km) {
    const left = p.interval_km - p.distance_m / 1000;
    parts.push(left > 0 ? `${fmtKm(left)} 남음` : left === 0 ? "주기 도달" : `${fmtKm(-left)} 지남`);
  }
  if (p.interval_days) {
    const left = p.interval_days - daysSince(p.last_serviced_at, now);
    const over = Math.floor(-left);
    parts.push(left > 0 ? `${Math.ceil(left)}일 남음` : over < 1 ? "오늘 할 때예요" : `${over}일 지남`);
  }
  return parts.join(" · ");
}

/** 주기 설명: "250km마다" / "14일마다" */
export function intervalText(p: Pick<VehiclePart, "interval_km" | "interval_days">) {
  return [p.interval_km ? `${fmtKm(p.interval_km)}마다` : null, p.interval_days ? `${p.interval_days}일마다` : null].filter(Boolean).join(" 또는 ");
}

function fmtKm(km: number) {
  return km >= 100 ? `${Math.round(km).toLocaleString("ko-KR")}km` : `${Math.round(km * 10) / 10}km`;
}

/** 점검·교체가 필요한 소모품만 (알림용), 급한 순 */
export function partsNeedingCare<T extends VehiclePart>(parts: T[], now = Date.now()) {
  return parts
    .filter((p) => p.enabled)
    .map((p) => ({ part: p, ratio: wearRatio(p, now) }))
    .filter(({ ratio }) => partStatus(ratio) !== "good")
    .sort((a, b) => b.ratio - a.ratio);
}

export const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
