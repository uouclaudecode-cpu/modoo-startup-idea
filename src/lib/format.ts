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

/** 방금 전 / 5분 전 / 3시간 전 / 2일 전, 일주일이 넘으면 날짜 */
export function timeAgo(iso: string, now = Date.now()) {
  const sec = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (sec < 60) return "방금 전";
  if (sec < 3600) return `${Math.floor(sec / 60)}분 전`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}시간 전`;
  if (sec < 86400 * 7) return `${Math.floor(sec / 86400)}일 전`;
  return formatDate(iso);
}

/** Supabase 오류를 사용자에게 보여줄 문장으로 */
export function friendlyError(err: unknown, fallback: string) {
  if (typeof navigator !== "undefined" && !navigator.onLine) return "인터넷 연결을 확인해 주세요.";
  const msg = err instanceof Error ? err.message : typeof err === "object" && err && "message" in err ? String((err as { message: unknown }).message) : "";
  if (/fetch|network/i.test(msg)) return "인터넷 연결을 확인해 주세요.";
  // 데이터베이스가 보낸 한국어 안내는 그대로
  if (/[가-힣]/.test(msg)) return msg;
  return fallback;
}
