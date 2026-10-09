import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CircleAlert, CircleCheck } from "lucide-react";
import { ButtonLink, Card } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import type { TransferPeek } from "@/lib/trade";
import { AcceptTransfer } from "./AcceptTransfer";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "소유권 받기", robots: { index: false, follow: false } };

const TOKEN = /^[A-Za-z0-9_-]{16,40}$/;

const MESSAGES: Record<string, string> = {
  not_found: "양도 QR을 찾을 수 없어요. 판매자 화면의 QR을 다시 찍어 주세요.",
  self: "내가 만든 양도 QR이에요. 구매자의 휴대폰으로 찍어야 해요.",
  cancelled: "판매자가 양도를 취소했어요.",
  expired: "양도 QR·링크의 시간이 지났어요. 판매자에게 다시 만들어 달라고 해 주세요.",
};

export default async function ReceivePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/t/${token}`)}`);

  let peek: TransferPeek = { status: "not_found" };
  if (TOKEN.test(token)) {
    const { data, error } = await supabase.rpc("peek_transfer", { p_token: token });
    if (error) {
      console.error(error);
      return <Card className="mx-auto max-w-md text-center">양도 정보를 불러오지 못했어요. 잠시 후 새로고침해 주세요.</Card>;
    }
    peek = data as TransferPeek;
  }

  if (peek.status === "completed") {
    return (
      <Card className="mx-auto flex max-w-md flex-col items-center gap-3 py-10 text-center">
        <CircleCheck aria-hidden className="h-12 w-12 text-emerald-600" />
        <p className="text-xl font-extrabold">{peek.mine ? "이미 받은 이동수단이에요" : "이미 처리된 양도예요"}</p>
        <ButtonLink href="/dashboard" full>
          MY로 가기
        </ButtonLink>
      </Card>
    );
  }

  if (peek.status !== "pending") {
    return (
      <Card className="mx-auto flex max-w-md flex-col items-center gap-3 py-10 text-center">
        <CircleAlert aria-hidden className="h-12 w-12 text-ink-muted" />
        <p className="text-[15px] leading-relaxed text-ink-soft">{MESSAGES[peek.status]}</p>
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">소유권 받기</h1>
        <p className="mt-1 text-[15px] text-ink-muted">{peek.seller}님이 이동수단을 넘기려고 해요.</p>
      </div>
      <AcceptTransfer token={token} peek={peek} />
    </div>
  );
}
