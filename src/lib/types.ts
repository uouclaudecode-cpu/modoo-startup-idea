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
