import { BadgeCheck, HandHeart, ShieldAlert, TriangleAlert, UserRound } from "lucide-react";
import type { Trust } from "@/lib/alerts";
import { durationLabel } from "@/lib/trade";

/** 제보자·댓글 쓴 사람의 신뢰 정보 (본인인증·도와준 횟수·가입 기간·허위 표시) */
export function TrustInfo({ trust, anonymous = false }: { trust?: Trust | null; anonymous?: boolean }) {
  if (anonymous || !trust) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[12px] font-semibold text-ink-muted">
        <UserRound aria-hidden className="h-3.5 w-3.5" />
        비로그인 제보 · 신원 확인 불가
      </span>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-1.5 text-[12px] font-semibold">
      {trust.identity_verified ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
          <BadgeCheck aria-hidden className="h-3.5 w-3.5" />
          본인인증 완료
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-ink-muted">
          <UserRound aria-hidden className="h-3.5 w-3.5" />
          본인인증 안 됨
        </span>
      )}
      <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-brand-700 ring-1 ring-inset ring-brand-600/20">
        <HandHeart aria-hidden className="h-3.5 w-3.5" />
        {trust.helped_count > 0 ? `${trust.helped_count}번 도와줬어요` : "도운 기록 없음"}
      </span>
      <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-ink-muted">가입 {durationLabel(trust.member_since)}</span>
      {trust.false_count > 0 && (
        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-rose-700 ring-1 ring-inset ring-rose-600/20">
          <ShieldAlert aria-hidden className="h-3.5 w-3.5" />
          허위 제보 {trust.false_count}번
        </span>
      )}
    </span>
  );
}

/** 돈을 먼저 요구하는 글 경고 + 그 사람의 신뢰 정보 */
export function MoneyWarning({ trust, anonymous = false }: { trust?: Trust | null; anonymous?: boolean }) {
  return (
    <div role="alert" className="space-y-2 rounded-xl bg-orange-50 p-3 text-[13px] leading-relaxed text-orange-900 ring-1 ring-orange-200">
      <p className="flex items-start gap-2 font-semibold">
        <TriangleAlert aria-hidden className="mt-0.5 h-4 w-4 flex-none" />
        돈·계좌·연락처를 먼저 요구하면 사기일 수 있어요. 물건을 직접 확인하기 전에는 돈을 보내지 마세요.
      </p>
      {(trust || anonymous) && (
        <div className="pl-6">
          <TrustInfo trust={trust} anonymous={anonymous} />
        </div>
      )}
    </div>
  );
}
