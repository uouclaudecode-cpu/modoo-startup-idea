import { cn } from "@/lib/cn";
import { Skeleton, SkeletonScreen, SkeletonText } from "./Skeleton";

/** 버튼 안에서만 쓰는 작은 인라인 스피너 (제출 대기) */
export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="처리 중"
      className={cn("inline-block h-5 w-5 animate-spin rounded-full border-2 border-current border-r-transparent", className)}
    />
  );
}

/** 화면 일부가 불러오는 중일 때: 스피너 대신 스켈레톤으로 보여줍니다. */
export function Loading({ text = "불러오는 중" }: { text?: string }) {
  return (
    <SkeletonScreen label={text} className="space-y-4 rounded-2xl bg-white p-5 shadow-card ring-1 ring-line/70">
      <Skeleton className="h-5 w-1/3" />
      <SkeletonText lines={3} />
    </SkeletonScreen>
  );
}
