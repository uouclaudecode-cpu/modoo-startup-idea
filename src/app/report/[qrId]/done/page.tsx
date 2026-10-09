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
        <h1 className="text-2xl font-extrabold">{contact ? "메시지를 보냈어요" : "제보를 보냈어요"}</h1>
        <p className="text-[15px] leading-relaxed text-ink-soft">
          {contact ? "메시지가 주인에게만 전달됐어요." : "발견 정보가 주인에게만 전달됐어요."} 도와주셔서 고마워요!
        </p>
        <ButtonLink href="/" full variant="secondary">
          홈으로
        </ButtonLink>
      </Card>
    </div>
  );
}
