import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getOwnedVehicle } from "@/lib/vehicles";
import { TransferStart } from "./TransferStart";

export const metadata: Metadata = { title: "소유권 넘기기" };

export default async function TransferPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { vehicle } = await getOwnedVehicle(id, `/vehicles/${id}/transfer`);
  return (
    <div className="mx-auto max-w-md space-y-4">
      <Link href={`/vehicles/${vehicle.id}`} className="inline-flex items-center gap-1 text-sm font-semibold text-ink-muted hover:text-ink">
        <ChevronLeft aria-hidden className="h-4 w-4" />
        {vehicle.name}
      </Link>
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">소유권 넘기기</h1>
        <p className="mt-1 text-[15px] leading-relaxed text-ink-muted">직거래 현장에서 구매자가 이 화면의 QR을 찍으면 바로 넘어가요.</p>
      </div>
      <TransferStart vehicleId={vehicle.id} vehicleName={vehicle.name} searching={vehicle.status === "searching"} />
    </div>
  );
}
