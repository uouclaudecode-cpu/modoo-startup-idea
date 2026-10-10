import Link from "next/link";
import { BellRing, ChevronRight } from "lucide-react";
import { PART_META, PART_STATUS_META, partStatus, remainingText, type VehiclePart } from "@/lib/parts";
import { cn } from "@/lib/cn";

type Item = { part: VehiclePart; ratio: number };

/** 점검·교체 시기가 된 소모품 안내 (라이딩 결과·홈·이동수단 화면) */
export function MaintenanceAlert({ vehicleId, vehicleName, items, now }: { vehicleId: string; vehicleName: string; items: Item[]; now?: number }) {
  if (items.length === 0) return null;
  const urgent = items.some((i) => partStatus(i.ratio) === "replace");
  return (
    <Link
      href={`/vehicles/${vehicleId}/maintenance`}
      className={cn(
        "block rounded-2xl p-4 ring-1 transition-shadow hover:shadow-lift",
        urgent ? "bg-rose-50 ring-rose-200" : "bg-amber-50 ring-amber-200",
      )}
    >
      <p className={cn("flex items-center gap-2 font-bold", urgent ? "text-rose-800" : "text-amber-900")}>
        <BellRing aria-hidden className="h-5 w-5 flex-none" />
        <span className="min-w-0 truncate">
          {vehicleName} 정비 알림 {items.length}건
        </span>
        <ChevronRight aria-hidden className="ml-auto h-5 w-5 flex-none opacity-60" />
      </p>
      <ul className="mt-2 space-y-1.5">
        {items.slice(0, 4).map(({ part, ratio }) => {
          const st = PART_STATUS_META[partStatus(ratio)];
          return (
            <li key={part.id} className="flex items-center gap-2 text-[14px]">
              <span aria-hidden>{PART_META[part.kind].emoji}</span>
              <span className="min-w-0 truncate font-semibold text-ink">{PART_META[part.kind].label}</span>
              <span className={cn("flex-none whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-semibold ring-1 ring-inset", st.badge)}>{st.label}</span>
              <span className="ml-auto flex-none whitespace-nowrap text-[12px] text-ink-muted">{remainingText(part, now)}</span>
            </li>
          );
        })}
      </ul>
    </Link>
  );
}
