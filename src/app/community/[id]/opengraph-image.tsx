import { ImageResponse } from "next/og";
import { createClient } from "@supabase/supabase-js";
import { site } from "@/config/site";
import { postImageUrl, UUID_RE, type LostPost } from "@/lib/community";
import { formatDate } from "@/lib/format";
import { fetchAsDataUrl, OG_SIZE, ogFonts, ShieldLogo } from "@/lib/ogImage";
import { supabaseEnv } from "@/lib/supabase/env";
import { typeLabel } from "@/lib/types";

export const alt = "B-LOCK 분실 글";
export const size = OG_SIZE;
export const contentType = "image/png";

type Row = Pick<LostPost, "title" | "type" | "color" | "brand" | "model" | "lost_area" | "lost_on" | "status" | "image_bucket" | "image_path">;

/**
 * 분실 글을 카카오톡 등에 공유할 때 보이는 카드: 사진 + 찾는 중/찾았어요 + 제목 + 잃어버린 곳.
 * 공개 글 정보만 쓰므로 로그인 없는 공개 키로 읽어요.
 */
export default async function PostOgImage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let post: Row | null = null;
  if (UUID_RE.test(id)) {
    const { url, key } = supabaseEnv();
    const supabase = createClient(url, key, { auth: { persistSession: false } });
    const { data, error } = await supabase
      .from("lost_posts")
      .select("title, type, color, brand, model, lost_area, lost_on, status, image_bucket, image_path")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) console.error(error);
    post = data as Row | null;
  }
  const photo = post ? await fetchAsDataUrl(postImageUrl(post)) : null;
  const open = post?.status !== "resolved";
  const spec = post ? [typeLabel(post.type), post.color, [post.brand, post.model].filter(Boolean).join(" ")].filter(Boolean).join(" · ") : "";

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#ffffff", fontFamily: "Pretendard", color: "#0f172a" }}>
        {/* 왼쪽: 사진 */}
        <div style={{ width: 520, height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#e2e8f0" }}>
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element -- 이미지 생성기 안에서는 기본 img만 쓸 수 있어요
            <img src={photo} alt="" width={520} height={630} style={{ width: 520, height: 630, objectFit: "cover" }} />
          ) : (
            <ShieldLogo size={180} color="#94a3b8" />
          )}
        </div>
        {/* 오른쪽: 글 정보 */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "56px 56px 48px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 28, color: "#2552e8" }}>
              <div style={{ display: "flex", width: 48, height: 48, borderRadius: 12, background: "#2552e8", alignItems: "center", justifyContent: "center" }}>
                <ShieldLogo size={32} />
              </div>
              {site.name} 분실 커뮤니티
            </div>
            {post && (
              <div
                style={{
                  display: "flex",
                  alignSelf: "flex-start",
                  padding: "8px 20px",
                  borderRadius: 999,
                  fontSize: 30,
                  background: open ? "#fff1f2" : "#eef4ff",
                  color: open ? "#be123c" : "#1d41cc",
                }}
              >
                {open ? "찾는 중" : "찾았어요"}
              </div>
            )}
            <div style={{ display: "flex", fontSize: 50, lineHeight: 1.25, maxHeight: 190, overflow: "hidden" }}>
              {post ? post.title : "삭제되었거나 없는 글이에요"}
            </div>
            {spec && <div style={{ display: "flex", fontSize: 30, color: "#475569" }}>{spec}</div>}
            {post?.lost_area && (
              <div style={{ display: "flex", fontSize: 30, color: "#334155" }}>
                잃어버린 곳: {post.lost_area}
                {post.lost_on ? ` · ${formatDate(post.lost_on).slice(5)}` : ""}
              </div>
            )}
          </div>
          <div style={{ display: "flex", fontSize: 28, color: "#64748b" }}>{open ? "보셨다면 댓글로 알려 주세요" : "주인이 찾았어요. 도와주셔서 고마워요!"}</div>
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: await ogFonts(),
      // 찾았어요·숨김·삭제가 몇 분 안에 미리보기에도 반영되도록 짧게 캐시
      headers: { "cache-control": "public, max-age=0, s-maxage=300, stale-while-revalidate=600" },
    },
  );
}
