import Link from "next/link";
import { Bell, Bike, Check, ChevronRight, Tag } from "lucide-react";
import { Card } from "@/components/ui";
import { cn } from "@/lib/cn";

type Step = { done: boolean; icon: typeof Bike; title: string; text: string; href: string };

/**
 * 처음 시작하는 사람을 위한 안내: 해야 할 일을 순서대로, 끝낸 일은 체크로 보여줘요.
 * 모두 끝내면 보이지 않아요.
 */
export function WelcomeGuide({ nickname, hasVehicle, hasSticker, fresh }: { nickname: string; hasVehicle: boolean; hasSticker: boolean; fresh: boolean }) {
  const steps: Step[] = [
    { done: hasVehicle, icon: Bike, title: "이동수단 등록", text: "사진과 특징을 등록하면 QR 신분증이 만들어져요.", href: "/vehicles/new" },
    { done: hasSticker, icon: Tag, title: "QR 스티커 붙이기", text: "받은 스티커를 찍어 연결하거나, 앱 QR을 출력해 주인만 아는 곳에 붙여요.", href: hasVehicle ? "/scan" : "/vehicles/new" },
    { done: false, icon: Bell, title: "알림 켜기", text: "누가 내 자전거를 찍으면 바로 알려드려요.", href: "/settings" },
  ];
  if (!fresh && hasVehicle && hasSticker) return null;
  return (
    <Card className="space-y-3 bg-gradient-to-br from-brand-50 to-white">
      <div>
        <p className="font-bold">{fresh ? `환영해요, ${nickname}님! 🎉` : "시작하기"}</p>
        <p className="text-[13px] text-ink-muted">이 순서대로 하면 잃어버렸을 때 찾을 준비가 끝나요.</p>
      </div>
      <ol className="space-y-1.5">
        {steps.map((s, i) => (
          <li key={s.title}>
            <Link href={s.href} className={cn("flex items-center gap-3 rounded-xl p-2.5 hover:bg-white", s.done && "opacity-60")}>
              <span
                className={cn(
                  "grid h-9 w-9 flex-none place-items-center rounded-full text-sm font-bold",
                  s.done ? "bg-emerald-500 text-white" : "bg-white text-brand-700 ring-1 ring-brand-200",
                )}
              >
                {s.done ? <Check aria-label="완료" className="h-4 w-4" /> : i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn("block font-semibold", s.done && "line-through")}>{s.title}</span>
                <span className="block text-[13px] leading-snug text-ink-muted">{s.text}</span>
              </span>
              <ChevronRight aria-hidden className="h-4 w-4 flex-none text-ink-faint" />
            </Link>
          </li>
        ))}
      </ol>
    </Card>
  );
}
