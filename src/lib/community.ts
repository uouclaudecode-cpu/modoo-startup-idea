import type { SupabaseClient } from "@supabase/supabase-js";
import { publicImageUrl, vehicleImageUrl } from "./images";
import type { VehicleType } from "./types";

export type PostStatus = "open" | "resolved";
/** 글 종류: 잃어버린 사람이 올린 글 / 발견한 사람이 주인을 찾는 글 */
export type PostKind = "lost" | "found";

export type LostPost = {
  id: string;
  author_id: string;
  author_name: string;
  /** 잃어버렸어요(lost) / 주인을 찾아요(found). 예전 글은 모두 lost */
  kind: PostKind;
  vehicle_id: string | null;
  type: VehicleType;
  title: string;
  body: string;
  lost_area: string | null;
  lost_on: string | null;
  /** 지도에서 고른 잃어버린 위치 (선택) */
  lost_lat: number | null;
  lost_lng: number | null;
  brand: string | null;
  model: string | null;
  color: string | null;
  image_bucket: "vehicle-images" | "community-images" | null;
  image_path: string | null;
  status: PostStatus;
  comment_count: number;
  has_sticker: boolean;
  deleted_at: string | null;
  /** 신고가 쌓였거나 관리자가 숨긴 시각. 숨긴 글은 글쓴이·관리자에게만 보여요. */
  hidden_at: string | null;
  /** 글쓴이가 내용을 고친 시각 (updated_at 은 댓글 수가 바뀔 때도 바뀌어요) */
  edited_at: string | null;
  created_at: string;
  updated_at: string;
};

/** get_post_comments 결과. 볼 수 없는 비밀 댓글은 내용·위치·사진이 비어 있어요. */
export type PostComment = {
  id: string;
  parent_id: string | null;
  author_name: string;
  is_secret: boolean;
  can_view: boolean;
  is_mine: boolean;
  is_post_author: boolean;
  body: string | null;
  latitude: number | null;
  longitude: number | null;
  location_text: string | null;
  image_path: string | null;
  created_at: string;
  /** 숨긴 댓글은 쓴 사람·관리자에게만 와요 (그 외에는 늘 null) */
  hidden_at: string | null;
};

export const POST_STATUS_META: Record<PostStatus, { label: string; emoji: string }> = {
  open: { label: "찾는 중", emoji: "🔴" },
  resolved: { label: "찾았어요", emoji: "🔵" },
};

/** 글 종류별 문구 (발견 글은 '잃어버린 곳' 대신 '발견한 곳') */
export const POST_KIND_META: Record<PostKind, { label: string; place: string; day: string; status: Record<PostStatus, string> }> = {
  lost: { label: "잃어버렸어요", place: "잃어버린 곳", day: "잃어버린 날", status: { open: "찾는 중", resolved: "찾았어요" } },
  found: { label: "주인을 찾아요", place: "발견한 곳", day: "발견한 날", status: { open: "주인 찾는 중", resolved: "주인 찾았어요" } },
};

/** 예전 글이나 kind 가 없는 응답도 '잃어버렸어요'로 봐요 */
export function postKind(kind: string | null | undefined): PostKind {
  return kind === "found" ? "found" : "lost";
}

/** 목록에서 쓰는 열 (본문 전체는 상세에서만) */
export const POST_LIST_COLUMNS =
  "id, author_name, kind, type, title, lost_area, lost_on, color, brand, model, image_bucket, image_path, status, comment_count, has_sticker, created_at";

export function postImageUrl(p: Pick<LostPost, "image_bucket" | "image_path">) {
  if (!p.image_path) return null;
  return p.image_bucket === "vehicle-images" ? vehicleImageUrl(p.image_path) : publicImageUrl("community-images", p.image_path);
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 글 ID → 글쓴이 프로필 사진 경로 (032_community_avatars.sql). 실패하면 빈 값이라 사진 없이 보여요. */
export async function loadPostAvatars(supabase: SupabaseClient, postIds: string[]): Promise<Record<string, string>> {
  // 한 번에 100개씩 (데이터베이스 함수가 100개까지 받아요)
  const chunks: string[][] = [];
  for (let i = 0; i < postIds.length; i += 100) chunks.push(postIds.slice(i, i + 100));
  const results = await Promise.all(chunks.map((ids) => supabase.rpc("post_author_avatars", { p_post_ids: ids })));
  const out: Record<string, string> = {};
  for (const { data, error } of results) {
    if (error) console.error(error);
    else Object.assign(out, data ?? {});
  }
  return out;
}

/** 댓글 ID → 댓글 쓴 사람 프로필 사진 경로 */
export async function loadCommentAvatars(supabase: SupabaseClient, postId: string): Promise<Record<string, string>> {
  const { data, error } = await supabase.rpc("post_comment_avatars", { p_post: postId });
  if (error) {
    console.error(error);
    return {};
  }
  return (data ?? {}) as Record<string, string>;
}
