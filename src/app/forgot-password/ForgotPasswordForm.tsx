"use client";

import Link from "next/link";
import { useState } from "react";
import { MailCheck } from "lucide-react";
import { AuthCard } from "@/components/auth/AuthCard";
import { Button, ButtonLink, EmptyState, Input } from "@/components/ui";
import { friendlyError } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";

/** 가입한 이메일로 비밀번호 재설정 링크 보내기 */
export function ForgotPasswordForm({ expired = false }: { expired?: boolean }) {
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
      // 메일 서버 쪽 문제(발송 실패·허용되지 않은 주소)는 다시 눌러도 안 되니 문의로 안내해요.
      if (/sending|not authorized|smtp/i.test(err.message) || err.status === 500)
        return setError("지금 메일을 보내지 못했어요. 잠시 뒤 다시 시도하거나, 화면 맨 아래 '문의하기'로 알려 주시면 도와 드릴게요.");
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
          description={`${sent} 주소로 가입했다면 비밀번호를 다시 정하는 링크를 보냈어요. 메일함(스팸함 포함)을 확인하고, 지금 쓰는 이 브라우저에서 링크를 열어 주세요. 링크는 1시간 동안만 쓸 수 있어요.`}
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
      subtitle="가입한 이메일을 적으면 비밀번호를 다시 정하는 링크를 보내 드려요."
      footer={
        <Link href="/login" className="font-semibold text-brand-700 underline-offset-2 hover:underline">
          로그인으로 돌아가기
        </Link>
      }
    >
      {expired && (
        <p role="alert" className="mb-4 rounded-xl bg-amber-50 px-3 py-2.5 text-sm leading-relaxed text-amber-900">
          링크가 만료됐거나 다른 브라우저에서 열렸어요. 다시 요청한 뒤, <b>요청한 것과 같은 휴대폰·브라우저</b>에서 메일 링크를 눌러 주세요.
        </p>
      )}
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <Input label="이메일" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={error} />
        <Button type="submit" full size="lg" loading={loading} loadingText="보내는 중..." disabled={!email.trim()}>
          재설정 링크 받기
        </Button>
      </form>
    </AuthCard>
  );
}
