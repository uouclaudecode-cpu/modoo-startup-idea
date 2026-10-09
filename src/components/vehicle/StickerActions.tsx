import Link from "next/link";
import { ChevronRight, MapPin, Printer, ScanLine } from "lucide-react";
import { cn } from "@/lib/cn";

type Tile = { href: string; icon: typeof Printer; title: string; text: string; primary?: boolean };

/**
 * QR 스티커 준비하기: 출력 · 받는 곳 (· 스티커 연결)
 * 홈과 MY에서 같은 모양으로 크게 보여 줘요. 글자가 잘리지 않게 칸마다 두 줄을 넉넉히 둬요.
 */
export function StickerActions({ withLink = false, title = "QR 스티커 준비하기", className }: { withLink?: boolean; title?: string; className?: string }) {
  const tiles: Tile[] = [
    { href: "/print", icon: Printer, title: "QR 출력하기", text: "1.5cm~A4, 크기 골라 집·편의점에서", primary: true },
    { href: "/get-sticker", icon: MapPin, title: "스티커 받는 곳", text: "가까운 곳에서 무료로 받기" },
  ];
  if (withLink) tiles.push({ href: "/scan", icon: ScanLine, title: "받은 스티커 연결", text: "스티커 QR을 찍어 내 것으로" });

  return (
    <section aria-label={title} className={cn("space-y-2.5", className)}>
      <div className="px-1">
        <h2 className="text-lg font-bold tracking-tight">{title}</h2>
        <p className="text-[13px] text-ink-muted">QR을 붙여 둬야 찾은 사람이 주인에게 알려 줄 수 있어요.</p>
      </div>
      <div className={cn("grid gap-2.5", withLink ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2")}>
        {tiles.map((t, i) => (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "group flex min-h-[124px] flex-col justify-between rounded-2xl p-4 transition-shadow",
              t.primary ? "bg-gradient-to-br from-brand-600 to-brand-700 text-white shadow-lift" : "bg-white shadow-card ring-1 ring-line/70 hover:shadow-lift",
              withLink && i === 2 && "col-span-2 min-h-0 sm:col-span-1 sm:min-h-[124px]",
            )}
          >
            <span
              aria-hidden
              className={cn("grid h-11 w-11 flex-none place-items-center rounded-xl", t.primary ? "bg-white/15 text-white" : "bg-brand-50 text-brand-600")}
            >
              <t.icon className="h-6 w-6" />
            </span>
            <span className="mt-3 block min-w-0">
              <span className="flex items-center gap-1 text-[16px] font-bold leading-snug">
                {t.title}
                <ChevronRight aria-hidden className={cn("h-4 w-4 flex-none", t.primary ? "text-white/70" : "text-ink-faint")} />
              </span>
              <span className={cn("mt-0.5 block text-[13px] leading-snug", t.primary ? "text-brand-50/90" : "text-ink-muted")}>{t.text}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
