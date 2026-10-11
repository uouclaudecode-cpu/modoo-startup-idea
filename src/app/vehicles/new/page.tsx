import type { Metadata } from "next";
import { VehicleForm } from "@/components/vehicle/VehicleForm";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "이동수단 등록" };

export default async function NewVehiclePage({ searchParams }: { searchParams: Promise<{ sticker?: string }> }) {
  const { sticker } = await searchParams;
  // 스티커를 찍고 들어온 경우: 아직 등록 안 된 스티커일 때만 함께 연결
  let stickerCode: string | undefined;
  if (sticker && /^[A-Za-z0-9_-]{16,64}$/.test(sticker)) {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_sticker_status", { p_code: sticker });
    if (error) console.error(error);
    if (data === "unclaimed") stickerCode = sticker;
  }

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">이동수단 등록</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {stickerCode
            ? "등록하면 찍은 스티커가 바로 연결돼요."
            : "등록하면 내 QR이 바로 만들어져요."}
        </p>
      </div>
      <VehicleForm stickerCode={stickerCode} />
    </div>
  );
}
