import { ImageResponse } from "next/og";

/**
 * 앱 아이콘 그림 (파란 바탕 + 방패 체크). 이미지 파일 없이 코드로 그려서 PNG로 내보냅니다.
 * maskable: 안드로이드가 동그랗게 잘라도 그림이 남도록 여백을 넓게, 모서리는 둥글리지 않음.
 */
export function appIconResponse(size: number, { maskable = false, rounded = true } = {}) {
  const glyph = Math.round(size * (maskable ? 0.5 : 0.62));
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #3b6cf6 0%, #1d3fc4 100%)",
          borderRadius: maskable || !rounded ? 0 : Math.round(size * 0.22),
        }}
      >
        <svg width={glyph} height={glyph} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      </div>
    ),
    { width: size, height: size },
  );
}
