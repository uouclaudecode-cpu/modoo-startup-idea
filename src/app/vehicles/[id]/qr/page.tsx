import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, EyeOff, MapPin, PartyPopper, Printer, ScanLine } from "lucide-react";
import { site } from "@/config/site";
import { ButtonLink } from "@/components/ui";
import { formatDate } from "@/lib/format";
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
  const { supabase, vehicle } = await getOwnedVehicle(id, `/vehicles/${id}/qr`);
  // 이 이동수단에 연결한 B-LOCK 스티커 (본인이 등록한 것만 보여요)
  const { data: stickers, error } = await supabase
    .from("stickers")
    .select("code, claimed_at, lookup_code")
    .eq("vehicle_id", vehicle.id)
    .order("claimed_at", { ascending: true });
  if (error) console.error(error);

  return (
    <div className="mx-auto max-w-md space-y-4">
      <Link href={`/vehicles/${vehicle.id}`} className="-ml-2 inline-flex h-10 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-ink-muted hover:bg-slate-100 hover:text-ink">
        <ChevronLeft aria-hidden className="h-4 w-4" />
        {vehicle.name}
      </Link>
      {isNew && (
        <div className="flex items-start gap-3 rounded-2xl bg-emerald-50 p-4 text-emerald-800 ring-1 ring-emerald-200">
          <PartyPopper aria-hidden className="mt-0.5 h-5 w-5 flex-none" />
          <p className="text-[15px] leading-relaxed">
            <b>등록이 끝났어요!</b> 받은 B-LOCK 스티커가 있으면 연결하고, 없다면 &lsquo;QR 출력하기&rsquo;로 뽑아 붙여 주세요.
          </p>
        </div>
      )}

      {vehicle.sticker_spot && (
        <p className="flex items-start gap-2 rounded-xl bg-slate-100 p-3 text-[13px] leading-relaxed text-ink-soft">
          <EyeOff aria-hidden className="mt-0.5 h-4 w-4 flex-none" />
          <span>
            스티커 붙인 위치 (나만 보기): <b className="text-ink">{vehicle.sticker_spot}</b>
          </span>
        </p>
      )}

      <ButtonLink href={`/vehicles/${vehicle.id}/qr/print`} full size="lg" icon={<Printer aria-hidden className="h-5 w-5" />}>
        QR 출력하기 (크기 고르기)
      </ButtonLink>
      <div className="grid grid-cols-2 gap-2">
        <ButtonLink href="/scan" variant="secondary" icon={<ScanLine aria-hidden className="h-4 w-4" />}>
          받은 스티커 연결
        </ButtonLink>
        <ButtonLink href="/get-sticker" variant="secondary" icon={<MapPin aria-hidden className="h-4 w-4" />}>
          스티커 받는 곳
        </ButtonLink>
      </div>

      {(stickers ?? []).map((s) => (
        <QrCard
          key={s.code}
          token={s.code}
          lookup={s.lookup_code}
          vehicleName={vehicle.name}
          siteName={site.name}
          caption={`등록한 스티커 QR${s.claimed_at ? ` · ${formatDate(s.claimed_at)} 등록` : ""}. 붙인 스티커와 같은지 확인해 보세요.`}
        />
      ))}

      <QrCard
        token={vehicle.qr_token}
        lookup={vehicle.lookup_code}
        vehicleName={vehicle.name}
        siteName={site.name}
        caption="앱에서 만든 QR이에요. 저장해서 출력해 붙여도 돼요."
      />

    </div>
  );
}
