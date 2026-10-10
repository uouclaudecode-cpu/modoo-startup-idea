import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { VehicleForm } from "@/components/vehicle/VehicleForm";
import { getOwnedVehicle } from "@/lib/vehicles";

export const metadata: Metadata = { title: "정보 수정" };

export default async function EditVehiclePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { vehicle } = await getOwnedVehicle(id, `/vehicles/${id}/edit`);
  return (
    <div className="mx-auto max-w-xl space-y-5">
      <Link href={`/vehicles/${vehicle.id}`} className="-ml-2 inline-flex h-10 max-w-full items-center gap-1 rounded-lg px-2 text-sm font-semibold text-ink-muted hover:bg-slate-100 hover:text-ink">
        <ChevronLeft aria-hidden className="h-4 w-4 flex-none" />
        <span className="truncate">{vehicle.name}</span>
      </Link>
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">정보 수정</h1>
        <p className="mt-1 text-sm text-ink-muted">QR은 바뀌지 않아요. 이미 붙인 스티커를 그대로 쓰면 돼요.</p>
      </div>
      <VehicleForm vehicle={vehicle} />
    </div>
  );
}
