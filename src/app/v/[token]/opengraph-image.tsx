import { ImageResponse } from "next/og";
import { createClient } from "@supabase/supabase-js";
import { vehicleImageUrl } from "@/lib/images";
import { OgCard } from "@/lib/ogCard";
import { fetchAsDataUrl, OG_SIZE, ogFonts } from "@/lib/ogImage";
import { supabaseEnv } from "@/lib/supabase/env";
import { durationLabel, type TradeVerification } from "@/lib/trade";
import { typeLabel } from "@/lib/types";

export const alt = "B-LOCK 안심거래 인증";
export const size = OG_SIZE;
export const contentType = "image/png";

/** 안심거래 링크를 카카오톡·중고거래 채팅에 붙였을 때 보이는 카드: '도난 이력 없음' 같은 핵심만 */
export default async function VerifyOgImage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let d: TradeVerification = { valid: false, reason: "not_found" };
  if (/^[A-Za-z0-9_-]{16,40}$/.test(token)) {
    const { url, key } = supabaseEnv();
    const supabase = createClient(url, key, { auth: { persistSession: false } });
    const { data, error } = await supabase.rpc("get_trade_preview", { p_token: token });
    if (error) console.error(error);
    else d = data as TradeVerification;
  }
  const photo = d.valid ? await fetchAsDataUrl(vehicleImageUrl(d.vehicle.image_path)) : null;
  const clear = d.valid && d.searching_count === 0;
  return new ImageResponse(
    (
      <OgCard
        photo={photo}
        header="B-LOCK 안심거래 인증"
        badge={!d.valid ? (d.reason === "flagged" ? "도난 신고 중 · 거래 주의" : "확인할 수 없는 링크") : clear ? "도난 이력 없음" : "회수된 이력 있음"}
        badgeColor={d.valid ? (clear ? "#047857" : "#c2410c") : "#be123c"}
        badgeBg={d.valid ? (clear ? "#ecfdf5" : "#fff7ed") : "#fff1f2"}
        title={d.valid ? [d.vehicle.color, d.vehicle.brand, d.vehicle.model].filter(Boolean).join(" ") || typeLabel(d.vehicle.type) : "인증 정보를 확인하세요"}
        lines={
          d.valid
            ? [
                `등록 소유자 확인 · 보유 ${durationLabel(d.owned_since)}`,
                `차대번호 ${d.serial_last4 ? "등록" : "미등록"} · 양도 ${d.transfer_count}회 · 정비 기록 ${d.maintenance_count}건`,
              ]
            : []
        }
        footer="눌러서 확인 코드와 자세한 이력을 보세요"
      />
    ),
    { ...OG_SIZE, fonts: await ogFonts(), headers: { "cache-control": "public, max-age=0, s-maxage=300, stale-while-revalidate=600" } },
  );
}
