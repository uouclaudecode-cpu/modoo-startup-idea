import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, PartyPopper } from "lucide-react";
import { site } from "@/config/site";
import { getOwnedVehicle } from "@/lib/vehicles";
import { QrCard } from "./QrCard";

export const metadata: Metadata = { title: "QR 디지털 신분증" };

export default async function VehicleQrPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ new?: string }>;
}) {
  const { id } = await params;
  const { new: isNew } = await searchParams;
  const { vehicle } = await getOwnedVehicle(id, `/vehicles/${id}/qr`);

  return (
    <div className="mx-auto max-w-md space-y-4">
      <Link href={`/vehicles/${vehicle.id}`} className="inline-flex items-center gap-1 text-sm font-semibold text-ink-muted hover:text-ink">
        <ChevronLeft aria-hidden className="h-4 w-4" />
        {vehicle.name}
      </Link>
      {isNew && (
        <div className="flex items-start gap-3 rounded-2xl bg-emerald-50 p-4 text-emerald-800 ring-1 ring-emerald-200">
          <PartyPopper aria-hidden className="mt-0.5 h-5 w-5 flex-none" />
          <p className="text-[15px] leading-relaxed">
            <b>등록이 끝났어요!</b> 아래 QR을 저장해서 이동수단의 잘 보이는 곳에 붙여 주세요.
          </p>
        </div>
      )}
      <QrCard token={vehicle.qr_token} vehicleName={vehicle.name} siteName={site.name} />
    </div>
  );
}
