import Link from "next/link";
import { ChevronRight, Wrench } from "lucide-react";
import { Card } from "@/components/ui";
import { cn } from "@/lib/cn";
import { PART_META, partStatus, partsNeedingCare, type VehiclePart } from "@/lib/parts";
import { formatDistance } from "@/lib/ride/geo";

type Row = { id: string; name: string; odometer_m: number };

/** MY: 내 모든 이동수단의 소모품 상태를 한눈에 (라이딩을 안 해도 언제든 열 수 있어요) */
export function MaintenanceOverview({ vehicles, parts, now }: { vehicles: Row[]; parts: VehiclePart[]; now: number }) {
  if (vehicles.length === 0) return null;
  return (
    <Card className="space-y-2 p-4">
      <p className="flex items-center gap-2 font-bold">
        <Wrench aria-hidden className="h-5 w-5 text-brand-600" />
        정비
      </p>
      <ul className="divide-y divide-line/70">
        {vehicles.map((v) => {
          const care = partsNeedingCare(
            parts.filter((p) => p.vehicle_id === v.id),
            now,
          );
          const replace = care.filter((c) => partStatus(c.ratio) === "replace").length;
          const check = care.length - replace;
          const top = care[0];
          return (
            <li key={v.id}>
              <Link href={`/vehicles/${v.id}/maintenance`} className="flex items-center gap-3 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">{v.name}</span>
                  <span className="block truncate text-[13px] text-ink-muted">
                    {top ? `${PART_META[top.part.kind].label} ${partStatus(top.ratio) === "replace" ? "교체 권장" : "점검 필요"}` : "소모품 모두 양호"} · 누적{" "}
                    {formatDistance(v.odometer_m ?? 0)}
                  </span>
                </span>
                <span
                  className={cn(
                    "flex-none rounded-full px-2.5 py-0.5 text-[12px] font-bold",
                    replace ? "bg-rose-50 text-rose-700" : check ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700",
                  )}
                >
                  {replace ? `교체 ${replace}` : check ? `점검 ${check}` : "양호"}
                </span>
                <ChevronRight aria-hidden className="h-4 w-4 flex-none text-ink-faint" />
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="text-[12px] text-ink-muted">라이딩을 기록하면 거리가 자동으로 쌓여요. 앱 없이 탄 거리는 정비 화면에서 직접 더할 수 있어요.</p>
    </Card>
  );
}
