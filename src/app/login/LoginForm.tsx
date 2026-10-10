"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
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
  // 확인 메일 링크로 가입 확인을 마치고 온 사람 (이제 로그인만 하면 돼요)
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);

  const safeNext = toSafeNext(params.get("next"));
  const goesHome = ["/", "/?welcome=1", "/dashboard", "/dashboard?welcome=1"].includes(safeNext);

  // 다시 보낸 확인 메일의 링크는 결과를 주소 끝(#)에 붙여 이곳으로 와요. 읽어서 알맞게 안내하고, 주소에서는 지워요.
  // 거기 붙은 로그인 값으로 로그인시키지는 않아요. (남이 보낸 링크를 눌러 남의 계정에 로그인되는 일을 막으려고)
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const linkFailed = hash.has("error") || hash.has("error_code") || hash.has("error_description");
    if (!linkFailed && !hash.has("access_token")) return;
    const url = new URL(window.location.href);
    if (linkFailed) {
      setNeedsConfirm(true);
      setError("확인 링크가 만료됐거나 이미 쓴 링크예요. 가입 확인을 이미 마쳤다면 그대로 로그인하고, 아니면 아래에서 확인 메일을 다시 받아 주세요.");
    } else {
      // 가입 확인은 끝났으니 '링크 만료' 안내와 다시 보내기는 거둬요 (새로 고쳐도 다시 뜨지 않게 주소의 error도 지워요)
      setNeedsConfirm(false);
      setError("");
      setConfirmed(true);
      url.searchParams.delete("error");
    }
    window.history.replaceState(null, "", url.pathname + url.search);
  }, []);

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
            : friendlyError(err, "로그인하지 못했어요. 잠시 후 다시 시도해 주세요."),
      );
      return;
    }
    toast.success("로그인했어요.");
    router.replace(safeNext);
    router.refresh();
  }

  return (
    <AuthCard
      title="로그인"
      subtitle="내 이동수단과 발견 제보를 확인하려면 로그인해 주세요."
      footer={
        <>
          아직 계정이 없나요?{" "}
          <Link href={safeNext === "/" ? "/signup" : `/signup?next=${encodeURIComponent(safeNext)}`} className="font-semibold text-brand-700 underline-offset-2 hover:underline">
            회원가입
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {confirmed && (
          <p role="status" className="rounded-xl bg-emerald-50 px-3 py-2.5 text-sm leading-relaxed text-emerald-800">
            가입 확인이 끝났어요. {goesHome ? "비밀번호로 로그인해 주세요." : "비밀번호로 로그인하면 보던 화면으로 이어서 가요."}
          </p>
        )}
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
