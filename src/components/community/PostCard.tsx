import Link from "next/link";
import { CalendarDays, MapPin, MessageSquare } from "lucide-react";
import { Card } from "@/components/ui";
import { PostStatusBadge } from "@/components/community/PostStatusBadge";
import { Avatar } from "@/components/profile/Avatar";
import { VehicleImage } from "@/components/vehicle/VehicleImage";
import { postImageUrl, postKind, type LostPost } from "@/lib/community";
import { avatarUrl } from "@/lib/images";
import { cn } from "@/lib/cn";
import { formatDate, timeAgo } from "@/lib/format";
import { typeLabel } from "@/lib/types";

export type PostListItem = Pick<
  LostPost,
  | "id"
  | "author_name"
  | "kind"
  | "type"
  | "title"
  | "lost_area"
  | "lost_on"
  | "color"
  | "brand"
  | "model"
  | "image_bucket"
  | "image_path"
  | "status"
  | "comment_count"
  | "has_sticker"
  | "created_at"
>;

/** 커뮤니티 목록의 분실·발견 글 한 줄. avatarPath: 글쓴이 프로필 사진 (loadPostAvatars) */
export function PostCard({ post: p, avatarPath }: { post: PostListItem; avatarPath?: string | null }) {
  const resolved = p.status === "resolved";
  const kind = postKind(p.kind);
  const spec = [typeLabel(p.type), p.color, [p.brand, p.model].filter(Boolean).join(" ")].filter(Boolean).join(" · ");
  return (
    <Link href={`/community/${p.id}`} className="block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
      <Card className={cn("flex gap-4 p-3 transition-shadow hover:shadow-lift", resolved && "opacity-75")}>
        <VehicleImage src={postImageUrl(p)} type={p.type} alt={p.title} className="h-24 w-24 flex-none rounded-xl sm:h-28 sm:w-28" />
        <div className="min-w-0 flex-1 py-0.5">
          <div className="flex items-center gap-2">
            <PostStatusBadge status={p.status} kind={kind} />
            {p.has_sticker && (
              <span className="flex-none text-[12px] font-semibold text-brand-700" title="B-LOCK QR 스티커가 붙어 있어요">
                🏷️ 스티커
              </span>
            )}
            <span className="truncate text-[13px] text-ink-muted">{spec}</span>
          </div>
          <p className="mt-1.5 line-clamp-2 font-bold leading-snug text-ink">{p.title}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-muted">
            {p.lost_area && (
              <span className="flex min-w-0 items-center gap-1">
                <MapPin aria-hidden className="h-3.5 w-3.5 flex-none" />
                <span className="truncate">{p.lost_area}</span>
              </span>
            )}
            {p.lost_on && (
              <span className="flex items-center gap-1">
                <CalendarDays aria-hidden className="h-3.5 w-3.5" />
                {formatDate(p.lost_on).slice(5)} {kind === "found" ? "발견" : "분실"}
              </span>
            )}
          </div>
          <div className="mt-1.5 flex items-center gap-3 text-[13px] text-ink-faint">
            <span className="flex min-w-0 items-center gap-1.5">
              <Avatar src={avatarUrl(avatarPath)} name={p.author_name} className="h-5 w-5 text-[10px]" />
              <span className="truncate">
                {p.author_name} · {timeAgo(p.created_at)}
              </span>
            </span>
            <span className="ml-auto flex items-center gap-1 font-semibold text-ink-muted" aria-label={`댓글 ${p.comment_count}개`}>
              <MessageSquare aria-hidden className="h-3.5 w-3.5" />
              {p.comment_count}
            </span>
          </div>
        </div>
      </Card>
    </Link>
  );
}
