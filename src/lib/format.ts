/** 2026.10.06 19:43 형식 (한국 시간) */
export function formatDateTime(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  const k = new Date(d.getTime() + 9 * 3600e3);
  return `${k.getUTCFullYear()}.${p(k.getUTCMonth() + 1)}.${p(k.getUTCDate())} ${p(k.getUTCHours())}:${p(k.getUTCMinutes())}`;
}

export function formatDate(iso: string) {
  return formatDateTime(iso).slice(0, 10);
}

/** Supabase 오류를 사용자에게 보여줄 문장으로 */
export function friendlyError(err: unknown, fallback: string) {
  if (typeof navigator !== "undefined" && !navigator.onLine) return "인터넷 연결을 확인해주세요.";
  const msg = err instanceof Error ? err.message : typeof err === "object" && err && "message" in err ? String((err as { message: unknown }).message) : "";
  if (/fetch|network/i.test(msg)) return "인터넷 연결을 확인해주세요.";
  // 데이터베이스가 보낸 한국어 안내는 그대로
  if (/[가-힣]/.test(msg)) return msg;
  return fallback;
}
