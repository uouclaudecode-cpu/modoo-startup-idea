import type { VehicleStatus } from "./status";

export type VehicleType = "bicycle" | "kickboard" | "other";

export const VEHICLE_TYPES: { value: VehicleType; label: string; emoji: string }[] = [
  { value: "bicycle", label: "자전거", emoji: "🚲" },
  { value: "kickboard", label: "전동킥보드", emoji: "🛴" },
  { value: "other", label: "기타", emoji: "🛞" },
];

export const typeLabel = (t: string) => VEHICLE_TYPES.find((x) => x.value === t)?.label ?? "기타";
export const typeEmoji = (t: string) => VEHICLE_TYPES.find((x) => x.value === t)?.emoji ?? "🛞";

export type Vehicle = {
  id: string;
  owner_id: string;
  type: VehicleType;
  name: string;
  brand: string | null;
  model: string | null;
  color: string | null;
  description: string | null;
  image_path: string | null;
  /** 주인만 아는 스티커 부착 위치 (주인에게만 보임) */
  sticker_spot: string | null;
  qr_token: string;
  /** 라이딩으로 쌓인 누적 주행거리 (m) */
  odometer_m: number;
  status: VehicleStatus;
  /** 차대번호 끝 4자리 (전체 번호는 해시로만 저장) */
  serial_last4?: string | null;
  /** 도난 조회에 넣는 읽기 쉬운 8자리 번호 */
  lookup_code?: string | null;
  /** 지금 주인이 갖게 된 시각 (등록 또는 양도) */
  owned_since?: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

/** QR 공개 화면에 보이는 정보 (소유자 개인정보 없음) */
export type PublicVehicle = {
  qr_token: string;
  type: VehicleType;
  brand: string | null;
  model: string | null;
  color: string | null;
  description: string | null;
  image_path: string | null;
  status: VehicleStatus;
  available: boolean;
};

export type Report = {
  id: string;
  /** 로그인한 제보자만 (주인에게만 보임) */
  reporter_id?: string | null;
  /** 발견자가 고른 연락 방법 */
  contact_mode?: "chat" | "callback" | "none";
  vehicle_id: string;
  kind: "found" | "contact";
  latitude: number | null;
  longitude: number | null;
  location_text: string | null;
  description: string;
  image_path: string | null;
  contact: string | null;
  created_at: string;
};
