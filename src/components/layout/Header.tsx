import Link from "next/link";
import { Sparkles } from "lucide-react";
import { site } from "@/config/site";
import { buttonClass } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

/** 모든 화면 위쪽에 고정되는 머리글. 메뉴는 src/config/site.ts 의 nav 에서 바꿉니다. */
export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-3xl items-center gap-1 px-4">
        <Link href="/" className="mr-auto flex items-center gap-2 font-extrabold tracking-tight text-ink">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white">
            <Sparkles aria-hidden className="h-4 w-4" />
          </span>
          {site.name}
        </Link>
        <nav className="hidden items-center gap-1 sm:flex" aria-label="주요 메뉴">
          {site.nav.map((item) => (
            <Link key={item.href} href={item.href} className={cn(buttonClass("ghost"), "h-10 px-3 text-sm")}>
              {item.label}
            </Link>
          ))}
        </nav>
        <Link href="/#start" className={cn(buttonClass("primary"), "ml-1 h-10 px-4 text-sm")}>
          시작하기
        </Link>
      </div>
    </header>
  );
}
