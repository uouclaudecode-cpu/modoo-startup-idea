import type { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";
import { supabaseEnv } from "@/lib/supabase/env";

const BASE = process.env.NEXT_PUBLIC_SITE_URL || "https://b-lock-app.vercel.app";

// 1시간마다 다시 만들어요 (새 분실 글이 검색에 잡히도록)
export const revalidate = 3600;

/** 검색엔진용 주소 목록: 공개 화면 + 최근 '찾는 중' 분실 글 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const fixed: MetadataRoute.Sitemap = [
    { url: `${BASE}/`, changeFrequency: "daily", priority: 1 },
    { url: `${BASE}/community`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${BASE}/check`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE}/get-sticker`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${BASE}/alerts`, changeFrequency: "hourly", priority: 0.8 },
    { url: `${BASE}/stats`, changeFrequency: "daily", priority: 0.6 },
    { url: `${BASE}/contact`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${BASE}/terms`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${BASE}/privacy`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${BASE}/location-terms`, changeFrequency: "yearly", priority: 0.2 },
  ];
  try {
    const { url, key } = supabaseEnv();
    const supabase = createClient(url, key, { auth: { persistSession: false } });
    const { data, error } = await supabase
      .from("lost_posts")
      .select("id, updated_at")
      .is("deleted_at", null)
      .eq("status", "open")
      .order("updated_at", { ascending: false })
      .limit(500);
    if (error) throw error;
    return [...fixed, ...(data ?? []).map((p) => ({ url: `${BASE}/community/${p.id}`, lastModified: p.updated_at, changeFrequency: "daily" as const, priority: 0.7 }))];
  } catch (e) {
    // 글 목록을 못 불러와도 고정 주소는 내보내요 (빌드·검색엔진 요청이 실패하지 않게)
    console.error("사이트맵 글 목록을 불러오지 못했어요", e);
    return fixed;
  }
}
