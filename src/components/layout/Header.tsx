import Link from "next/link";
import { MessagesSquare, QrCode, Route } from "lucide-react";
import { LockLogo } from "@/lib/logo";
import { site } from "@/config/site";
import { buttonClass } from "@/components/ui/Button";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { cn } from "@/lib/cn";
import { loadViewer } from "@/lib/viewer";

/**
 * 모든 화면 위쪽에 고정되는 머리글. 로그인 여부에 따라 메뉴가 바뀝니다.
 * 휴대폰에서는 커뮤니티·QR 스캔·내 이동수단이 아래 메뉴(BottomNav)로 갑니다.
 * 로그인했으면 알림함(종)에 안 읽은 알림 수를 보여 줘요.
 */
export async function Header() {
  const { user, unread } = await loadViewer().catch(() => ({ user: null, unread: 0 }));
  return (
    <header className="sticky top-0 z-40 print:hidden border-b border-line/80 bg-white/90 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="mx-auto flex h-14 max-w-3xl items-center gap-1 px-4">
        <Link href="/" aria-label={`${site.name} 홈`} className="mr-auto flex items-center gap-2 whitespace-nowrap text-lg font-extrabold tracking-tight text-ink">
          <LockLogo size={38} />
          {site.name}
        </Link>
        <Link href="/community" className={cn(buttonClass("ghost"), "hidden h-10 px-2.5 text-sm sm:inline-flex")}>
          <MessagesSquare aria-hidden className="h-4 w-4" />
          커뮤니티
        </Link>
        <Link href="/ride" className={cn(buttonClass("ghost"), "hidden h-10 px-2.5 text-sm sm:inline-flex")}>
          <Route aria-hidden className="h-4 w-4" />
          라이딩
        </Link>
        <Link href="/scan" className={cn(buttonClass("ghost"), "hidden h-10 px-2.5 text-sm sm:inline-flex")}>
          <QrCode aria-hidden className="h-4 w-4" />
          QR 스캔
        </Link>
        {user ? (
          <>
            {/* 설정은 MY 맨 위 내 정보 카드의 ⚙️ 한 곳에만 둬요 (휴대폰은 아래 메뉴의 MY) */}
            <Link href="/dashboard" className={cn(buttonClass("secondary"), "hidden h-10 px-3 text-sm sm:inline-flex")}>
              MY
            </Link>
            <NotificationBell initialCount={unread} />
          </>
        ) : (
          <Link href="/login" className={cn(buttonClass("primary"), "h-10 px-4 text-sm")}>
            로그인
          </Link>
        )}
      </div>
    </header>
  );
}
