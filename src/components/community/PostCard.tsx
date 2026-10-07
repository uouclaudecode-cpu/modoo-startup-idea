import Link from "next/link";
import { CalendarDays, MapPin, MessageSquare } from "lucide-react";
import { Card } from "@/components/ui";
import { PostStatusBadge } from "@/components/community/PostStatusBadge";
import { VehicleImage } from "@/components/vehicle/VehicleImage";
import { postImageUrl, type LostPost } from "@/lib/community";
import { cn } from "@/lib/cn";
import { formatDate, timeAgo } from "@/lib/format";
import { typeLabel } from "@/lib/types";

export type PostListItem = Pick<
  LostPost,
  | "id"
  | "author_name"
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
  | "created_at"
>;

/** 커뮤니티 목록의 분실 글 한 줄 */
export function PostCard({ post: p }: { post: PostListItem }) {
  const resolved = p.status === "resolved";
  const spec = [typeLabel(p.type), p.color, [p.brand, p.model].filter(Boolean).join(" ")].filter(Boolean).join(" · ");
  return (
    <Link href={`/community/${p.id}`} className="block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
      <Card className={cn("flex gap-4 p-3 transition-shadow hover:shadow-lift", resolved && "opacity-75")}>
        <VehicleImage src={postImageUrl(p)} type={p.type} alt={p.title} className="h-24 w-24 flex-none rounded-xl sm:h-28 sm:w-28" />
        <div className="min-w-0 flex-1 py-0.5">
          <div className="flex items-center gap-2">
            <PostStatusBadge status={p.status} />
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
                {formatDate(p.lost_on).slice(5)} 분실
              </span>
            )}
          </div>
          <div className="mt-1.5 flex items-center gap-3 text-[13px] text-ink-faint">
            <span>
              {p.author_name} · {timeAgo(p.created_at)}
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
