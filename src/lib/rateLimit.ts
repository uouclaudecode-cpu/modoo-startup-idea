/** 같은 곳(IP)에서 정해진 시간 안에 너무 많이 부르면 막기 (서버 한 대 기준, 가벼운 보호) */
export function rateLimiter(limit: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return function tooMany(req: Request) {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    const now = Date.now();
    const list = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
    list.push(now);
    hits.set(ip, list);
    if (hits.size > 5000) hits.clear();
    return list.length > limit;
  };
}
