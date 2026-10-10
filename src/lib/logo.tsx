/**
 * B-LOCK 로고: 파란 자물쇠, 몸통 가운데에 흰 테두리 + 하얗게 뚫린 원 + 파란 점
 * 사용자가 준 그림(244×287)을 픽셀 단위로 재서 같은 비율로 그렸어요. 좌표도 그 그림 기준이에요.
 * 화면(HTML)과 이미지 생성기(앱 아이콘·공유 카드) 모두에서 쓰는 SVG예요.
 * hole: 몸통 안 흰 부분 색 (보통 흰색, 어두운 배경 위에서는 배경색)
 */
export const LOGO_BLUE = "#2047c8";

const VB = { x: 27, y: 19, w: 184, h: 251 };

export function LockLogo({ size = 64, color = LOGO_BLUE, hole = "#ffffff" }: { size?: number; color?: string; hole?: string }) {
  return (
    <svg width={Math.round((size * VB.w) / VB.h)} height={size} viewBox={`${VB.x} ${VB.y} ${VB.w} ${VB.h}`} fill="none" aria-hidden>
      {/* 고리 */}
      <path d="M72.5 106V76a46.5 46.5 0 0 1 93 0v30" stroke={color} strokeWidth={21.5} />
      {/* 몸통 */}
      <rect x="27" y="104" width="184" height="166" rx="20" fill={color} />
      {/* 흰 테두리 */}
      <circle cx="119" cy="186" r="64.5" stroke={hole} strokeWidth={9} />
      {/* 하얗게 뚫린 원 */}
      <circle cx="119" cy="186" r="56" fill={hole} />
      {/* 가운데 점 */}
      <circle cx="119" cy="186" r="10" fill={color} />
    </svg>
  );
}
