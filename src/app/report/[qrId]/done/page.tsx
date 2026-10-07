import type { Metadata } from "next";
import { CircleCheck } from "lucide-react";
import { ButtonLink, Card } from "@/components/ui";

export const metadata: Metadata = { title: "제보 완료", robots: { index: false } };

export default async function ReportDonePage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const { kind } = await searchParams;
  const contact = kind === "contact";
  return (
    <div className="mx-auto max-w-md">
      <Card className="space-y-4 p-8 text-center">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-50 text-emerald-600">
          <CircleCheck aria-hidden className="h-9 w-9" />
        </span>
        <h1 className="text-2xl font-extrabold">✅ {contact ? "메시지가 전달되었습니다." : "제보가 접수되었습니다."}</h1>
        <p className="text-[15px] leading-relaxed text-ink-soft">
          {contact ? "소유자에게 메시지가 전달되었습니다." : "소유자에게 발견 정보가 전달되었습니다."} 도와주셔서 고마워요!
        </p>
        <ButtonLink href="/" full variant="secondary">
          홈으로
        </ButtonLink>
      </Card>
    </div>
  );
}
