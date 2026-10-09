/** 로그인 없는 발견자가 보낸 제보의 대화 열쇠를 이 기기에만 보관해요 (서버에는 해시만 있어요). */
const KEY = "b-lock:finder-threads";

export type FinderThreadRef = { token: string; createdAt: string; label: string };

export function loadFinderThreads(): FinderThreadRef[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]") as FinderThreadRef[];
    const cutoff = Date.now() - 15 * 86400e3;
    return raw.filter((t) => t && typeof t.token === "string" && new Date(t.createdAt).getTime() > cutoff);
  } catch {
    return [];
  }
}

export function saveFinderThread(ref: FinderThreadRef) {
  try {
    const list = [ref, ...loadFinderThreads().filter((t) => t.token !== ref.token)].slice(0, 20);
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // 저장소를 못 쓰는 환경이면 화면의 링크로만 다시 들어올 수 있어요
  }
}
