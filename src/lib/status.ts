import { CircleCheck, Siren, MapPinned, ShieldCheck, type LucideIcon } from "lucide-react";

/**
 * 이동수단 상태.
 * DB에는 active / searching / recovered 만 저장하고,
 * "발견 제보 접수(reported)"는 수색 중인데 제보가 들어온 경우 화면에서 계산해 보여줍니다.
 */
export type VehicleStatus = "active" | "searching" | "recovered";
export type DisplayStatus = VehicleStatus | "reported";

export const STATUS_META: Record<
  DisplayStatus,
  { label: string; emoji: string; icon: LucideIcon; badge: string; ring: string }
> = {
  active: { label: "정상", emoji: "🟢", icon: CircleCheck, badge: "bg-emerald-50 text-emerald-700 ring-emerald-600/20", ring: "" },
  searching: { label: "수색 중", emoji: "🔴", icon: Siren, badge: "bg-rose-50 text-rose-700 ring-rose-600/25", ring: "ring-2 ring-rose-500" },
  reported: { label: "발견 제보 접수", emoji: "🟠", icon: MapPinned, badge: "bg-orange-50 text-orange-700 ring-orange-600/25", ring: "ring-2 ring-orange-500" },
  recovered: { label: "회수 완료", emoji: "🔵", icon: ShieldCheck, badge: "bg-sky-50 text-sky-700 ring-sky-600/20", ring: "" },
};

/** 수색 중이면서 발견 제보가 있으면 '발견 제보 접수'로 보여줍니다. */
export function displayStatus(status: VehicleStatus, foundReports = 0): DisplayStatus {
  return status === "searching" && foundReports > 0 ? "reported" : status;
}
