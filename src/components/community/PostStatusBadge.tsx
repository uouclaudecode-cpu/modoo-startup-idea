import { Search, ShieldCheck, UserSearch } from "lucide-react";
import { Badge } from "@/components/ui";
import { POST_KIND_META, type PostKind, type PostStatus } from "@/lib/community";

/** 찾는 중 / 찾았어요 (발견 글이면 주인 찾는 중 / 주인 찾았어요) */
export function PostStatusBadge({ status, kind = "lost" }: { status: PostStatus; kind?: PostKind }) {
  const label = POST_KIND_META[kind].status[status];
  return status === "open" ? (
    <Badge tone={kind === "found" ? "warning" : "danger"} icon={kind === "found" ? <UserSearch className="h-3.5 w-3.5" /> : <Search className="h-3.5 w-3.5" />}>
      {label}
    </Badge>
  ) : (
    <Badge tone="brand" icon={<ShieldCheck className="h-3.5 w-3.5" />}>
      {label}
    </Badge>
  );
}
