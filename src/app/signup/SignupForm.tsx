"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MailCheck } from "lucide-react";
import { AuthCard } from "@/components/auth/AuthCard";
import { ResendConfirm, confirmRedirectUrl } from "@/components/auth/ResendConfirm";
import { Button, ButtonLink, EmptyState, Input, useToast } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/format";

type Form = { email: string; password: string; confirm: string; nickname: string };
type Errors = Partial<Record<keyof Form | "agree" | "form", string>>;

export function SignupForm({ next = "/" }: { next?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = useState<Form>({ email: "", password: "", confirm: "", nickname: "" });
  const [errors, setErrors] = useState<Errors>({});
  const [agree, setAgree] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sentTo, setSentTo] = useState("");
  // 로그인 화면으로 갈 때도 가려던 곳(next)을 함께 넘겨요
  const loginHref = next === "/" ? "/login" : `/login?next=${encodeURIComponent(next)}`;

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  function validate() {
    const errs: typeof errors = {};
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) errs.email = "이메일 형식이 올바르지 않아요.";
    if (form.password.length < 8) errs.password = "비밀번호는 8자 이상으로 정해 주세요.";
    if (form.confirm !== form.password) errs.confirm = "비밀번호가 서로 달라요.";
    if (!form.nickname.trim()) errs.nickname = "닉네임을 입력해 주세요.";
    else if (form.nickname.trim().length > 20) errs.nickname = "닉네임은 20자 이하로 정해 주세요.";
    if (!agree) errs.agree = "약관과 개인정보처리방침에 동의해 주세요.";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    const { data, error } = await createClient().auth.signUp({
      email: form.email.trim(),
      password: form.password,
      options: {
        data: { nickname: form.nickname.trim() },
        // 확인 링크를 누르면 가입하기 전에 보던 화면(스티커 등록·양도 QR·제보 등)으로 돌아가요
        emailRedirectTo: confirmRedirectUrl(next),
      },
    });
    setLoading(false);
    if (error) {
      setErrors({
        form: /already registered/i.test(error.message)
          ? "이미 가입된 이메일이에요. 로그인해 주세요."
          : /rate limit/i.test(error.message)
            ? "가입 요청이 너무 많아요. 잠시 후 다시 시도해 주세요."
            : friendlyError(error, "가입하지 못했어요. 잠시 후 다시 시도해 주세요."),
      });
      return;
    }
    if (data.session) {
      // 이메일 확인을 쓰지 않는 설정이면 바로 로그인됩니다.
      toast.success("가입했어요! 환영해요.");
      router.replace(next === "/" ? "/?welcome=1" : next);
      router.refresh();
    } else {
      setSentTo(form.email.trim());
    }
  }

  if (sentTo) {
    return (
      <div className="mx-auto max-w-md">
        <EmptyState
          icon={<MailCheck className="h-7 w-7" />}
          title="가입 확인 메일을 보냈어요"
          description={`${sentTo} 메일함(스팸함 포함)에서 확인 링크를 누르면 가입이 끝나요.${next === "/" ? "" : " 확인을 마치면 보던 화면으로 이어서 갈 수 있어요."}`}
          action={
            <div className="space-y-3">
              <ButtonLink href={loginHref} full>
                로그인 화면으로
              </ButtonLink>
              <ResendConfirm email={sentTo} next={next} justSent />
            </div>
          }
        />
      </div>
    );
  }

  return (
    <AuthCard
      title="회원가입"
      subtitle="이동수단을 등록하고 디지털 신분증(QR)을 만들어 보세요."
      footer={
        <>
          이미 계정이 있나요?{" "}
          <Link href={loginHref} className="font-semibold text-brand-700 underline-offset-2 hover:underline">
            로그인
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Input label="이메일" type="email" autoComplete="email" value={form.email} onChange={set("email")} error={errors.email} required />
        <Input
          label="비밀번호"
          type="password"
          autoComplete="new-password"
          value={form.password}
          onChange={set("password")}
          error={errors.password}
          hint="8자 이상"
          required
        />
        <Input
          label="비밀번호 확인"
          type="password"
          autoComplete="new-password"
          value={form.confirm}
          onChange={set("confirm")}
          error={errors.confirm}
          required
        />
        <Input
          label="닉네임"
          value={form.nickname}
          onChange={set("nickname")}
          error={errors.nickname}
          hint="인사말과 커뮤니티 글·댓글에 보여요. 실명·전화번호는 쓰지 마세요."
          required
        />
        <div className="space-y-1.5">
          <label className="flex cursor-pointer items-start gap-2.5 rounded-xl bg-slate-50 p-3 text-[14px] leading-relaxed text-ink-soft">
            <input
              type="checkbox"
              checked={agree}
              onChange={(e) => {
                setAgree(e.target.checked);
                setErrors((x) => ({ ...x, agree: undefined }));
              }}
              className="mt-1 h-4 w-4 flex-none accent-brand-600"
              aria-invalid={errors.agree ? true : undefined}
            />
            <span>
              (필수) 만 14세 이상이며,{" "}
              <Link href="/terms" target="_blank" className="font-semibold text-brand-700 underline">
                이용약관
              </Link>
              ·
              <Link href="/privacy" target="_blank" className="font-semibold text-brand-700 underline">
                개인정보처리방침
              </Link>
              ·
              <Link href="/location-terms" target="_blank" className="font-semibold text-brand-700 underline">
                위치정보 이용약관
              </Link>
              에 동의해요.
            </span>
          </label>
          {errors.agree && <p className="text-[13px] text-rose-600">{errors.agree}</p>}
        </div>
        {errors.form && (
          <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
            {errors.form}
          </p>
        )}
        <Button type="submit" full size="lg" loading={loading} loadingText="가입 중...">
          회원가입
        </Button>
      </form>
    </AuthCard>
  );
}
