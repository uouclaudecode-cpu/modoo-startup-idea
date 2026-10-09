"use client";

import { useRef, useState } from "react";
import { LogOut } from "lucide-react";
import { buttonClass } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/cn";
import { unsubscribePush } from "@/lib/push";

/**
 * 로그아웃: 이 기기의 푸시 알림 구독을 먼저 지운 뒤 로그아웃해요.
 * (같은 휴대폰을 다른 사람이 쓸 때 이전 계정의 알림이 오지 않게)
 */
export function LogoutButton() {
  const formRef = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      // 알림 정리가 늦어져도 로그아웃이 막히지 않게 2초까지만 기다려요.
      await Promise.race([unsubscribePush(), new Promise((r) => setTimeout(r, 2000))]);
    } catch (err) {
      console.error("로그아웃 전 알림 구독 정리 실패", err);
    }
    formRef.current?.submit();
  }

  return (
    <form ref={formRef} action="/auth/signout" method="post" onSubmit={onSubmit}>
      <button type="submit" className={cn(buttonClass("secondary", "md", true))} disabled={busy} aria-busy={busy || undefined}>
        {busy ? <Spinner className="h-4 w-4" /> : <LogOut aria-hidden className="h-4 w-4" />}
        {busy ? "로그아웃 중..." : "로그아웃"}
      </button>
    </form>
  );
}
