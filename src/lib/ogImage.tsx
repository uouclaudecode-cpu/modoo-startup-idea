/**
 * 공유 미리보기 이미지(카카오톡·문자 등) 공통 도구.
 * 이미지 생성기(Satori)에는 한글 글꼴이 없어서 Pretendard를 받아서 넘겨줘요.
 */

const FONT_URL = "https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/public/static/Pretendard-Bold.otf";
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
    if (!/^image\/(jpeg|png|webp)/.test(type)) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    return `data:${type};base64,${buf.toString("base64")}`;
  } catch (e) {
    console.error("미리보기 사진을 받지 못했어요", e);
    return null;
  }
}

export const OG_SIZE = { width: 1200, height: 630 };

/** 방패 체크 로고 (앱 아이콘과 같은 모양) */
export function ShieldLogo({ size = 64, color = "#ffffff" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}
