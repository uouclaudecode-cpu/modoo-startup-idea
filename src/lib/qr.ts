/** QR에 들어가는 주소: {사이트}/scan/{무작위 토큰}. 개인정보나 사용자 ID는 넣지 않습니다. */
export function scanUrl(qrToken: string) {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || (typeof window !== "undefined" ? window.location.origin : "")).replace(/\/$/, "");
  return `${base}/scan/${qrToken}`;
}

/** 스캔하거나 입력한 글자에서 QR 토큰만 꺼냅니다. (주소 전체 또는 토큰만 모두 허용) */
export function extractToken(text: string): string | null {
  const t = text.trim();
  const m = t.match(/\/scan\/([A-Za-z0-9_-]{16,})/);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{16,}$/.test(t) ? t : null;
}
