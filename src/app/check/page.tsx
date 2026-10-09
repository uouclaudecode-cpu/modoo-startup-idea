import type { Metadata } from "next";
import { CheckForm } from "./CheckForm";

export const metadata: Metadata = {
  title: "중고 구매 전 도난 조회",
  description: "자전거·킥보드를 사기 전에 QR이나 차대번호로 도난 신고 여부를 무료로 확인하세요.",
  openGraph: { title: "B-LOCK 도난 조회 · 사기 전에 확인하세요" },
};

export default async function CheckPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  return (
    <div className="mx-auto max-w-md space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">🔍 도난 조회</h1>
        <p className="mt-1 text-[15px] leading-relaxed text-ink-muted">
          중고 자전거·킥보드를 사기 전에 확인하세요. 직거래 현장에서도, 채팅으로 받은 번호로도 돼요. 로그인 없이 무료예요.
        </p>
      </div>
      <CheckForm initial={typeof q === "string" ? q.slice(0, 300) : ""} />
    </div>
  );
}
