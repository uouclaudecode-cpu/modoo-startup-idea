import { cn } from "@/lib/cn";

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="불러오는 중"
      className={cn("inline-block h-5 w-5 animate-spin rounded-full border-2 border-current border-r-transparent", className)}
    />
  );
}

/** 화면 일부가 불러오는 중일 때 */
export function Loading({ text = "불러오는 중..." }: { text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-ink-muted">
      <Spinner className="h-7 w-7 text-brand-600" />
      <p className="text-sm">{text}</p>
    </div>
  );
}
