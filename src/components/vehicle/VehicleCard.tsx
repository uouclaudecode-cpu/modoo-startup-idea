import Link from "next/link";
import { ChevronRight, QrCode, Siren } from "lucide-react";
import { ButtonLink, StatusBadge } from "@/components/ui";
import { cn } from "@/lib/cn";
import { vehicleImageUrl } from "@/lib/images";
import { displayStatus, STATUS_META } from "@/lib/status";
import { typeLabel, type Vehicle } from "@/lib/types";
import { formatDistance } from "@/lib/ride/geo";
import { VehicleImage } from "./VehicleImage";

/** 대시보드의 이동수단 카드. 수색 중이면 테두리와 안내 띠로 확실히 구분합니다. */
export function VehicleCard({ vehicle, foundReports }: { vehicle: Vehicle; foundReports: number }) {
  const status = displayStatus(vehicle.status, foundReports);
  const alert = status === "searching" || status === "reported";
  return (
    <article className={cn("overflow-hidden rounded-2xl bg-white shadow-card ring-1 ring-line/70", STATUS_META[status].ring)}>
      {alert && (
        <div className={cn("flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white", status === "reported" ? "bg-orange-500" : "bg-rose-600")}>
          <Siren aria-hidden className="h-4 w-4" />
          {status === "reported" ? `발견 제보 ${foundReports}건이 도착했어요` : "분실/도난 수색 중이에요"}
        </div>
      )}
      <Link href={`/vehicles/${vehicle.id}`} className="block">
        <VehicleImage src={vehicleImageUrl(vehicle.image_path)} type={vehicle.type} alt={vehicle.name} className="aspect-[16/10]" />
      </Link>
      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold">{vehicle.name}</h2>
            <p className="text-sm text-ink-muted">
              {typeLabel(vehicle.type)}
              {vehicle.brand ? ` · ${vehicle.brand}` : ""}
              {vehicle.color ? ` · ${vehicle.color}` : ""}
            </p>
            {vehicle.odometer_m > 0 && <p className="text-[13px] text-ink-muted">누적 {formatDistance(vehicle.odometer_m)}</p>}
          </div>
          <StatusBadge status={status} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <ButtonLink href={`/vehicles/${vehicle.id}/qr`} variant="secondary" icon={<QrCode aria-hidden className="h-4 w-4" />}>
            QR 보기
          </ButtonLink>
          <ButtonLink href={alert ? `/vehicles/${vehicle.id}/reports` : `/vehicles/${vehicle.id}`} variant={alert ? "danger" : "primary"}>
            {alert ? "제보 확인" : "상세보기"}
            <ChevronRight aria-hidden className="h-4 w-4" />
          </ButtonLink>
        </div>
      </div>
    </article>
  );
}
