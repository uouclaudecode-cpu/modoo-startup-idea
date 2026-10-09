"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, MessagesSquare, Route, ScanLine, UserRound } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * 주소가 이 경로들 중 하나이거나 그 아래 화면인지.
 * 글자 앞부분만 비교하면 "/r"가 "/ride"·"/report"까지 잡아서, 경로 단위로 비교해요.
 */
const under = (p: string, paths: string[]) => paths.some((x) => p === x || p.startsWith(`${x}/`));

// 탭마다 그 탭에서 이어지는 화면도 함께 켜져요 (어느 메뉴에 있는지 놓치지 않게)
const TABS = [
  // 홈 → 도난 다발 지도·통계
  { href: "/", label: "홈", icon: Home, match: (p: string) => p === "/" || under(p, ["/stats"]) },
  // 커뮤니티 → 근처 도난 경보
  { href: "/community", label: "커뮤니티", icon: MessagesSquare, match: (p: string) => under(p, ["/community", "/alerts"]) },
  // 가운데: 가장 자주 쓰는 QR 스캔을 크게. 스캔·조회 번호로 들어오는 화면(제보, 익명 대화, 도난 조회, 인증 링크)도 여기
  {
    href: "/scan",
    label: "QR 스캔",
    icon: ScanLine,
    match: (p: string) => under(p, ["/scan", "/check", "/report", "/r", "/t", "/v", "/c"]),
    primary: true,
  },
  { href: "/ride", label: "라이딩", icon: Route, match: (p: string) => under(p, ["/ride", "/rides"]) },
  {
    href: "/dashboard",
    label: "MY",
    icon: UserRound,
    match: (p: string) => under(p, ["/dashboard", "/vehicles", "/settings", "/stickers", "/admin", "/notifications"]),
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
