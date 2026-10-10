import { ImageResponse } from "next/og";
import { createClient } from "@supabase/supabase-js";
import { vehicleTitle, wonLabel, type AlertCard } from "@/lib/alerts";
import { formatDateTime } from "@/lib/format";
import { vehicleImageUrl } from "@/lib/images";
import { OgCard } from "@/lib/ogCard";
import { fetchAsDataUrl, OG_SIZE, ogFonts } from "@/lib/ogImage";
import { supabaseEnv } from "@/lib/supabase/env";

export const alt = "B-LOCK 도난 경보";
export const size = OG_SIZE;
export const contentType = "image/png";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 도난 경보를 카카오톡에 공유할 때 보이는 카드: 사진 + '수색 중' + 특징·장소·사례금 */
export default async function AlertOgImage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let a: AlertCard | null = null;
  if (UUID.test(id)) {
    const { url, key } = supabaseEnv();
    const supabase = createClient(url, key, { auth: { persistSession: false } });
    const { data, error } = await supabase.rpc("get_alert", { p_alert: id });
    if (error) console.error(error);
    a = data as AlertCard | null;
  }
  const photo = a ? await fetchAsDataUrl(vehicleImageUrl(a.vehicle.image_path)) : null;
  const open = a?.status === "open";
  return new ImageResponse(
    (
      <OgCard
        photo={photo}
        header="B-LOCK 도난 경보"
        badge={!a ? "경보 없음" : open ? "수색 중" : a.status === "resolved" ? "찾았어요" : "경보 종료"}
        badgeColor={open ? "#ffffff" : "#1d41cc"}
        badgeBg={open ? "#e11d48" : "#eef4ff"}
        title={a ? vehicleTitle(a.vehicle) : "없는 경보예요"}
        lines={
          a
            ? [
                `${a.place_label ? `${a.place_label} 근처 · ` : ""}${formatDateTime(a.lost_at).slice(5)}`,
                a.marks ? `특징: ${a.marks}` : "",
                a.bounty_amount ? `찾아 주면 사례금 ${wonLabel(a.bounty_amount)}` : "",
              ]
            : []
        }
        footer={open ? "비슷한 걸 보면 눌러서 알려 주세요 · 이름·번호 비공개" : "함께 찾아 주셔서 고마워요"}
      />
    ),
    { ...OG_SIZE, fonts: await ogFonts(), headers: { "cache-control": "public, max-age=0, s-maxage=300, stale-while-revalidate=600" } },
  );
}
