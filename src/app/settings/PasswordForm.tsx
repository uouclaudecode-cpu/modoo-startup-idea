"use client";

import { useState } from "react";
import { Button, Input, useToast } from "@/components/ui";
import { friendlyError } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";

/** 로그인한 상태에서 새 비밀번호로 바꾸기 (비밀번호 찾기 메일로 들어온 경우에도 사용) */
export function PasswordForm({ onDone }: { onDone?: () => void }) {
  const toast = useToast();
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ pw?: string; confirm?: string; form?: string }>({});
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs: typeof errors = {};
    if (pw.length < 8) errs.pw = "비밀번호는 8자 이상으로 정해 주세요.";
    if (confirm !== pw) errs.confirm = "비밀번호가 서로 달라요.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setLoading(true);
    const { error } = await createClient().auth.updateUser({ password: pw });
    setLoading(false);
    if (error) {
      console.error(error);
      setErrors({
        form: /different from the old|same password/i.test(error.message)
          ? "지금 쓰는 비밀번호와 다른 비밀번호로 정해 주세요."
          : /session|expired|not authenticated/i.test(error.message)
            ? "로그인이 만료됐어요. 다시 로그인한 뒤 바꿔 주세요."
            : friendlyError(error, "바꾸지 못했어요. 잠시 후 다시 시도해 주세요."),
      });
      return;
    }
    setPw("");
    setConfirm("");
    toast.success("비밀번호를 바꿨어요.");
    onDone?.();
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-3">
      <Input label="새 비밀번호" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} hint="8자 이상" error={errors.pw} />
      <Input label="새 비밀번호 확인" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={errors.confirm} />
      {errors.form && (
        <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
          {errors.form}
        </p>
      )}
      <Button type="submit" loading={loading} loadingText="바꾸는 중..." disabled={!pw || !confirm}>
        비밀번호 바꾸기
      </Button>
    </form>
  );
}
