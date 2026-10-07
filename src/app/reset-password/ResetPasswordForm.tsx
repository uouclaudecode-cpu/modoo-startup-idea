"use client";

import { useRouter } from "next/navigation";
import { PasswordForm } from "@/app/settings/PasswordForm";

/** 새 비밀번호를 정하면 내 이동수단 화면으로 */
export function ResetPasswordForm() {
  const router = useRouter();
  return (
    <PasswordForm
      onDone={() => {
        router.replace("/dashboard");
        router.refresh();
      }}
    />
  );
}
