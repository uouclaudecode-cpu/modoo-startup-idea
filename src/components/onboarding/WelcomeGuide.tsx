import Link from "next/link";
import { Bell, Bike, Check, ChevronRight, MapPin, Printer, ScanLine, Tag } from "lucide-react";
import { Card } from "@/components/ui";
import { cn } from "@/lib/cn";

type GuideProps = { nickname: string; hasVehicle: boolean; hasSticker: boolean; hasPush: boolean; fresh: boolean; firstVehicleId?: string | null };

/** 안내가 보이는지: 등록과 스티커를 끝내면 숨겨요 (알림은 그 뒤에 PushPrompt 가 따로 권해요) */
export function welcomeGuideVisible({ hasVehicle, hasSticker, fresh }: Pick<GuideProps, "hasVehicle" | "hasSticker" | "fresh">) {
  return fresh || !(hasVehicle && hasSticker);
}

/**
 * 처음 시작하는 사람을 위한 안내: 해야 할 일을 순서대로, 끝낸 일은 체크로 보여줘요.
 * QR 붙이기는 스티커 연결·붙인 위치 기록·앱 QR 출력 중 하나면 끝난 것으로 봐요.
 * hasPush: 내 계정에 알림 받는 기기가 하나라도 있으면 '알림 켜기'를 끝낸 것으로 봐요.
 */
export function WelcomeGuide({ nickname, hasVehicle, hasSticker, hasPush, fresh, firstVehicleId = null }: GuideProps) {
  if (!welcomeGuideVisible({ hasVehicle, hasSticker, fresh })) return null;
  const doneCount = [hasVehicle, hasSticker, hasPush].filter(Boolean).length;
  const current = !hasVehicle ? 0 : !hasSticker ? 1 : !hasPush ? 2 : -1;
  const printHref = firstVehicleId ? `/vehicles/${firstVehicleId}/qr/print` : "/vehicles/new";

  return (
    <Card className="space-y-3 bg-gradient-to-br from-brand-50 to-white">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-bold">{fresh ? `환영해요, ${nickname}님! 🎉` : "시작하기"}</p>
          <p className="text-[13px] text-ink-muted">이 3단계만 하면 잃어버렸을 때 찾을 준비가 끝나요.</p>
        </div>
        <span className="flex-none rounded-full bg-white px-2.5 py-1 text-[13px] font-bold tabular-nums text-brand-700 ring-1 ring-brand-200">{doneCount}/3</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white ring-1 ring-brand-100" aria-hidden>
        <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${(doneCount / 3) * 100}%` }} />
      </div>
      <ol className="space-y-1.5">
        <Step n={1} done={hasVehicle} active={current === 0} icon={Bike} title="이동수단 등록" text="사진과 특징을 넣으면 QR 신분증이 만들어져요." href="/vehicles/new" />
        <li>
          <div className={cn("rounded-xl p-2.5", current === 1 && "bg-white ring-1 ring-brand-200", hasSticker && "opacity-60")}>
            <div className="flex items-center gap-3">
              <Bullet n={2} done={hasSticker} />
              <span className="min-w-0 flex-1">
                <span className={cn("flex items-center gap-1.5 font-semibold", hasSticker && "line-through")}>
                  <Tag aria-hidden className="h-4 w-4 text-brand-600" />
                  QR 붙이기
                </span>
                <span className="block text-[13px] leading-snug text-ink-muted">출력한 QR은 바로 붙이면 되고, 받은 스티커는 한 번 찍어서 연결한 뒤 붙여요. 주인만 아는 곳에 숨겨 주세요.</span>
              </span>
            </div>
            {hasVehicle && !hasSticker && (
              <div className="mt-2.5 grid gap-1.5 sm:grid-cols-3">
                <MiniLink href={printHref} icon={Printer} label="크기 골라 출력하기" primary />
                <MiniLink href="/get-sticker" icon={MapPin} label="스티커 받는 곳" />
                <MiniLink href="/scan" icon={ScanLine} label="받은 스티커 연결" />
              </div>
            )}
          </div>
        </li>
        <Step n={3} done={hasPush} active={current === 2} icon={Bell} title="알림 켜기" text="누가 내 QR로 제보하거나 메시지를 보내면 바로 알려 드려요." href="/settings#push" />
      </ol>
    </Card>
  );
}

function Bullet({ n, done }: { n: number; done: boolean }) {
  return (
    <span
      className={cn(
        "grid h-9 w-9 flex-none place-items-center rounded-full text-sm font-bold",
        done ? "bg-emerald-500 text-white" : "bg-white text-brand-700 ring-1 ring-brand-200",
      )}
    >
      {done ? <Check aria-label="완료" className="h-4 w-4" /> : n}
    </span>
  );
}

function Step({ n, done, active, icon: Icon, title, text, href }: { n: number; done: boolean; active: boolean; icon: typeof Bike; title: string; text: string; href: string }) {
  return (
    <li>
      <Link href={href} className={cn("flex items-center gap-3 rounded-xl p-2.5 hover:bg-white", active && "bg-white ring-1 ring-brand-200", done && "opacity-60")}>
        <Bullet n={n} done={done} />
        <span className="min-w-0 flex-1">
          <span className={cn("flex items-center gap-1.5 font-semibold", done && "line-through")}>
            <Icon aria-hidden className="h-4 w-4 text-brand-600" />
            {title}
          </span>
          <span className="block text-[13px] leading-snug text-ink-muted">{text}</span>
        </span>
        <ChevronRight aria-hidden className="h-4 w-4 flex-none text-ink-faint" />
      </Link>
    </li>
  );
}

function MiniLink({ href, icon: Icon, label, primary }: { href: string; icon: typeof Bike; label: string; primary?: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex h-11 items-center justify-center gap-1.5 rounded-xl px-3 text-[15px] font-semibold ring-1 ring-inset",
        primary ? "bg-brand-600 text-white ring-brand-600" : "bg-white text-ink ring-line hover:bg-slate-50",
      )}
    >
      <Icon aria-hidden className="h-4 w-4" />
      {label}
    </Link>
  );
}
