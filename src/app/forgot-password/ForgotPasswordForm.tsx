"use client";

import Link from "next/link";
import { useState } from "react";
import { MailCheck } from "lucide-react";
import { AuthCard } from "@/components/auth/AuthCard";
import { Button, ButtonLink, EmptyState, Input } from "@/components/ui";
import { friendlyError } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";

/** 가입한 이메일로 비밀번호 재설정 링크 보내기 */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(value)) return setError("이메일 형식이 올바르지 않아요.");
    setError("");
    setLoading(true);
    const { error: err } = await createClient().auth.resetPasswordForEmail(value, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
    setLoading(false);
    if (err) {
      console.error(err);
      // 가입 여부를 알려주지 않도록, 요청 한도 같은 경우만 따로 안내해요.
      if (/rate limit|security purposes/i.test(err.message)) return setError("요청이 너무 많아요. 몇 분 뒤에 다시 시도해 주세요.");
      return setError(friendlyError(err, "메일을 보내지 못했어요. 잠시 후 다시 시도해 주세요."));
    }
    setSent(value);
  }

  if (sent) {
    return (
      <div className="mx-auto max-w-md">
        <EmptyState
          icon={<MailCheck className="h-7 w-7" />}
          title="메일을 확인해 주세요"
          description={`${sent}로 가입했다면 비밀번호를 다시 정하는 링크를 보냈어요. 메일함(스팸함 포함)을 확인해 주세요. 링크는 1시간 동안만 쓸 수 있어요.`}
          action={
            <ButtonLink href="/login" full>
              로그인 화면으로
            </ButtonLink>
          }
        />
      </div>
    );
  }

  return (
    <AuthCard
      title="비밀번호 찾기"
      subtitle="가입한 이메일을 적으면 비밀번호를 다시 정하는 링크를 보내드려요."
      footer={
        <Link href="/login" className="font-semibold text-brand-700 underline-offset-2 hover:underline">
          로그인으로 돌아가기
        </Link>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <Input label="이메일" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={error} />
        <Button type="submit" full size="lg" loading={loading} loadingText="보내는 중..." disabled={!email.trim()}>
          재설정 링크 받기
        </Button>
      </form>
    </AuthCard>
  );
}
