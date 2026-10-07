import Link from "next/link";
import { LogOut, QrCode, ShieldCheck } from "lucide-react";
import { site } from "@/config/site";
import { buttonClass } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { getUser } from "@/lib/supabase/server";

/** 모든 화면 위쪽에 고정되는 머리글. 로그인 여부에 따라 메뉴가 바뀝니다. */
export async function Header() {
  const user = await getUser().catch(() => null);
  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-3xl items-center gap-1 px-4">
        <Link href={user ? "/dashboard" : "/"} className="mr-auto flex items-center gap-2 whitespace-nowrap font-extrabold tracking-tight text-ink">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white">
            <ShieldCheck aria-hidden className="h-5 w-5" />
          </span>
          {site.name}
        </Link>
        <Link href="/scan" className={cn(buttonClass("ghost"), "h-10 px-2.5 text-sm")} aria-label="QR 스캔">
          <QrCode aria-hidden className="h-4 w-4" />
          {/* 아주 좁은 화면에서는 아이콘만 */}
          <span className="hidden min-[380px]:inline">QR 스캔</span>
        </Link>
        {user ? (
          <>
            <Link href="/dashboard" className={cn(buttonClass("secondary"), "h-10 px-3 text-sm")}>
              내 이동수단
            </Link>
            <form action="/auth/signout" method="post">
              <button type="submit" className={cn(buttonClass("ghost"), "h-10 w-10 px-0")} aria-label="로그아웃" title="로그아웃">
                <LogOut aria-hidden className="h-4 w-4" />
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
