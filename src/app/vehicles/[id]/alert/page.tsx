import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getOwnedVehicle } from "@/lib/vehicles";
import { AlertForm } from "./AlertForm";

export const metadata: Metadata = { title: "도난 경보 보내기" };

export default async function NewAlertPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, vehicle } = await getOwnedVehicle(id, `/vehicles/${id}/alert`);
  const { data: open } = await supabase.from("theft_alerts").select("id").eq("vehicle_id", vehicle.id).eq("status", "open").maybeSingle();
  if (open) redirect(`/alerts/${open.id}`);
  // 마지막으로 세운 곳이 있으면 잃어버린 곳으로 미리 채워요
  const { data: parking } = await supabase.from("parking_spots").select("lat, lng, note, parked_at").eq("vehicle_id", vehicle.id).maybeSingle();
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Link href={`/vehicles/${vehicle.id}`} className="-ml-2 inline-flex h-10 max-w-full items-center gap-1 rounded-lg px-2 text-sm font-semibold text-ink-muted hover:bg-slate-100 hover:text-ink">
        <ChevronLeft aria-hidden className="h-4 w-4 flex-none" />
        <span className="truncate">{vehicle.name}</span>
      </Link>
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">도난 경보 보내기</h1>
        <p className="mt-1 text-[15px] leading-relaxed text-ink-muted">
          잃어버린 곳 근처에서 경보 알림을 켠 사람들에게 사진과 특징이 바로 전달돼요. 내 이름·연락처는 보이지 않아요.
        </p>
      </div>
      <AlertForm vehicleId={vehicle.id} parking={parking ?? null} isNew={Date.now() - new Date(vehicle.created_at).getTime() < 86400e3} />
    </div>
  );
}
