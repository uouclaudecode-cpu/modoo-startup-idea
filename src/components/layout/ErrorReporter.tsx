"use client";

import { useEffect } from "react";
import { isNoise, toRpcArgs } from "@/lib/errorReport";
import { createClient } from "@/lib/supabase/client";

/** 한 번 켠 화면에서 보낼 수 있는 오류 수 (같은 오류는 한 번만) */
const MAX_PER_PAGE = 10;
const sent = new Set<string>();

/** 브라우저에서 난 오류를 운영자에게 보내요. 실패해도 사용자에게는 아무 영향이 없어요. */
export function reportClientError(message: string, stack?: string | null) {
  try {
    if (!message || isNoise(message, stack) || sent.size >= MAX_PER_PAGE) return;
    const key = `${message}|${location.pathname}`;
    if (sent.has(key)) return;
    sent.add(key);
    createClient()
      .rpc("report_app_error", toRpcArgs({ source: "client", message, stack, path: location.pathname, userAgent: navigator.userAgent }))
      .then(({ error }) => error && console.warn("오류 알림을 보내지 못했어요", error.message));
  } catch {
    /* 오류 알림 때문에 또 오류가 나지 않게 */
  }
}

/** 화면 어디에서든 처리하지 못한 오류를 잡아서 알려요 (레이아웃에 한 번) */
export function ErrorReporter() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => reportClientError(e.message || String(e.error ?? ""), e.error?.stack);
    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason as { message?: string; stack?: string } | string | undefined;
      reportClientError(typeof r === "string" ? r : (r?.message ?? "처리하지 못한 오류"), typeof r === "string" ? null : r?.stack);
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
