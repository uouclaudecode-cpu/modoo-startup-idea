import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, QrCode } from "lucide-react";
import { ButtonLink, Card, StatusBadge } from "@/components/ui";
import { VehicleImage } from "@/components/vehicle/VehicleImage";
import { formatDate } from "@/lib/format";
import { vehicleImageUrl } from "@/lib/images";
import { displayStatus } from "@/lib/status";
import { typeLabel } from "@/lib/types";
import { getOwnedVehicle } from "@/lib/vehicles";
import { StatusActions } from "./StatusActions";

export const metadata: Metadata = { title: "이동수단 상세" };

export default async function VehicleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, vehicle } = await getOwnedVehicle(id, `/vehicles/${id}`);
  const { count } = await supabase
    .from("reports")
    .select("id", { count: "exact", head: true })
    .eq("vehicle_id", vehicle.id)
    .eq("kind", "found");
  const { count: total } = await supabase.from("reports").select("id", { count: "exact", head: true }).eq("vehicle_id", vehicle.id);
  const status = displayStatus(vehicle.status, count ?? 0);

  const rows: [string, string | null][] = [
    ["종류", typeLabel(vehicle.type)],
    ["브랜드", vehicle.brand],
    ["모델", vehicle.model],
    ["색상", vehicle.color],
    ["등록일", formatDate(vehicle.created_at)],
  ];

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm font-semibold text-ink-muted hover:text-ink">
        <ChevronLeft aria-hidden className="h-4 w-4" />내 이동수단
      </Link>

      <Card className="overflow-hidden p-0">
        <VehicleImage src={vehicleImageUrl(vehicle.image_path)} type={vehicle.type} alt={vehicle.name} className="aspect-[4/3]" />
        <div className="space-y-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-2xl font-extrabold tracking-tight">{vehicle.name}</h1>
            <StatusBadge status={status} size="lg" />
          </div>
          <dl className="grid grid-cols-[5rem_1fr] gap-x-3 gap-y-2 text-[15px]">
            {rows.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-ink-muted">{k}</dt>
                <dd className="font-medium">{v || "—"}</dd>
              </div>
            ))}
          </dl>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-[13px] font-semibold text-ink-muted">특징</p>
            <p className="mt-1 whitespace-pre-line text-[15px] leading-relaxed">{vehicle.description || "등록된 특징이 없어요."}</p>
          </div>
        </div>
      </Card>

      <StatusActions vehicleId={vehicle.id} status={vehicle.status} foundReports={count ?? 0} totalReports={total ?? 0} />

      <ButtonLink href={`/vehicles/${vehicle.id}/qr`} variant="secondary" full size="lg" icon={<QrCode aria-hidden className="h-5 w-5" />}>
        QR 보기
      </ButtonLink>
    </div>
  );
}
