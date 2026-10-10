/**
 * B-LOCK 로고 (최종): 자물쇠 고리 + 알파벳 B 모양 몸통, B 안의 구멍 두 개는 뚫려 있어요.
 * 사용자가 준 그림(202×159)을 픽셀 단위로 재서 같은 비율로 그렸어요. 좌표도 그 그림 기준이에요.
 * 화면(HTML)과 이미지 생성기(앱 아이콘·공유 카드) 모두에서 쓰는 SVG예요.
 * 구멍은 진짜로 뚫려 있어서(evenodd) 어떤 배경 위에서도 배경이 비쳐 보여요.
 */
export const LOGO_BLUE = "#2742a8";

/** 그림 안 로고가 차지하는 칸 (가로 98 : 세로 136) */
const VB = { x: 53, y: 11.5, w: 98, h: 136 };

// B 바깥 윤곽(왼쪽 아래 → 왼쪽 위 → 위쪽 둥근 배 → 허리 → 아래쪽 둥근 배) + 구멍 두 개
const BODY =
  "M54 138V68Q54 60 62 60H127A20 20 0 0 1 137 97.3V100.7A24 24 0 0 1 126 146H62Q54 146 54 138Z" +
  "M87.75 76H113.25A9.75 9.75 0 0 1 113.25 95.5H87.75A9.75 9.75 0 0 1 87.75 76Z" +
  "M88.75 109H114.75A10.75 10.75 0 0 1 114.75 130.5H88.75A10.75 10.75 0 0 1 88.75 109Z";

export function LockLogo({ size = 64, color = LOGO_BLUE }: { size?: number; color?: string }) {
  return (
    <svg width={Math.round((size * VB.w) / VB.h)} height={size} viewBox={`${VB.x} ${VB.y} ${VB.w} ${VB.h}`} fill="none" aria-hidden>
      {/* 고리 (몸통과 살짝 떨어져 있어요) */}
      <path d="M74.8 56V45A27.1 27.1 0 0 1 129 45V56" stroke={color} strokeWidth={11.2} />
      {/* B 몸통 */}
      <path d={BODY} fill={color} fillRule="evenodd" />
    </svg>
  );
}
