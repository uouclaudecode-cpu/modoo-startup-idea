"use client";

import { useState } from "react";
import { BellOff, BellRing } from "lucide-react";
import { Button, useToast } from "@/components/ui";
import { friendlyError } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";

/**
 * QR '주인에게 알리기' 알림 잠시 끄기 (예: 일부러 오래 세워 둘 때).
 * 꺼 둔 동안에도 받은 목록에는 쌓이고, 급한 알림(잠금 풀림·누가 가져가려 함)과 발견 제보는 그대로 와요.
 */
export function NoticeMute({ vehicleId, mutedUntil }: { vehicleId: string; mutedUntil: string | null }) {
  const toast = useToast();
  const [until, setUntil] = useState<string | null>(mutedUntil && Date.parse(mutedUntil) > Date.now() ? mutedUntil : null);
  const [busy, setBusy] = useState<number | null>(null);

  async function set(hours: number) {
    setBusy(hours);
    const { data, error } = await createClient().rpc("set_notice_mute", { p_vehicle: vehicleId, p_hours: hours });
    setBusy(null);
    if (error) return toast.error(friendlyError(error, "바꾸지 못했어요."));
    setUntil((data as string | null) ?? null);
    toast.success(hours ? "알림을 잠시 껐어요. 급한 알림은 그대로 와요." : "알림을 다시 켰어요.");
  }

  return (
    <div className="space-y-2 rounded-2xl bg-slate-50 p-3 ring-1 ring-line">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-ink-soft">
        {until ? <BellOff aria-hidden className="h-4 w-4 text-amber-600" /> : <BellRing aria-hidden className="h-4 w-4 text-brand-600" />}
        {until
          ? `QR 알림을 ${new Date(until).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" })}까지 쉬는 중이에요`
          : "QR로 받는 알림 (자리·상태 알림)"}
      </p>
      <p className="text-[12px] leading-relaxed text-ink-muted">
        일부러 오래 세워 둘 때는 잠시 꺼 두세요. 꺼 둔 동안에도 여기 목록에는 쌓이고, 급한 알림(잠금 풀림·누가 가져가려 함)과 발견 제보는 그대로 와요.
      </p>
      <div className="flex flex-wrap gap-2">
        {until ? (
          <Button variant="secondary" className="h-10 text-sm" loading={busy === 0} onClick={() => set(0)}>
            다시 켜기
          </Button>
        ) : (
          [
            [3, "3시간"],
            [24, "하루"],
            [168, "일주일"],
          ].map(([h, label]) => (
            <Button key={h} variant="secondary" className="h-10 text-sm" loading={busy === h} disabled={busy !== null} onClick={() => set(h as number)}>
              {label} 끄기
            </Button>
          ))
        )}
      </div>
    </div>
  );
}
