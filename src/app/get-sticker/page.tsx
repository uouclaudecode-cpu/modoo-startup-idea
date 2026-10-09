import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { SpotList, type Spot } from "./SpotList";

export const metadata: Metadata = {
  title: "스티커 받는 곳",
  description: "B-LOCK QR 스티커를 무료로 받을 수 있는 곳. 근처에 없으면 직접 출력해도 돼요.",
};

export default async function GetStickerPage() {
  const supabase = await createClient();
  const [{ data, error }, { data: auth }] = await Promise.all([
    supabase.from("sticker_spots").select("id, name, address, hours, note, lat, lng").eq("active", true).order("created_at", { ascending: true }),
    supabase.auth.getUser(),
  ]);
  if (error) console.error(error);

  // 출력은 내 이동수단 QR로 해요: 로그인했으면 첫 이동수단, 아니면 등록부터
  let printHref = "/vehicles/new";
  if (auth.user) {
    const { data: v } = await supabase.from("vehicles").select("id").is("deleted_at", null).order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (v) printHref = `/vehicles/${v.id}/qr/print`;
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">스티커 받는 곳</h1>
        <p className="mt-1 text-[15px] leading-relaxed text-ink-muted">B-LOCK QR 스티커를 무료로 받을 수 있어요. 근처에 없으면 앱에서 바로 출력해도 똑같이 쓸 수 있어요.</p>
      </div>
      <SpotList spots={(data ?? []) as Spot[]} printHref={printHref} />
    </div>
  );
}
