"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BellRing, X } from "lucide-react";
import { Button, ButtonLink, useToast } from "@/components/ui";
import { cn } from "@/lib/cn";
import { friendlyError } from "@/lib/format";
import { getPushState, subscribePush, VAPID_PUBLIC_KEY } from "@/lib/push";

/** '나중에'를 누르면 이 기기에서 이만큼 다시 보이지 않아요 */
const SNOOZE_MS = 14 * 86400e3;
const snoozeKey = (userId: string) => `b-lock:push-prompt-snoozed:${userId}`;

type Shown = "off" | "denied" | "install";

function snoozed(userId: string) {
  try {
    const at = Number(localStorage.getItem(snoozeKey(userId)));
    return Number.isFinite(at) && at > 0 && Date.now() - at < SNOOZE_MS;
  } catch {
    return false;
  }
}

/**
 * MY: 내 계정에 알림 받는 기기가 하나도 없을 때 보이는 작은 안내.
 * 발견 제보·익명 대화는 휴대폰 알림으로만 오기 때문에, 꺼져 있으면 제보가 와도 모를 수 있어요.
 * - '나중에'를 누르면 이 기기에서 2주 동안 숨겨요 (수색 중일 때는 숨기지 않아요)
 */
export function PushPrompt({ userId, urgent }: { userId: string; urgent: boolean }) {
  const router = useRouter();
  const toast = useToast();
  // 브라우저 정보는 화면이 뜬 뒤에 읽어요 (서버 화면과 어긋나지 않게). 확인 전에는 아무것도 안 보여요.
  const [shown, setShown] = useState<Shown | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!VAPID_PUBLIC_KEY || (!urgent && snoozed(userId))) return;
    let cancelled = false;
    getPushState()
      .then((s) => {
        // 켜져 있거나 이 브라우저가 알림을 못 받으면(카카오톡 안 브라우저 등) 안내하지 않아요
        if (!cancelled && (s === "off" || s === "denied" || s === "install")) setShown(s);
      })
      .catch((e) => console.error("알림 상태 확인 실패", e));
    return () => {
      cancelled = true;
    };
  }, [userId, urgent]);

  if (!shown) return null;

  async function turnOn() {
    setBusy(true);
    setError("");
    try {
      await subscribePush();
      setShown(null);
      toast.success("알림을 켰어요. 이제 제보나 메시지가 오면 바로 알려 드려요.");
      router.refresh();
    } catch (e) {
      console.error("알림 켜기 실패", e);
      setError(friendlyError(e, "알림을 켜지 못했어요. 설정 화면에서 다시 시도해 주세요."));
      // 허용 창에서 '차단'을 눌렀을 수도 있어서 상태를 다시 확인해요
      const next = await getPushState().catch(() => null);
      if (next === "denied" || next === "install") setShown(next);
    } finally {
      setBusy(false);
    }
  }

  function snooze() {
    try {
      localStorage.setItem(snoozeKey(userId), String(Date.now()));
    } catch {
      // 저장소를 못 써도 이번에는 닫아요
    }
    setShown(null);
    toast.info("설정 → 휴대폰 알림에서 언제든 켤 수 있어요.");
  }

  const title = urgent ? "수색 중인데 알림이 꺼져 있어요" : shown === "denied" ? "알림이 차단돼 있어요" : "알림이 꺼져 있어요";
  const text =
    shown === "install"
      ? "iPhone은 Safari에서 '홈 화면에 추가'한 앱으로 열어야 알림을 받을 수 있어요. 발견 제보가 와도 모를 수 있어요."
      : shown === "denied"
        ? "브라우저에서 알림을 막아 두었어요. 허용해야 발견 제보·메시지를 바로 받을 수 있어요."
        : "누가 내 QR로 발견 제보를 하거나 메시지를 보내도 바로 알 수 없어요.";

  return (
    <section
      aria-label="휴대폰 알림 안내"
      className={cn("space-y-3 rounded-2xl p-4 ring-1", urgent ? "bg-rose-50 ring-rose-200" : "bg-amber-50 ring-amber-200")}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className={cn("grid h-10 w-10 flex-none place-items-center rounded-full bg-white ring-1", urgent ? "text-rose-600 ring-rose-200" : "text-amber-600 ring-amber-200")}
        >
          <BellRing className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className={cn("font-bold", urgent ? "text-rose-900" : "text-amber-900")}>{title}</p>
          <p className="mt-0.5 text-[13px] leading-relaxed text-ink-soft">{text}</p>
        </div>
        {!urgent && (
          <button type="button" onClick={snooze} className="-m-2 grid h-10 w-10 flex-none place-items-center rounded-full text-ink-muted hover:bg-white/70" aria-label="알림 안내 닫기 (2주 동안)">
            <X aria-hidden className="h-4 w-4" />
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="rounded-xl bg-white px-3 py-2.5 text-sm text-rose-700 ring-1 ring-rose-200">
          {error}
        </p>
      )}
      {shown === "off" ? (
        <Button full loading={busy} loadingText="켜는 중..." icon={<BellRing aria-hidden className="h-4 w-4" />} onClick={turnOn}>
          이 기기에서 알림 켜기
        </Button>
      ) : (
        <ButtonLink href="/settings#push" full variant="secondary">
          {shown === "install" ? "홈 화면에 추가하는 방법 보기" : "알림 허용하는 방법 보기"}
        </ButtonLink>
      )}
    </section>
  );
}
