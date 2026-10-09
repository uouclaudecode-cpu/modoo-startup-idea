import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getOwnedVehicle } from "@/lib/vehicles";
import { TransferStart } from "./TransferStart";

export const metadata: Metadata = { title: "소유권 넘기기" };

export default async function TransferPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, vehicle } = await getOwnedVehicle(id, `/vehicles/${id}/transfer`);
  // 구매자가 실물을 확인하는 방법 (받는 화면과 같은 순서: 스티커 → 차대번호 → 눈으로 확인)
  const { count: stickerCount, error } = await supabase
    .from("stickers")
    .select("code", { count: "exact", head: true })
    .eq("vehicle_id", vehicle.id);
  if (error) console.error(error);
  const check = stickerCount ? "sticker" : vehicle.serial_last4 ? "serial" : "none";
  return (
    <div className="mx-auto max-w-md space-y-4">
      <Link href={`/vehicles/${vehicle.id}`} className="inline-flex items-center gap-1 text-sm font-semibold text-ink-muted hover:text-ink">
        <ChevronLeft aria-hidden className="h-4 w-4" />
        {vehicle.name}
      </Link>
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">소유권 넘기기</h1>
        <p className="mt-1 text-[15px] leading-relaxed text-ink-muted">직접 만나면 QR로, 비대면 거래는 링크를 보내서 넘길 수 있어요.</p>
      </div>
      <TransferStart
        vehicleId={vehicle.id}
        vehicleName={vehicle.name}
        searching={vehicle.status === "searching"}
        check={check}
        stickerCount={stickerCount ?? 0}
      />
    </div>
  );
}
