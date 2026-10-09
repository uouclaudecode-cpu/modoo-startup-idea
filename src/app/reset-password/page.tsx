import type { Metadata } from "next";
import { cookies } from "next/headers";
import { KeyRound } from "lucide-react";
import { ButtonLink, Card, ErrorState } from "@/components/ui";
import { getUser } from "@/lib/supabase/server";
import { RECOVERY_COOKIE } from "@/app/auth/recovery";
import { ResetPasswordForm } from "./ResetPasswordForm";

export const metadata: Metadata = { title: "새 비밀번호 정하기", robots: { index: false } };

/**
 * 비밀번호 찾기 메일의 링크로 들어오면(로그인된 상태) 새 비밀번호를 정해요.
 * 메일 링크로 들어온 표시가 없으면(주소로 바로 들어왔거나 1시간이 지났거나 이미 한 번 바꾼 경우)
 * 설정 화면처럼 지금 비밀번호를 먼저 확인하고, 기억나지 않으면 비밀번호 찾기로 가는 길을 보여줘요.
 */
export default async function ResetPasswordPage() {
  const [user, cookieStore] = await Promise.all([getUser(), cookies()]);
  if (!user) {
    return (
      <div className="mx-auto max-w-md">
        <ErrorState
          title="링크가 만료됐거나 잘못됐어요"
          description="비밀번호 찾기를 다시 해서 새 링크를 받아 주세요."
          action={
            <ButtonLink href="/forgot-password" full>
              비밀번호 찾기
            </ButtonLink>
          }
        />
      </div>
    );
  }
  const fromMail = cookieStore.get(RECOVERY_COOKIE)?.value === user.id;
  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-600">
          <KeyRound aria-hidden className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">새 비밀번호 정하기</h1>
          <p className="text-sm text-ink-muted">{user.email}</p>
        </div>
      </div>
      {!fromMail && (
        // 비밀번호를 잊어서 온 사람이 '지금 비밀번호'에서 막히지 않게, 왜 묻는지와 다른 길을 알려줘요
        <div className="space-y-3 rounded-xl bg-amber-50 px-3 py-3 text-sm leading-relaxed text-amber-900">
          <p>
            메일 링크로 들어온 지 1시간이 지났거나 주소로 바로 들어와서, 본인 확인을 위해 지금 쓰는 비밀번호를 먼저 물어봐요.
            {" 비밀번호가 기억나지 않으면 '비밀번호 찾기'로 메일을 다시 받고, 같은 휴대폰·브라우저에서 그 메일의 링크를 눌러 주세요."}
          </p>
          <ButtonLink href="/forgot-password" variant="secondary" full>
            비밀번호 찾기
          </ButtonLink>
        </div>
      )}
      <Card>
        <ResetPasswordForm fromMail={fromMail} />
      </Card>
    </div>
  );
}
