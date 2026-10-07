import { publicImageUrl, vehicleImageUrl } from "./images";
import type { VehicleType } from "./types";

export type PostStatus = "open" | "resolved";

export type LostPost = {
  id: string;
  author_id: string;
  author_name: string;
  vehicle_id: string | null;
  type: VehicleType;
  title: string;
  body: string;
  lost_area: string | null;
  lost_on: string | null;
  brand: string | null;
  model: string | null;
  color: string | null;
  image_bucket: "vehicle-images" | "community-images" | null;
  image_path: string | null;
  status: PostStatus;
  comment_count: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

/** get_post_comments 결과. 볼 수 없는 비밀 댓글은 내용·위치·사진이 비어 있어요. */
export type PostComment = {
  id: string;
  author_name: string;
  is_secret: boolean;
  can_view: boolean;
  is_mine: boolean;
  body: string | null;
  latitude: number | null;
  longitude: number | null;
  location_text: string | null;
  image_path: string | null;
  created_at: string;
};

export const POST_STATUS_META: Record<PostStatus, { label: string; emoji: string }> = {
  open: { label: "찾는 중", emoji: "🔴" },
  resolved: { label: "찾았어요", emoji: "🔵" },
};

/** 목록에서 쓰는 열 (본문 전체는 상세에서만) */
export const POST_LIST_COLUMNS =
  "id, author_name, type, title, lost_area, lost_on, color, brand, model, image_bucket, image_path, status, comment_count, created_at";

export function postImageUrl(p: Pick<LostPost, "image_bucket" | "image_path">) {
  if (!p.image_path) return null;
  return p.image_bucket === "vehicle-images" ? vehicleImageUrl(p.image_path) : publicImageUrl("community-images", p.image_path);
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
