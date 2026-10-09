"use client";

import { useRouter } from "next/navigation";
import { PasswordForm } from "@/app/settings/PasswordForm";

/** 새 비밀번호를 정하면 내 이동수단 화면으로 (메일 링크로 들어왔으면 그 링크가 본인 확인이라 지금 비밀번호는 묻지 않아요) */
export function ResetPasswordForm({ fromMail }: { fromMail: boolean }) {
  const router = useRouter();
  return (
    <PasswordForm
      requireCurrent={!fromMail}
      onDone={() => {
        router.replace("/dashboard");
        router.refresh();
      }}
    />
  );
}
