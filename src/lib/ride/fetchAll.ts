/**
 * Supabase(PostgREST)는 한 번에 최대 1,000줄만 돌려줘요.
 * 누적 거리·배지는 기록이 하나라도 빠지면 틀리기 때문에, 1,000줄씩 나눠서 끝까지 받아요.
 * 부르는 쪽은 정렬이 겹치지 않는 열(started_at: 사람마다 겹치지 않음)로 order를 걸어야 해요.
 */
const PAGE_SIZE = 1000;
/** 안전장치: 아무리 많아도 이만큼만 (5만 건) */
const MAX_PAGES = 50;

type PageResult<T> = { data: T[] | null; error: unknown };

export async function fetchAllPages<T>(page: (from: number, to: number) => PromiseLike<PageResult<T>>): Promise<{ data: T[]; error: unknown }> {
  const all: T[] = [];
  for (let i = 0; i < MAX_PAGES; i++) {
    const from = i * PAGE_SIZE;
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) return { data: all, error };
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return { data: all, error: null };
}
