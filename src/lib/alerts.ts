import type { VehicleType } from "@/lib/types";

/** 도난 경보 공개 카드 (get_alert) */
export type AlertCard = {
  id: string;
  status: "open" | "resolved" | "cancelled" | "expired" | "hidden";
  is_owner: boolean;
  lost_at: string;
  place_label: string | null;
  lat: number;
  lng: number;
  radius_m: number;
  marks: string | null;
  police_reported: boolean;
  bounty_amount: number | null;
  /** 이 주인의 사례금 '못 받음' 기록 수 */
  owner_unpaid?: number;
  recipients: number | null;
  expires_at: string;
  resolved_at: string | null;
  created_at: string;
  vehicle: {
    id: string | null;
    type: VehicleType;
    brand: string | null;
    model: string | null;
    color: string | null;
    description: string | null;
    image_path: string | null;
    has_sticker: boolean;
    has_serial: boolean;
  };
};

export type NearbyAlert = {
  id: string;
  distance_m: number;
  lost_at: string;
  place_label: string | null;
  marks: string | null;
  bounty_amount: number | null;
  police_reported: boolean;
  type: VehicleType;
  brand: string | null;
  model: string | null;
  color: string | null;
  image_path: string | null;
  created_at: string;
};

export type Sighting = {
  id: string;
  alert_id: string;
  reporter_id: string;
  kind: "street" | "listing";
  lat: number | null;
  lng: number | null;
  distance_m: number | null;
  photo_path: string | null;
  listing_url: string | null;
  price: number | null;
  note: string | null;
  seen_at: string;
  status: "new" | "useful" | "false" | "duplicate";
  created_at: string;
};

export type Reward = {
  id: string;
  alert_id: string;
  sighting_id: string;
  reporter_id: string;
  owner_id: string;
  amount: number;
  status: "pending" | "paid" | "confirmed" | "unpaid_reported";
  paid_at: string | null;
  confirmed_at: string | null;
};

export type Trust = {
  user_id: string;
  member_since: string;
  helped_count: number;
  false_count: number;
  identity_verified: boolean;
  unpaid_count: number;
};

export const ALERT_STATUS: Record<AlertCard["status"], string> = {
  open: "수색 중",
  resolved: "찾았어요",
  cancelled: "취소됨",
  expired: "경보 종료",
  hidden: "확인 중",
};

export const vehicleTitle = (v: { type: VehicleType; brand: string | null; model: string | null; color: string | null }) =>
  [v.color, v.brand, v.model].filter(Boolean).join(" ") || (v.type === "kickboard" ? "전동킥보드" : v.type === "bicycle" ? "자전거" : "이동수단");

export const distanceLabel = (m: number) => (m < 1000 ? `${Math.max(100, Math.round(m / 100) * 100)}m` : `${(m / 1000).toFixed(1)}km`);

export const wonLabel = (n: number) => (n >= 10000 && n % 10000 === 0 ? `${n / 10000}만 원` : `${n.toLocaleString("ko-KR")}원`);

/**
 * 돈을 먼저 요구하는 글인지 (사례금 사기 경고용).
 * 공백·특수문자를 빼고 찾아서 '계 좌' 같은 띄어 쓰기도 잡아요.
 */
const MONEY_WORDS = ["사례금", "보상금", "현상금", "계좌", "송금", "입금", "이체", "선입금", "돈먼저", "돈부터", "착수금", "수고비", "카톡아이디", "오픈채팅", "텔레그램"];
export function hasMoneyRequest(text: string | null | undefined) {
  if (!text) return false;
  const t = text.replace(/[\s.\-_·,!?~]/g, "");
  return MONEY_WORDS.some((w) => t.includes(w)) || /\d{2,6}-?\d{2,6}-?\d{4,8}/.test(text.replace(/\s/g, ""));
}
