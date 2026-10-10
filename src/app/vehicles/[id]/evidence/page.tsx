import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getOwnedVehicle } from "@/lib/vehicles";
import type { Evidence } from "@/lib/evidence";
import { EvidenceBoard } from "./EvidenceBoard";

export const metadata: Metadata = { title: "소유 증명" };

export default async function EvidencePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, vehicle } = await getOwnedVehicle(id, `/vehicles/${id}/evidence`);
  const { data, error } = await supabase.from("vehicle_evidence").select("*").eq("vehicle_id", vehicle.id).order("created_at");
  if (error) console.error(error);
  const items = (data ?? []) as Evidence[];
  const signed: Record<string, string> = {};
  if (items.length) {
    const { data: urls } = await supabase.storage.from("evidence").createSignedUrls(items.map((e) => e.photo_path), 3600);
    for (const u of urls ?? []) if (u.path && u.signedUrl) signed[u.path] = u.signedUrl;
  }
  const v = vehicle as typeof vehicle & { purchased_on?: string | null; purchase_place?: string | null };
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Link href={`/vehicles/${vehicle.id}`} className="-ml-2 inline-flex h-10 max-w-full items-center gap-1 rounded-lg px-2 text-sm font-semibold text-ink-muted hover:bg-slate-100 hover:text-ink">
        <ChevronLeft aria-hidden className="h-4 w-4 flex-none" />
        <span className="truncate">{vehicle.name}</span>
      </Link>
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">소유 증명</h1>
        <p className="mt-1 text-[15px] leading-relaxed text-ink-muted">
          잃어버린 뒤 찾았을 때 &ldquo;내 것&rdquo;이라는 걸 증명하는 자료예요. 사진은 나만 볼 수 있고, 올린 시각은 B-LOCK에 자동으로 남아 바꿀 수 없어요.
        </p>
      </div>
      <EvidenceBoard
        vehicleId={vehicle.id}
        items={items}
        signed={signed}
        purchasedOn={v.purchased_on ?? null}
        purchasePlace={v.purchase_place ?? null}
        serialLast4={vehicle.serial_last4 ?? null}
      />
    </div>
  );
}
