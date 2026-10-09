"use client";

import { useState } from "react";
import { Button, Input, useToast } from "@/components/ui";
import { friendlyError } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";

type Errors = { current?: string; pw?: string; confirm?: string; form?: string };

/**
 * 새 비밀번호로 바꾸기.
 * 설정 화면에서는 지금 비밀번호를 서버에서 먼저 확인해요. (로그인된 휴대폰을 잠깐 빌린 사람이 바꾸지 못하게)
 * 비밀번호 찾기 메일로 들어온 경우(requireCurrent={false})는 메일 링크가 본인 확인이라 바로 바꿔요.
 */
export function PasswordForm({ onDone, requireCurrent = true }: { onDone?: () => void; requireCurrent?: boolean }) {
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [loading, setLoading] = useState(false);

  /** 바꾸고, 실패하면 보여줄 오류를 돌려줘요 */
  async function save(): Promise<Errors | null> {
    if (!requireCurrent) {
      const { error } = await createClient().auth.updateUser({ password: pw });
      if (!error) return null;
      console.error(error);
      return {
        form:
          error.code === "same_password" || /different from the old|same password/i.test(error.message)
            ? "지금 쓰는 비밀번호와 다른 비밀번호로 정해 주세요."
            : error.code === "weak_password" || /weak|should contain/i.test(error.message)
              ? "비밀번호가 너무 쉬워요. 더 길게 하거나 영문·숫자·기호를 섞어 주세요."
              : /session|expired|not authenticated/i.test(error.message)
                ? "로그인이 만료됐어요. 다시 로그인한 뒤 바꿔 주세요."
                : friendlyError(error, "바꾸지 못했어요. 잠시 후 다시 시도해 주세요."),
      };
    }
    try {
      const res = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, password: pw }),
      });
      if (res.ok) return null;
      const json = (await res.json().catch(() => ({}))) as { error?: string; field?: string };
      const message = json.error ?? "바꾸지 못했어요. 잠시 후 다시 시도해 주세요.";
      if (json.field === "current") return { current: message };
      if (json.field === "password") return { pw: message };
      return { form: message };
    } catch (err) {
      console.error(err);
      return { form: friendlyError(err, "바꾸지 못했어요. 잠시 후 다시 시도해 주세요.") };
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Errors = {};
    if (requireCurrent && !current) errs.current = "지금 쓰는 비밀번호를 입력해 주세요.";
    if (pw.length < 8) errs.pw = "비밀번호는 8자 이상으로 정해 주세요.";
    if (confirm !== pw) errs.confirm = "비밀번호가 서로 달라요.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setLoading(true);
    const failed = await save();
    setLoading(false);
    if (failed) return setErrors(failed);
    setCurrent("");
    setPw("");
    setConfirm("");
    toast.success("비밀번호를 바꿨어요.");
    onDone?.();
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-3">
      {requireCurrent && (
        <Input
          label="지금 쓰는 비밀번호"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          hint="본인 확인을 위해 한 번 더 적어 주세요."
          error={errors.current}
        />
      )}
      <Input label="새 비밀번호" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} hint="8자 이상" error={errors.pw} />
      <Input label="새 비밀번호 확인" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={errors.confirm} />
      {errors.form && (
        <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
          {errors.form}
        </p>
      )}
      <Button type="submit" loading={loading} loadingText="바꾸는 중..." disabled={(requireCurrent && !current) || !pw || !confirm}>
        비밀번호 바꾸기
      </Button>
    </form>
  );
}
