import type { VehicleType } from "@/lib/types";

/** 사이트 주소 (QR·링크에 넣을 완전한 주소) */
function siteBase() {
  return (process.env.NEXT_PUBLIC_SITE_URL || (typeof window !== "undefined" ? window.location.origin : "")).replace(/\/$/, "");
}

/** 안심거래 인증 화면 주소 */
export const verifyUrl = (token: string) => `${siteBase()}/v/${token}`;
/** 직거래 양도 QR 주소 */
export const transferUrl = (token: string) => `${siteBase()}/t/${token}`;

/** 인증 화면 데이터 (get_trade_verification) */
export type TradeVerification =
  | { valid: false; reason: "not_found" | "deleted" | "transferred" | "revoked" | "expired" | "flagged" }
  | {
      valid: true;
      vehicle: { type: VehicleType; brand: string | null; model: string | null; color: string | null; image_path: string | null };
      registered_at: string;
      owned_since: string;
      transfer_count: number;
      searching_count: number;
      last_recovered_at: string | null;
      serial_last4: string | null;
      sticker_attached: boolean;
      maintenance_count: number;
      odometer_m: number;
      seller: { masked_nickname: string; member_since: string | null };
      warnings: ("NEW_REGISTRATION" | "RECENT_TRANSFER" | "NO_SERIAL")[];
      check_code: string;
      expires_at: string;
      checked_at: string;
    };

export const INVALID_REASON: Record<Exclude<TradeVerification, { valid: true }>["reason"], string> = {
  not_found: "없는 인증 링크예요. 주소를 다시 확인해 주세요.",
  deleted: "삭제된 이동수단이에요.",
  transferred: "판매자가 더 이상 이 이동수단의 주인이 아니에요.",
  revoked: "판매자가 이 링크를 껐어요.",
  expired: "유효기간이 지난 링크예요. 판매자에게 새 링크를 받아 주세요.",
  flagged: "이 이동수단은 지금 분실·도난 수색 중이에요. 거래하지 마세요.",
};

export const WARNING_TEXT: Record<"NEW_REGISTRATION" | "RECENT_TRANSFER" | "NO_SERIAL", string> = {
  NEW_REGISTRATION: "등록한 지 14일이 안 됐어요. 구매 영수증 등 다른 증빙도 확인하세요.",
  RECENT_TRANSFER: "최근 30일 안에 주인이 바뀐 기록이 있어요.",
  NO_SERIAL: "차대번호가 등록되지 않아 도난 이력 대조가 약해요. 실물의 차대번호를 직접 확인하세요.",
};

/** 양도 미리 보기 (peek_transfer) */
export type TransferPeek =
  | { status: "not_found" | "self" | "cancelled" | "expired" }
  | { status: "completed"; mine: boolean }
  | {
      status: "pending";
      vehicle: { type: VehicleType; name: string; brand: string | null; model: string | null; color: string | null; image_path: string | null };
      has_serial: boolean;
      requires_sticker: boolean;
      seller: string;
      expires_at: string;
    };

/** 보유 기간: 3일 / 5개월 / 1년 2개월 */
export function durationLabel(fromIso: string, now = Date.now()) {
  const days = Math.max(0, Math.floor((now - new Date(fromIso).getTime()) / 86400e3));
  if (days < 31) return `${days}일`;
  const months = Math.floor(days / 30.4);
  if (months < 12) return `${months}개월`;
  const y = Math.floor(months / 12);
  const m = months % 12;
  return m ? `${y}년 ${m}개월` : `${y}년`;
}

/** 2026년 2월 */
export function monthLabel(iso: string) {
  const d = new Date(new Date(iso).getTime() + 9 * 3600e3);
  return `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월`;
}
