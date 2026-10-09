"use client";

/* eslint-disable @next/next/no-img-element -- Supabase 저장소 사진이라 기본 img 사용 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { EyeOff, Plus, Tag } from "lucide-react";
import { Button, ButtonLink, Card, useToast } from "@/components/ui";
import { StickerSpotInput } from "@/components/vehicle/StickerSpotInput";
import { cn } from "@/lib/cn";
import { friendlyError } from "@/lib/format";
import { vehicleImageUrl } from "@/lib/images";
import { createClient } from "@/lib/supabase/client";
import { typeEmoji, type VehicleType } from "@/lib/types";

export type ClaimVehicle = { id: string; type: VehicleType; name: string; image_path: string | null; sticker_spot: string | null };

export function ClaimStickerForm({ code, vehicles }: { code: string; vehicles: ClaimVehicle[] }) {
  const router = useRouter();
  const toast = useToast();
  const [vehicleId, setVehicleId] = useState(vehicles.length === 1 ? vehicles[0].id : "");
  const vehicle = vehicles.find((v) => v.id === vehicleId);
  const [spot, setSpot] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const newHref = `/vehicles/new?sticker=${encodeURIComponent(code)}`;

  async function claim() {
    if (!vehicle) {
      setError("스티커를 붙일 이동수단을 골라 주세요.");
      return;
    }
    setError("");
    setLoading(true);
    const { error: err } = await createClient().rpc("claim_sticker", { p_code: code, p_vehicle: vehicle.id, p_spot: spot.trim() || null });
    setLoading(false);
    if (err) {
      console.error(err);
      setError(friendlyError(err, "등록하지 못했어요. 잠시 후 다시 시도해 주세요."));
      return;
    }
    toast.success("스티커를 연결했어요! 주인만 아는 곳에 붙여 주세요.");
    router.replace(`/vehicles/${vehicle.id}?sticker=1`);
    router.refresh();
  }

  if (vehicles.length === 0) {
    return (
      <Card className="space-y-4 text-center">
        <p className="text-[15px] leading-relaxed text-ink-soft">아직 등록한 이동수단이 없어요. 자전거·킥보드를 등록하면서 이 스티커를 함께 연결할게요.</p>
        <ButtonLink href={newHref} full size="lg" icon={<Plus aria-hidden className="h-5 w-5" />}>
          이동수단 등록하고 스티커 연결
        </ButtonLink>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-2">
        <p className="text-sm font-semibold text-ink-soft">어디에 붙일까요?</p>
        {vehicles.map((v) => (
          <label
            key={v.id}
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-xl border-2 p-2.5 text-[15px] font-semibold transition-colors",
              vehicleId === v.id ? "border-brand-600 bg-brand-50 text-brand-800" : "border-line bg-white text-ink-soft hover:border-brand-300",
            )}
          >
            <input type="radio" name="vehicle" className="sr-only" checked={vehicleId === v.id} onChange={() => setVehicleId(v.id)} />
            <span className="grid h-11 w-11 flex-none place-items-center overflow-hidden rounded-lg bg-slate-100 text-xl">
              {v.image_path ? <img src={vehicleImageUrl(v.image_path)!} alt="" className="h-full w-full object-cover" /> : typeEmoji(v.type)}
            </span>
            <span className="min-w-0 flex-1 truncate">{v.name}</span>
          </label>
        ))}
        <ButtonLink href={newHref} variant="ghost" full icon={<Plus aria-hidden className="h-4 w-4" />}>
          새 이동수단 등록하고 연결
        </ButtonLink>
      </Card>

      <Card className="space-y-3">
        <div className="flex items-start gap-2">
          <EyeOff aria-hidden className="mt-0.5 h-5 w-5 flex-none text-brand-600" />
          <p className="text-[13px] leading-relaxed text-ink-muted">
            도둑이 떼어 버리지 못하게 <b className="text-ink">눈에 잘 안 띄는 곳</b>에 붙이는 게 좋아요. 붙인 위치는 나만 볼 수 있고, 커뮤니티에서
            &ldquo;이건가요?&rdquo;라고 묻는 사람에게 비밀 답글로 알려 줄 때 써요.
          </p>
        </div>
        <StickerSpotInput value={spot} onChange={setSpot} placeholder={vehicle?.sticker_spot ?? undefined} />
      </Card>

      {error && (
        <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
          {error}
        </p>
      )}
      <Button full size="lg" loading={loading} loadingText="등록 중..." icon={<Tag aria-hidden className="h-5 w-5" />} onClick={claim}>
        이 이동수단에 연결하기
      </Button>
    </div>
  );
}
