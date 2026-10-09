"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { AuthCard } from "@/components/auth/AuthCard";
import { ResendConfirm } from "@/components/auth/ResendConfirm";
import { Button, Input, useToast } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/format";
import { safeNext as toSafeNext } from "@/lib/safeNext";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const confirmFailed = params.get("error") === "confirm";
  const [error, setError] = useState(
    confirmFailed ? "가입 확인 링크가 만료됐거나 다른 브라우저에서 열렸어요. 먼저 로그인해 보고, 안 되면 아래에서 확인 메일을 다시 받아 주세요." : "",
  );
  // 가입 확인을 아직 못 마친 사람에게 '확인 메일 다시 보내기'를 보여줘요
  const [needsConfirm, setNeedsConfirm] = useState(confirmFailed);
  const [loading, setLoading] = useState(false);

  const safeNext = toSafeNext(params.get("next"));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error: err } = await createClient().auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (err) {
      const unconfirmed = err.code === "email_not_confirmed" || /not confirmed/i.test(err.message);
      if (unconfirmed) setNeedsConfirm(true);
      setError(
        /invalid login/i.test(err.message)
          ? "이메일 또는 비밀번호가 맞지 않아요."
          : unconfirmed
            ? "아직 가입 확인 전이에요. 메일함(스팸함 포함)에서 확인 링크를 눌러 주세요. 메일이 없거나 링크가 만료됐다면 아래에서 다시 받을 수 있어요."
            : friendlyError(err, "로그인에 실패했습니다. 잠시 후 다시 시도해 주세요."),
      );
      return;
    }
    toast.success("로그인되었습니다!");
    router.replace(safeNext);
    router.refresh();
  }

  return (
    <AuthCard
      title="로그인"
      subtitle="내 이동수단과 발견 제보를 확인하려면 로그인하세요."
      footer={
        <>
          아직 계정이 없나요?{" "}
          <Link href={safeNext === "/dashboard" ? "/signup" : `/signup?next=${encodeURIComponent(safeNext)}`} className="font-semibold text-brand-700 underline-offset-2 hover:underline">
            회원가입
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Input label="이메일" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Input
          label="비밀번호"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <div className="-mt-2 text-right">
          <Link href="/forgot-password" className="text-[13px] font-semibold text-ink-muted underline-offset-2 hover:text-brand-700 hover:underline">
            비밀번호를 잊었어요
          </Link>
        </div>
        {error && (
          <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
            {error}
          </p>
        )}
        <Button type="submit" full size="lg" loading={loading} loadingText="로그인 중..." disabled={!email || !password}>
          로그인
        </Button>
      </form>
      {needsConfirm && (
        <div className="space-y-2 border-t border-line pt-4">
          <p className="text-[13px] leading-relaxed text-ink-muted">가입 확인 메일이 안 왔거나 링크가 만료됐나요? 위 이메일 칸에 가입한 이메일을 적고 눌러 주세요.</p>
          <ResendConfirm email={email} next={safeNext} />
        </div>
      )}
    </AuthCard>
  );
}
