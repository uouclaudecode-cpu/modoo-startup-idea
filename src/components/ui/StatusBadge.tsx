import { cn } from "@/lib/cn";
import { STATUS_META, type DisplayStatus } from "@/lib/status";

/** 상태 표시: 색 + 이모지 + 아이콘 + 글자 (색만으로 구분하지 않음) */
export function StatusBadge({ status, size = "md" }: { status: DisplayStatus; size?: "md" | "lg" }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex flex-none items-center gap-1.5 whitespace-nowrap rounded-full font-semibold ring-1 ring-inset",
        size === "lg" ? "px-3.5 py-1.5 text-sm" : "px-2.5 py-1 text-[13px]",
        meta.badge,
      )}
    >
      <Icon aria-hidden className={size === "lg" ? "h-4 w-4" : "h-3.5 w-3.5"} />
      {meta.label}
    </span>
  );
}
