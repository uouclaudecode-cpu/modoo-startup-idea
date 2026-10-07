import { ImageResponse } from "next/og";
import { site } from "@/config/site";
import { OG_SIZE, ogFonts, ShieldLogo } from "@/lib/ogImage";

export const alt = `${site.name} · ${site.tagline}`;
export const size = OG_SIZE;
export const contentType = "image/png";

/** 사이트 주소를 공유할 때 보이는 기본 미리보기 */
export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: "linear-gradient(135deg, #2552e8 0%, #1e37a5 100%)",
          color: "#ffffff",
          fontFamily: "Pretendard",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ display: "flex", width: 96, height: 96, borderRadius: 24, background: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" }}>
            <ShieldLogo size={64} />
          </div>
          <div style={{ fontSize: 56 }}>{site.name}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: 68, lineHeight: 1.2 }}>내 자전거에 디지털 신분증을</div>
          <div style={{ fontSize: 34, opacity: 0.85 }}>QR 스티커로 등록하고, 잃어버리면 주변 사람의 발견 제보를 받아요</div>
        </div>
        <div style={{ display: "flex", gap: 16, fontSize: 28 }}>
          {["QR 디지털 신분증", "분실 커뮤니티", "라이딩·정비 기록"].map((t) => (
            <div key={t} style={{ display: "flex", padding: "10px 22px", borderRadius: 999, background: "rgba(255,255,255,0.15)" }}>
              {t}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts: await ogFonts() },
  );
}
