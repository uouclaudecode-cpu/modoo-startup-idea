import { ImageResponse } from "next/og";
import { LockLogo } from "./logo";

/**
 * 앱 아이콘 파일 이름 뒤에 붙는 버전 (/icons/icon-192-v2.png).
 * 아이콘 그림을 바꾸면 올려 주세요. 이 파일들은 1년 동안 저장(immutable)돼서, 주소가 바뀌어야 휴대폰이 새 그림을 받아요.
 * public/sw.js 의 ICON도 같이 바꿔 주세요.
 */
export const ICON_V = "v2";

/**
 * 앱 아이콘 그림 (흰 바탕 + 파란 자물쇠). 이미지 파일 없이 코드로 그려서 PNG로 내보냅니다.
 * maskable: 안드로이드가 동그랗게 잘라도 그림이 남도록 여백을 넓게, 모서리는 둥글리지 않음.
 */
export function appIconResponse(size: number, { maskable = false, rounded = true } = {}) {
  const glyph = Math.round(size * (maskable ? 0.52 : 0.66));
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#ffffff",
          borderRadius: maskable || !rounded ? 0 : Math.round(size * 0.22),
        }}
      >
        <LockLogo size={glyph} />
      </div>
    ),
    { width: size, height: size },
  );
}
