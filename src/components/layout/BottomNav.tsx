"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, MessagesSquare, Route, ScanLine, UserRound } from "lucide-react";
import { cn } from "@/lib/cn";

const TABS = [
  { href: "/", label: "홈", icon: Home, match: (p: string) => p === "/" },
  { href: "/community", label: "커뮤니티", icon: MessagesSquare, match: (p: string) => p.startsWith("/community") },
  // 가운데: 가장 자주 쓰는 QR 스캔을 크게
  { href: "/scan", label: "QR 스캔", icon: ScanLine, match: (p: string) => p.startsWith("/scan"), primary: true },
  { href: "/ride", label: "라이딩", icon: Route, match: (p: string) => p.startsWith("/ride") },
  {
    href: "/dashboard",
    label: "MY",
    icon: UserRound,
    match: (p: string) => ["/dashboard", "/vehicles", "/settings", "/stickers", "/admin"].some((x) => p.startsWith(x)),
  },
];

/** 휴대폰 화면 아래쪽 메뉴 (앱처럼 한 손으로 이동). 넓은 화면에서는 숨깁니다. */
export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="주요 메뉴"
      className="fixed inset-x-0 bottom-0 z-40 print:hidden border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden"
    >
      <ul className="mx-auto grid h-16 max-w-md grid-cols-5">
        {TABS.map((t) => {
          const active = t.match(pathname);
          if (t.primary) {
            return (
              <li key={t.href} className="flex justify-center">
                <Link
                  href={t.href}
                  aria-current={active ? "page" : undefined}
                  className="-mt-5 flex flex-col items-center gap-1 text-[11px] font-bold text-brand-700"
                >
                  <span
                    className={cn(
                      "grid h-14 w-14 place-items-center rounded-full bg-brand-600 text-white shadow-lift ring-4 ring-white transition-transform active:scale-95",
                      active && "bg-brand-700",
                    )}
                  >
                    <t.icon aria-hidden className="h-6 w-6" strokeWidth={2.4} />
                  </span>
                  {t.label}
                </Link>
              </li>
            );
          }
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-semibold",
                  active ? "text-brand-700" : "text-ink-muted",
                )}
              >
                <span className={cn("grid h-8 w-12 place-items-center rounded-full transition-colors", active && "bg-brand-50")}>
                  <t.icon aria-hidden className="h-5 w-5" strokeWidth={active ? 2.4 : 2} />
                </span>
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
