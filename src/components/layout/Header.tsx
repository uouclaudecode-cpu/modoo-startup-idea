import Link from "next/link";
import { LogOut, MessagesSquare, QrCode, ShieldCheck } from "lucide-react";
import { site } from "@/config/site";
import { buttonClass } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { getUser } from "@/lib/supabase/server";

/**
 * 모든 화면 위쪽에 고정되는 머리글. 로그인 여부에 따라 메뉴가 바뀝니다.
 * 휴대폰에서는 커뮤니티·QR 스캔·내 이동수단이 아래 메뉴(BottomNav)로 갑니다.
 */
export async function Header() {
  const user = await getUser().catch(() => null);
  return (
    <header className="sticky top-0 z-40 print:hidden border-b border-line/80 bg-white/90 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="mx-auto flex h-14 max-w-3xl items-center gap-1 px-4">
        <Link href="/" aria-label={`${site.name} 홈`} className="mr-auto flex items-center gap-2 whitespace-nowrap font-extrabold tracking-tight text-ink">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white">
            <ShieldCheck aria-hidden className="h-5 w-5" />
          </span>
          {site.name}
        </Link>
        <Link href="/community" className={cn(buttonClass("ghost"), "hidden h-10 px-2.5 text-sm sm:inline-flex")}>
          <MessagesSquare aria-hidden className="h-4 w-4" />
          커뮤니티
        </Link>
        <Link href="/scan" className={cn(buttonClass("ghost"), "hidden h-10 px-2.5 text-sm sm:inline-flex")}>
          <QrCode aria-hidden className="h-4 w-4" />
          QR 스캔
        </Link>
        {user ? (
          <>
            <Link href="/dashboard" className={cn(buttonClass("secondary"), "hidden h-10 px-3 text-sm sm:inline-flex")}>
              내 이동수단
            </Link>
            <form action="/auth/signout" method="post">
              <button type="submit" className={cn(buttonClass("ghost"), "h-10 gap-1.5 px-2.5 text-sm")} aria-label="로그아웃" title="로그아웃">
                <LogOut aria-hidden className="h-4 w-4" />
                <span className="sm:hidden">로그아웃</span>
              </button>
            </form>
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
