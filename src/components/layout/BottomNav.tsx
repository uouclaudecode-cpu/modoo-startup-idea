"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bike, Home, MessagesSquare, ScanLine } from "lucide-react";
import { cn } from "@/lib/cn";

const TABS = [
  { href: "/", label: "홈", icon: Home, match: (p: string) => p === "/" },
  { href: "/community", label: "커뮤니티", icon: MessagesSquare, match: (p: string) => p.startsWith("/community") },
  { href: "/scan", label: "QR 스캔", icon: ScanLine, match: (p: string) => p.startsWith("/scan") },
  { href: "/dashboard", label: "내 이동수단", icon: Bike, match: (p: string) => p.startsWith("/dashboard") || p.startsWith("/vehicles") },
];

/** 휴대폰 화면 아래쪽 메뉴 (앱처럼 한 손으로 이동). 넓은 화면에서는 숨깁니다. */
export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="주요 메뉴"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden"
    >
      <ul className="mx-auto grid h-16 max-w-md grid-cols-4">
        {TABS.map((t) => {
          const active = t.match(pathname);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-full flex-col items-center justify-center gap-1 text-[11px] font-semibold",
                  active ? "text-brand-600" : "text-ink-muted",
                )}
              >
                <t.icon aria-hidden className="h-5 w-5" strokeWidth={active ? 2.4 : 2} />
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
