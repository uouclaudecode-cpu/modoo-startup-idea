import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getOwnedVehicle } from "@/lib/vehicles";
import { PrintStudio, type PrintSource } from "./PrintStudio";

export const metadata: Metadata = { title: "QR 출력하기" };

export default async function QrPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, vehicle } = await getOwnedVehicle(id, `/vehicles/${id}/qr/print`);
  const { data: stickers, error } = await supabase
    .from("stickers")
    .select("code, lookup_code")
    .eq("vehicle_id", vehicle.id)
    .order("claimed_at", { ascending: true });
  if (error) console.error(error);

  const sources: PrintSource[] = [
    { token: vehicle.qr_token, lookup: vehicle.lookup_code ?? null, label: "앱 QR" },
    ...(stickers ?? []).map((s, i) => ({ token: s.code, lookup: s.lookup_code, label: `연결한 스티커 ${i + 1}` })),
  ];

  return (
    <div className="mx-auto max-w-xl space-y-4 print:max-w-none">
      <div className="space-y-1 print:hidden">
        <Link href={`/vehicles/${vehicle.id}/qr`} className="inline-flex items-center gap-1 text-sm font-semibold text-ink-muted hover:text-ink">
          <ChevronLeft aria-hidden className="h-4 w-4" />
          {vehicle.name} QR
        </Link>
        <h1 className="text-2xl font-extrabold tracking-tight">QR 출력하기</h1>
        <p className="text-[15px] leading-relaxed text-ink-muted">크기와 개수를 골라 집 프린터나 편의점에서 뽑아요. 여러 곳에 숨겨 붙여 두면 더 좋아요.</p>
      </div>
      <PrintStudio vehicleId={vehicle.id} vehicleName={vehicle.name} sources={sources} />
    </div>
  );
}
