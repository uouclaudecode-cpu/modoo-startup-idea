"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { AuthCard } from "@/components/auth/AuthCard";
import { Button, Input, useToast } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/format";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(
    params.get("error") === "confirm" ? "가입 확인 링크가 만료됐어요. 다시 로그인해 주세요." : "",
  );
  const [loading, setLoading] = useState(false);

  const next = params.get("next");
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error: err } = await createClient().auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (err) {
      setError(
        /invalid login/i.test(err.message)
          ? "이메일 또는 비밀번호가 맞지 않아요."
          : /not confirmed/i.test(err.message)
            ? "가입 확인 메일의 링크를 먼저 눌러 주세요."
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
    </AuthCard>
  );
}
