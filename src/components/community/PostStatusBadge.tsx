import { Search, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui";
import type { PostStatus } from "@/lib/community";

export function PostStatusBadge({ status }: { status: PostStatus }) {
  return status === "open" ? (
    <Badge tone="danger" icon={<Search className="h-3.5 w-3.5" />}>
      찾는 중
    </Badge>
  ) : (
    <Badge tone="brand" icon={<ShieldCheck className="h-3.5 w-3.5" />}>
      찾았어요
    </Badge>
  );
}
