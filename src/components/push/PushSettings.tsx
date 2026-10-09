"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BellOff, BellRing, RefreshCw, Send, Share, SquarePlus } from "lucide-react";
import { Badge, Button, Card, Skeleton, Spinner, useToast } from "@/components/ui";
import { cn } from "@/lib/cn";
import { friendlyError } from "@/lib/format";
import { getPushState, subscribePush, unsubscribePush, VAPID_PUBLIC_KEY, type PushState } from "@/lib/push";
import { createClient } from "@/lib/supabase/client";

/** 알림 종류별 설정 (profiles 테이블 열과 같은 이름) */
export type NotifyPrefs = { notify_reports: boolean; notify_comments: boolean; notify_maintenance: boolean };
type PrefKey = keyof NotifyPrefs;

const PREFS: { key: PrefKey; emoji: string; label: string; desc: string }[] = [
  { key: "notify_reports", emoji: "🚨", label: "발견 제보·연락 요청", desc: "누군가 내 QR로 제보하면 바로 알려 드려요." },
  { key: "notify_comments", emoji: "💬", label: "댓글·답글", desc: "내 분실 글의 새 댓글, 내 댓글에 달린 답글을 알려 드려요." },
  { key: "notify_maintenance", emoji: "🔧", label: "정비 시기", desc: "소모품 점검·교체 시기가 되면 아침 9시에 알려 드려요." },
];

type Status = PushState | "checking" | "nokey";

const BADGE: Record<Exclude<Status, "checking">, { tone: "neutral" | "success" | "warning" | "danger"; label: string }> = {
  on: { tone: "success", label: "켜짐" },
  off: { tone: "neutral", label: "꺼짐" },
  denied: { tone: "danger", label: "권한 거부됨" },
  install: { tone: "warning", label: "홈 화면 앱에서만" },
  unsupported: { tone: "neutral", label: "지원 안 함" },
  nokey: { tone: "neutral", label: "준비 중" },
};

/**
 * 설정 화면의 '휴대폰 알림' 카드.
 * - 이 기기에서 알림 켜기·끄기, 테스트 알림
 * - 받을 알림 종류(발견 제보·댓글·정비)는 계정 설정이라 모든 기기에 똑같이 적용돼요.
 */
export function PushSettings({ notify_reports, notify_comments, notify_maintenance }: NotifyPrefs) {
  const toast = useToast();
  // 처음엔 '확인 중' (서버 화면과 어긋나지 않게, 브라우저 정보는 화면이 뜬 뒤에 읽어요)
  const [status, setStatus] = useState<Status>("checking");
  const [busy, setBusy] = useState<"on" | "off" | "test" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<NotifyPrefs>({ notify_reports, notify_comments, notify_maintenance });
  const [saving, setSaving] = useState<Partial<Record<PrefKey, boolean>>>({});
  const busyRef = useRef(false);
  const userIdRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    if (!VAPID_PUBLIC_KEY) {
      setStatus("nokey");
      return;
    }
    try {
      const next = await getPushState();
      // 켜는 중에 다시 확인한 결과가 덮어쓰지 않게
      if (!busyRef.current) setStatus(next);
    } catch (e) {
      console.error("알림 상태 확인 실패", e);
      if (!busyRef.current) setStatus("off");
    }
  }, []);

  useEffect(() => {
    void refresh();
    // 휴대폰 설정에서 알림을 허용하고 돌아오면 다시 확인해요.
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  function start(kind: "on" | "off" | "test") {
    busyRef.current = true;
    setBusy(kind);
    setError(null);
  }
  function finish() {
    busyRef.current = false;
    setBusy(null);
  }

  async function turnOn() {
    start("on");
    try {
      await subscribePush();
      setStatus("on");
      toast.success("알림을 켰어요. 테스트 알림으로 잘 오는지 확인해 보세요.");
    } catch (e) {
      console.error("알림 켜기 실패", e);
      setError(friendlyError(e, "알림을 켜지 못했어요. 잠시 후 다시 시도해 주세요."));
      busyRef.current = false;
      await refresh(); // 권한을 거부했을 수도 있어서 상태를 다시 확인
    } finally {
      finish();
    }
  }

  async function turnOff() {
    start("off");
    try {
      await unsubscribePush();
      setStatus("off");
      toast.success("이 기기의 알림을 껐어요.");
    } catch (e) {
      console.error("알림 끄기 실패", e);
      setError(friendlyError(e, "알림을 끄지 못했어요. 잠시 후 다시 시도해 주세요."));
    } finally {
      finish();
    }
  }

  async function sendTest() {
    start("test");
    try {
      const res = await fetch("/api/push/test", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { error?: string; sent?: number };
      if (!res.ok) {
        toast.error(body.error || "테스트 알림을 보내지 못했어요. 잠시 후 다시 시도해 주세요.");
        if (res.status === 404) {
          busyRef.current = false;
          await refresh(); // 계정에 저장된 기기가 없으면 '꺼짐'으로 바로잡아요
        }
      } else if ((body.sent ?? 0) > 0) {
        const count = body.sent ?? 0;
        toast.success(`테스트 알림을 보냈어요${count > 1 ? ` (기기 ${count}대)` : ""}. 잠시 뒤 알림을 확인해 보세요.`);
      } else {
        toast.error("알림을 보내지 못했어요. 알림을 껐다가 다시 켜 주세요.");
      }
    } catch (e) {
      console.error("테스트 알림 실패", e);
      toast.error(friendlyError(e, "테스트 알림을 보내지 못했어요. 잠시 후 다시 시도해 주세요."));
    } finally {
      finish();
    }
  }

  async function togglePref(key: PrefKey) {
    const next = !prefs[key];
    // 바로 바뀐 것처럼 보여주고, 저장에 실패하면 되돌려요.
    setPrefs((p) => ({ ...p, [key]: next }));
    setSaving((s) => ({ ...s, [key]: true }));
    try {
      const supabase = createClient();
      if (!userIdRef.current) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error("로그인이 필요해요. 다시 로그인해 주세요.");
        userIdRef.current = user.id;
      }
      // 저장된 행을 돌려받아 정말 바뀌었는지 확인 (권한이 없으면 오류 없이 0행이라)
      const { error: saveError } = await supabase.from("profiles").update({ [key]: next }).eq("id", userIdRef.current).select("id").single();
      if (saveError) throw saveError;
    } catch (e) {
      console.error("알림 설정 저장 실패", e);
      setPrefs((p) => ({ ...p, [key]: !next }));
      toast.error(friendlyError(e, "설정을 저장하지 못했어요. 잠시 후 다시 시도해 주세요."));
    } finally {
      setSaving((s) => ({ ...s, [key]: false }));
    }
  }

  return (
    // id="push": MY의 알림 안내·시작 안내에서 이 카드로 바로 와요
    <Card id="push" className="scroll-mt-20 space-y-5">
      <div className="flex items-start gap-3">
        <span aria-hidden className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-brand-50 text-brand-600">
          <BellRing className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold tracking-tight text-ink">휴대폰 알림</h2>
            {status === "checking" ? <Skeleton className="h-6 w-14 rounded-full" /> : <Badge tone={BADGE[status].tone}>{BADGE[status].label}</Badge>}
          </div>
          <p className="mt-0.5 text-[13px] leading-relaxed text-ink-muted">앱을 닫아 두어도 발견 제보·댓글·정비 시기를 휴대폰으로 알려 드려요.</p>
        </div>
      </div>

      <DeviceSection status={status} busy={busy} onOn={turnOn} onOff={turnOff} onTest={sendTest} onRecheck={refresh} />

      {error && (
        <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
          {error}
        </p>
      )}

      <section aria-labelledby="notify-prefs-title" className="border-t border-line pt-4">
        <h3 id="notify-prefs-title" className="text-sm font-semibold text-ink-soft">
          받을 알림
        </h3>
        <ul className="mt-1 divide-y divide-line">
          {PREFS.map((p) => {
            const on = prefs[p.key];
            const isSaving = Boolean(saving[p.key]);
            return (
              <li key={p.key}>
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  aria-busy={isSaving || undefined}
                  disabled={isSaving}
                  onClick={() => togglePref(p.key)}
                  className="flex min-h-14 w-full items-center gap-3 rounded-xl py-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 disabled:cursor-wait"
                >
                  <span aria-hidden className="text-xl">
                    {p.emoji}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-ink">{p.label}</span>
                    <span className="block text-[13px] leading-snug text-ink-muted">{p.desc}</span>
                  </span>
                  {isSaving && <Spinner className="h-4 w-4 flex-none text-ink-muted" />}
                  <span
                    aria-hidden
                    className={cn("relative inline-flex h-7 w-12 flex-none items-center rounded-full transition-colors", on ? "bg-brand-600" : "bg-slate-300")}
                  >
                    <span className={cn("h-6 w-6 rounded-full bg-white shadow transition-transform", on ? "translate-x-[22px]" : "translate-x-0.5")} />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">받을 알림 설정은 내 계정의 모든 기기에 똑같이 적용돼요.</p>
      </section>
    </Card>
  );
}

/** 이 기기 상태에 맞는 안내와 버튼 */
function DeviceSection({
  status,
  busy,
  onOn,
  onOff,
  onTest,
  onRecheck,
}: {
  status: Status;
  busy: "on" | "off" | "test" | null;
  onOn: () => void;
  onOff: () => void;
  onTest: () => void;
  onRecheck: () => void;
}) {
  if (status === "checking") return <Skeleton className="h-11 rounded-xl" />;

  if (status === "nokey") {
    return (
      <div className="space-y-3">
        <Notice>알림 기능 준비 중이에요.</Notice>
        <Button full disabled icon={<BellRing aria-hidden className="h-4 w-4" />}>
          알림 켜기
        </Button>
      </div>
    );
  }

  if (status === "unsupported") {
    return (
      <Notice>
        이 브라우저는 알림을 지원하지 않아요. 크롬·삼성 인터넷·Safari에서 열어 주세요.
        <span className="mt-1 block text-[13px] text-ink-muted">
          카카오톡 같은 앱 안에서 열었다면 오른쪽 위 메뉴의 <b>다른 브라우저로 열기</b>를 눌러 주세요.
        </span>
      </Notice>
    );
  }

  if (status === "install") {
    return (
      <div className="space-y-2 rounded-xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
        <p className="font-semibold">iPhone은 홈 화면에 추가한 앱에서만 알림을 받을 수 있어요.</p>
        <ol className="space-y-1.5 text-ink-soft">
          <li>
            1. Safari 아래쪽 <Share aria-label="공유" className="inline h-4 w-4 align-[-2px] text-brand-600" /> <b>공유</b> 버튼을 눌러요.
          </li>
          <li>
            2. <SquarePlus aria-hidden className="inline h-4 w-4 align-[-2px] text-brand-600" /> <b>홈 화면에 추가</b>를 눌러요.
          </li>
          <li>3. 홈 화면에 생긴 B-LOCK 앱을 열고, 이 화면에서 알림을 켜 주세요.</li>
        </ol>
        <p className="text-[12px] text-ink-muted">iOS 16.4 이상에서 쓸 수 있어요.</p>
      </div>
    );
  }

  if (status === "denied") {
    return (
      <div className="space-y-3 rounded-xl bg-rose-50/70 p-4 text-sm ring-1 ring-rose-200">
        <p className="font-semibold text-rose-800">알림 권한이 거부돼 있어요. 아래처럼 다시 허용해 주세요.</p>
        <ul className="list-disc space-y-1.5 pl-5 text-ink-soft">
          <li>
            <b>안드로이드 브라우저</b>: 주소창 왼쪽 아이콘 → 권한(사이트 설정) → 알림 → 허용
          </li>
          <li>
            <b>설치한 앱</b>: 휴대폰 설정 → 애플리케이션 → B-LOCK → 알림 → 허용
          </li>
          <li>
            <b>iPhone</b>: 설정 → 알림 → B-LOCK → 알림 허용
          </li>
          <li>
            <b>PC</b>: 주소창 왼쪽 자물쇠 → 알림 → 허용
          </li>
        </ul>
        <p className="text-[13px] text-ink-muted">허용하고 이 화면으로 돌아오면 자동으로 다시 확인해요.</p>
        <Button variant="secondary" full icon={<RefreshCw aria-hidden className="h-4 w-4" />} onClick={onRecheck}>
          다시 확인
        </Button>
      </div>
    );
  }

  if (status === "off") {
    return (
      <Button full loading={busy === "on"} loadingText="켜는 중..." icon={<BellRing aria-hidden className="h-4 w-4" />} onClick={onOn}>
        이 기기에서 알림 켜기
      </Button>
    );
  }

  // 켜짐
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <Button
        variant="secondary"
        loading={busy === "test"}
        loadingText="보내는 중..."
        disabled={busy !== null}
        icon={<Send aria-hidden className="h-4 w-4" />}
        onClick={onTest}
      >
        테스트 알림 보내기
      </Button>
      <Button
        variant="ghost"
        loading={busy === "off"}
        loadingText="끄는 중..."
        disabled={busy !== null}
        icon={<BellOff aria-hidden className="h-4 w-4" />}
        onClick={onOff}
      >
        이 기기 알림 끄기
      </Button>
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl bg-slate-50 px-3 py-2.5 text-sm leading-relaxed text-ink-soft ring-1 ring-line">{children}</p>;
}
