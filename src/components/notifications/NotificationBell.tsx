"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { cn } from "@/lib/cn";
import { createClient } from "@/lib/supabase/client";

/**
 * 머리글의 종 모양 알림함 버튼 + 안 읽은 알림 수.
 * 처음 숫자는 서버가 그려 주고, 화면을 옮기거나 앱으로 돌아올 때마다 다시 세요. (알림함을 연 뒤 숫자가 바로 사라지게)
 */
export function NotificationBell({ initialCount }: { initialCount: number }) {
  const pathname = usePathname();
  const [count, setCount] = useState(initialCount);
  const first = useRef(true);

  useEffect(() => setCount(initialCount), [initialCount]);

  const refresh = useCallback(async () => {
    const { count: n, error } = await createClient().from("notifications").select("id", { count: "exact", head: true }).is("read_at", null);
    if (!error) setCount(n ?? 0);
  }, []);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    refresh();
  }, [pathname, refresh]);

  useEffect(() => {
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  const here = pathname.startsWith("/notifications");
  const shown = here ? 0 : count;
  return (
    <Link
      href="/notifications"
      aria-label={shown > 0 ? `알림함, 안 읽은 알림 ${shown}개` : "알림함"}
      aria-current={here ? "page" : undefined}
      className={cn(
        "relative ml-1 grid h-10 w-10 flex-none place-items-center rounded-full text-ink-soft transition-colors hover:bg-slate-100 active:bg-slate-200",
        here && "bg-slate-100 text-ink",
      )}
    >
      <Bell aria-hidden className="h-5 w-5" />
      {shown > 0 && (
        <span
          aria-hidden
          className="absolute right-0.5 top-0.5 h-[18px] min-w-[18px] rounded-full bg-rose-600 px-1 text-center text-[11px] font-bold leading-[18px] text-white ring-2 ring-white tabular-nums"
        >
          {shown > 9 ? "9+" : shown}
        </span>
      )}
    </Link>
  );
}
