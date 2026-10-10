import { timingSafeEqual } from "crypto";

/**
 * 서버만 쓰는 비밀값 비교. 길이가 같을 때만 비교해요 (timingSafeEqual 은 길이가 다르면 오류).
 * 걸리는 시간으로 비밀값을 추측하지 못하게 해요. (/api/push, /api/cron/public-data)
 */
export function secretMatches(given: string | null, expected: string) {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
