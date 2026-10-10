/**
 * 공유 미리보기 이미지(카카오톡·문자 등) 공통 도구.
 * 이미지 생성기(Satori)에는 한글 글꼴이 없어서 Pretendard를 받아서 넘겨줘요.
 */

// woff(약 1.1MB): 이미지 생성기가 읽을 수 있는 형식 중 가장 작아요. (woff2는 지원 안 함)
const FONT_URL = "https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/web/static/woff/Pretendard-Bold.woff";
let fontPromise: Promise<ArrayBuffer> | null = null;

export function loadKoreanFont() {
  if (!fontPromise) {
    fontPromise = fetch(FONT_URL, { cache: "force-cache" }).then((r) => {
      if (!r.ok) throw new Error(`글꼴을 받지 못했어요 (${r.status})`);
      return r.arrayBuffer();
    });
    fontPromise.catch(() => {
      fontPromise = null; // 실패하면 다음 요청에서 다시 시도
    });
  }
  return fontPromise;
}

export async function ogFonts() {
  return [{ name: "Pretendard", data: await loadKoreanFont(), weight: 700 as const, style: "normal" as const }];
}

/** 원격 사진을 data URL로 (실패하면 null → 사진 없이 그림) */
export async function fetchAsDataUrl(url: string | null) {
  if (!url) return null;
  try {
    const r = await fetch(url, { cache: "force-cache" });
    if (!r.ok) return null;
    const type = r.headers.get("content-type") ?? "image/jpeg";
    // 이미지 생성기(Satori)는 webp를 못 읽어요. jpeg·png만 넣고 나머지는 사진 없이 그려요.
    if (!/^image\/(jpeg|png)/.test(type)) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    return `data:${type};base64,${buf.toString("base64")}`;
  } catch (e) {
    console.error("미리보기 사진을 받지 못했어요", e);
    return null;
  }
}

export const OG_SIZE = { width: 1200, height: 630 };

/** 로고 (앱 아이콘과 같은 자물쇠). hole은 뒤 배경색 */
export { LockLogo as BrandLogo } from "./logo";
