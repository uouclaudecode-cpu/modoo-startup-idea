/**
 * B-LOCK 로고: 파란 자물쇠 + 가운데 동그라미(QR 스캔 표시)
 * 화면(HTML)과 이미지 생성기(앱 아이콘·공유 카드) 모두에서 쓰는 SVG예요.
 * hole: 자물쇠 몸통 안 동그라미 색 (보통 뒤 배경색과 같게)
 */
export const LOGO_BLUE = "#2549d6";

export function LockLogo({ size = 64, color = LOGO_BLUE, hole = "#ffffff" }: { size?: number; color?: string; hole?: string }) {
  return (
    <svg width={Math.round((size * 100) / 112)} height={size} viewBox="0 0 100 112" fill="none" aria-hidden>
      {/* 고리 */}
      <path d="M25.8 50V35a24.2 24.2 0 0 1 48.4 0v15" stroke={color} strokeWidth={10.6} />
      {/* 몸통 */}
      <rect x="11" y="45" width="78" height="65" rx="13" fill={color} />
      {/* 가운데 동그라미와 점 */}
      <circle cx="50" cy="77.5" r="22.5" stroke={hole} strokeWidth={3.6} />
      <circle cx="50" cy="77.5" r="5" fill={hole} />
    </svg>
  );
}
