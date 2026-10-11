"use client";

import { useEffect } from "react";
import { getPushState, isPushSupported, needsInstallForPush, subscribePush } from "@/lib/push";

/**
 * 이미 알림을 허용한 기기면, 지금 로그인한 계정으로 알림이 오게 조용히 맞춰요.
 * (한 기기에서 다른 계정으로 로그인했거나, 로그아웃 뒤 다시 들어온 경우 알림이 끊기지 않게)
 * 허용 창은 절대 띄우지 않아요: 이미 'granted' 일 때만 움직여요.
 */
export function PushAutoSync({ userId }: { userId: string }) {
  useEffect(() => {
    if (!isPushSupported() || needsInstallForPush() || Notification.permission !== "granted") return;
    const key = `b-lock:push-sync:${userId}`;
    try {
      // 설정에서 직접 끈 기기는 그대로 둬요
      if (localStorage.getItem("b-lock:push-off")) return;
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // 저장소를 못 써도 한 번 맞춰 보는 건 괜찮아요
    }
    getPushState()
      .then((state) => (state === "off" ? subscribePush() : undefined))
      .catch((e) => console.error("알림 기기 자동 연결 실패", e));
  }, [userId]);
  return null;
}
