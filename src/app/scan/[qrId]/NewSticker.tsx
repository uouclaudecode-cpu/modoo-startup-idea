import { Bike, EyeOff, ScanLine, Tag } from "lucide-react";
import { site } from "@/config/site";
import { ButtonLink, Card } from "@/components/ui";

/** 아직 등록하지 않은 새 B-LOCK 스티커를 찍었을 때 */
export function NewSticker({ code }: { code: string }) {
  const steps = [
    { icon: Bike, text: "내 자전거·킥보드를 고르거나 새로 등록해요." },
    { icon: EyeOff, text: "주인만 아는 곳(안장 밑, 체인 덮개 안쪽 등)에 스티커를 붙이고 위치를 적어 둬요." },
    { icon: ScanLine, text: "잃어버리면 누군가 이 스티커를 찍었을 때 위치·사진이 나에게 와요." },
  ];
  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="rounded-3xl bg-gradient-to-br from-brand-600 to-brand-800 p-6 text-white shadow-lift">
        <Tag aria-hidden className="h-9 w-9" />
        <h1 className="mt-3 text-2xl font-extrabold leading-snug">🎉 새 {site.name} 스티커예요!</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-brand-50">아직 아무 이동수단에도 등록되지 않았어요. 내 자전거에 등록하고 붙여 주세요.</p>
        <ButtonLink href={`/stickers/${encodeURIComponent(code)}`} variant="light" size="lg" full className="mt-5" icon={<Bike aria-hidden className="h-5 w-5" />}>
          내 자전거에 등록하기
        </ButtonLink>
      </div>
      <Card className="space-y-3">
        <p className="font-bold">이렇게 써요</p>
        <ol className="space-y-3">
          {steps.map((s, i) => (
            <li key={i} className="flex items-start gap-3 text-[15px] leading-relaxed">
              <span className="grid h-8 w-8 flex-none place-items-center rounded-lg bg-brand-50 text-brand-600">
                <s.icon aria-hidden className="h-4 w-4" />
              </span>
              {s.text}
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
