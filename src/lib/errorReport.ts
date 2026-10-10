/**
 * 오류 알림 (034_app_errors.sql 의 report_app_error)
 * 사용자가 말하지 않아도 앱에서 난 오류를 운영자에게 모아 줘요. 회원 정보는 보내지 않아요.
 * 화면 주소에서 토큰·ID 같은 긴 값은 지우고, 물음표 뒤(검색어 등)도 보내지 않아요.
 */

/** 화면 주소에서 비밀 값 지우기: /t/긴토큰 → /t/:token, UUID → :id */
export function cleanPath(path: string) {
  const p = path.split(/[?#]/)[0] || "/";
  return p
    .split("/")
    .map((seg) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seg) ? ":id" : /^[A-Za-z0-9_-]{12,}$/.test(seg) ? ":token" : seg,
    )
    .join("/")
    .slice(0, 200);
}

/** 오류로 보지 않는 것: 브라우저 확장 프로그램, 화면 크기 감시 경고, 사용자가 취소한 요청, 인터넷 끊김 */
export function isNoise(message: string, stack?: string | null) {
  const m = message || "";
  return (
    /ResizeObserver loop|^Script error\.?$|AbortError|The user aborted|Load failed|Failed to fetch|NetworkError|cancelled|취소/i.test(m) ||
    /chrome-extension:|moz-extension:|safari-extension:/i.test(`${m} ${stack ?? ""}`) ||
    (typeof navigator !== "undefined" && navigator.onLine === false)
  );
}

export type ErrorPayload = { source: "client" | "server"; message: string; path?: string | null; stack?: string | null; userAgent?: string | null };

export function toRpcArgs(e: ErrorPayload) {
  return {
    p_source: e.source,
    p_message: (e.message || "알 수 없는 오류").slice(0, 500),
    p_path: e.path ? cleanPath(e.path) : null,
    p_stack: e.stack ? e.stack.slice(0, 2000) : null,
    p_user_agent: e.userAgent ? e.userAgent.slice(0, 300) : null,
  };
}
