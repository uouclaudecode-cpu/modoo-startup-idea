import { isNoise, toRpcArgs } from "@/lib/errorReport";

export function register() {}

/**
 * 서버에서 화면·API를 만들다 오류가 나면 운영자 오류 알림으로 보내요. (Next.js가 불러 줘요)
 * 로그인하지 않은 상태로 보내므로 회원 정보는 들어가지 않아요. 실패해도 응답에는 영향이 없어요.
 */
export async function onRequestError(err: unknown, request: { path: string; method: string; headers: Record<string, string | string[] | undefined> }) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) return;
    const e = err as { message?: string; stack?: string; digest?: string };
    const message = `${e.message ?? String(err)}${e.digest ? ` (digest ${e.digest})` : ""}`;
    // 로그인 화면으로 보내기·없는 화면 같은 정상 흐름은 오류가 아니에요
    if (/NEXT_REDIRECT|NEXT_NOT_FOUND|NEXT_HTTP_ERROR_FALLBACK|DYNAMIC_SERVER_USAGE/.test(message) || isNoise(message, e.stack)) return;
    const ua = request.headers["user-agent"];
    await fetch(`${url}/rest/v1/rpc/report_app_error`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(toRpcArgs({ source: "server", message: `[${request.method}] ${message}`, path: request.path, stack: e.stack, userAgent: Array.isArray(ua) ? ua[0] : ua })),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    /* 오류 알림 때문에 또 오류가 나지 않게 */
  }
}
