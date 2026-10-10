import { BrandLogo } from "@/lib/ogImage";

/** 공유 카드 공통 틀: 왼쪽 사진 + 오른쪽 배지·제목·설명 (이미지 생성기 전용 스타일) */
export function OgCard({
  photo,
  header,
  badge,
  badgeColor,
  badgeBg,
  title,
  lines,
  footer,
}: {
  photo: string | null;
  header: string;
  badge: string;
  badgeColor: string;
  badgeBg: string;
  title: string;
  lines: string[];
  footer: string;
}) {
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", background: "#ffffff", fontFamily: "Pretendard", color: "#0f172a" }}>
      <div style={{ width: 520, height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#e2e8f0" }}>
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element -- 이미지 생성기 안에서는 기본 img만 쓸 수 있어요
          <img src={photo} alt="" width={520} height={630} style={{ width: 520, height: 630, objectFit: "cover" }} />
        ) : (
          <BrandLogo size={180} color="#94a3b8" hole="#e2e8f0" />
        )}
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "56px 56px 48px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 28, color: "#2552e8" }}>
            <div style={{ display: "flex", width: 48, height: 48, borderRadius: 12, background: "#2552e8", alignItems: "center", justifyContent: "center" }}>
              <BrandLogo size={32} color="#ffffff" hole="#2552e8" />
            </div>
            {header}
          </div>
          <div style={{ display: "flex", alignSelf: "flex-start", padding: "10px 24px", borderRadius: 999, fontSize: 34, background: badgeBg, color: badgeColor }}>{badge}</div>
          <div style={{ display: "flex", fontSize: 50, lineHeight: 1.25, maxHeight: 130, overflow: "hidden" }}>{title}</div>
          {lines.filter(Boolean).map((l, i) => (
            <div key={i} style={{ display: "flex", fontSize: 30, color: "#475569", maxHeight: 80, overflow: "hidden" }}>
              {l}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", fontSize: 28, color: "#64748b" }}>{footer}</div>
      </div>
    </div>
  );
}
