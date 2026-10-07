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
            ? "등록하면 찍은 스티커가 이 이동수단에 연결되고, 앱 전용 QR도 함께 만들어져요."
            : "등록을 마치면 이 이동수단만의 고유 QR이 자동으로 만들어져요. 받은 B-LOCK 스티커는 나중에 찍어서 연결할 수 있어요."}
        </p>
      </div>
      <VehicleForm stickerCode={stickerCode} />
    </div>
  );
}
