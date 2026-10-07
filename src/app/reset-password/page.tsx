import type { Metadata } from "next";
import { KeyRound } from "lucide-react";
import { ButtonLink, Card, ErrorState } from "@/components/ui";
import { getUser } from "@/lib/supabase/server";
import { ResetPasswordForm } from "./ResetPasswordForm";

export const metadata: Metadata = { title: "새 비밀번호 정하기", robots: { index: false } };

/** 비밀번호 찾기 메일의 링크로 들어오면(로그인된 상태) 새 비밀번호를 정해요. */
export default async function ResetPasswordPage() {
  const user = await getUser();
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
      <Card>
        <ResetPasswordForm />
      </Card>
    </div>
  );
}
