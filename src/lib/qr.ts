/** QR에 들어가는 주소: {사이트}/scan/{무작위 토큰}. 개인정보나 사용자 ID는 넣지 않습니다. */
export function scanUrl(qrToken: string) {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || (typeof window !== "undefined" ? window.location.origin : "")).replace(/\/$/, "");
  return `${base}/scan/${qrToken}`;
}

/** QR 아래에 적는 조회 번호 (코드 앞 8자리, 4자리씩 띄어서). 도난 조회(/check)에 넣으면 돼요. */
export const lookupCode = (token: string) => `${token.slice(0, 4)} ${token.slice(4, 8)}`;

/** 스캔하거나 입력한 글자에서 QR 토큰만 꺼냅니다. (주소 전체 또는 토큰만 모두 허용) */
export function extractToken(text: string): string | null {
  const t = text.trim();
  const m = t.match(/\/scan\/([A-Za-z0-9_-]{16,})/);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{16,}$/.test(t) ? t : null;
}

/** 손으로 적은 조회 번호(QR 아래 8자리)를 띄어쓰기 없이 꺼냅니다. 조회 번호가 아니면 null */
export function extractLookupCode(text: string): string | null {
  const t = text.replace(/\s/g, "");
  return /^[A-Za-z0-9_-]{8}$/.test(t) ? t : null;
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/**
 * 스티커가 아닌 B-LOCK QR 주소 → 앱 안 화면 경로.
 * 안심거래 인증(/v/…) · 소유권 양도(/t/…) · 소유 증명서(/c/…) · 도난 경보(/alerts/…, 112 신고서에 인쇄)
 */
export function appLinkPath(text: string): string | null {
  const t = text.trim();
  const m = t.match(/\/(t|v|c)\/([A-Za-z0-9_-]{16,40})(?:[/?#]|$)/);
  if (m) return `/${m[1]}/${m[2]}`;
  const a = t.match(new RegExp(`/alerts/(${UUID})(?:[/?#]|$)`, "i"));
  if (a) return `/alerts/${a[1].toLowerCase()}`;
  return null;
}
