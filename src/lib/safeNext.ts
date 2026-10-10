/**
 * 로그인·가입 뒤 돌아갈 주소(next)를 우리 사이트 안 주소로만 제한해요. (다른 사이트로 보내는 열린 이동 방지)
 * '//다른사이트', '/\다른사이트', 탭·줄바꿈 같은 숨은 문자로 브라우저를 속이는 경우를 모두 막아요.
 */
export function safeNext(next: string | null | undefined, fallback = "/"): string {
  if (!next || typeof next !== "string") return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(next)) return fallback;
  try {
    const base = "https://b-lock.invalid";
    const url = new URL(next, base);
    if (url.origin !== base) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
