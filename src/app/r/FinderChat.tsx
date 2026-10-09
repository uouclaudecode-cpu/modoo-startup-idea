"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, CircleCheck, Copy, MessageCircle, Send } from "lucide-react";
import { MoneyWarning } from "@/components/alerts/TrustInfo";
import { ChatSkeleton } from "@/components/skeletons/PageSkeletons";
import { Button, Card, EmptyState, ErrorState, Textarea, useToast } from "@/components/ui";
import { hasMoneyRequest } from "@/lib/alerts";
import { copyText } from "@/lib/clipboard";
import { loadFinderThreads, type FinderThreadRef } from "@/lib/finderThreads";
import { formatDateTime, friendlyError, timeAgo } from "@/lib/format";
import { browserPushSubscription } from "@/lib/push";
import { createClient } from "@/lib/supabase/client";

type Thread = {
  report_id: string;
  kind: "found" | "contact";
  created_at: string;
  description: string;
  location_text: string | null;
  open: boolean;
  vehicle: { type: string; brand: string | null; color: string | null };
  messages: { id: string; sender: "owner" | "finder"; body: string; created_at: string }[];
};

/** 주소 # 뒤의 t=… 를 읽어요 (주소창 기록·서버에 남지 않게 해시로) */
function tokenFromHash(list: FinderThreadRef[]) {
  const m = window.location.hash.match(/t=([A-Za-z0-9_-]{16,40})/);
  if (m) return m[1];
  // 답장 알림은 제보 번호(#rid=…)로 와요 → 이 기기에 저장된 대화 열쇠로 바꿔요
  const rid = window.location.hash.match(/rid=([0-9a-f-]{36})/);
  return rid ? (list.find((t) => t.reportId === rid[1])?.token ?? null) : null;
}

export function FinderChat() {
  const toast = useToast();
  const [token, setToken] = useState<string | null>(null);
  const [refs, setRefs] = useState<FinderThreadRef[]>([]);
  const [ready, setReady] = useState(false);
  const [thread, setThread] = useState<Thread | null | "missing">(null);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  // 불러오기에 실패했는지 (처음부터 못 불러왔을 때만 오류 화면, 5초 확인은 계속 다시 시도)
  const [loadError, setLoadError] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  // 지난번에 본 메시지 수 (null = 아직 처음 불러오기 전)
  const seenCountRef = useRef<number | null>(null);

  useEffect(() => {
    const read = () => {
      const list = loadFinderThreads();
      const t = tokenFromHash(list);
      setRefs(list);
      setToken(t ?? (list.length === 1 ? list[0].token : null));
      setReady(true);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  // 다른 대화로 바뀌면 이전 대화 내용·알림 상태를 지워요
  useEffect(() => {
    setThread(null);
    setSubscribed(false);
    setBody("");
    setLoadError(false);
    seenCountRef.current = null;
  }, [token]);

  const load = useCallback(async () => {
    if (!token) return;
    const { data, error } = await createClient().rpc("finder_thread", { p_finder: token });
    if (error) {
      console.error(error);
      setLoadError(true);
      return;
    }
    setLoadError(false);
    setThread(data ? (data as Thread) : "missing");
  }, [token]);

  async function retry() {
    setRetrying(true);
    await load();
    setRetrying(false);
  }

  // 화면이 보일 때만 5초마다 새 답장 확인
  useEffect(() => {
    if (!token) return;
    load();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 5000);
    return () => clearInterval(id);
  }, [token, load]);

  // 새 메시지가 오면 마지막 메시지가 보이게 내려요.
  // 처음 열 때는 내리지 않아요 (위의 '답장 알림 받기' 안내가 먼저 보이게).
  // 아래 메뉴(globals.css의 scroll-padding)와 앱 설치 안내(scroll-mb)에 가리지 않게 여백을 둬요.
  const loaded = thread !== null && thread !== "missing";
  const count = loaded ? thread.messages.length : 0;
  useEffect(() => {
    if (!loaded) return;
    const seen = seenCountRef.current;
    seenCountRef.current = count;
    if (seen !== null && count > seen) endRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [loaded, count]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !body.trim()) return;
    setSending(true);
    const { error } = await createClient().rpc("finder_send", { p_finder: token, p_body: body.trim() });
    setSending(false);
    if (error) {
      console.error(error);
      return toast.error(friendlyError(error, "보내지 못했어요."));
    }
    setBody("");
    load();
  }

  async function subscribe() {
    if (!token) return;
    setSubscribing(true);
    try {
      const sub = await browserPushSubscription();
      const { error } = await createClient().rpc("finder_subscribe", { p_finder: token, p_endpoint: sub.endpoint, p_p256dh: sub.p256dh, p_auth: sub.auth });
      if (error) throw error;
      setSubscribed(true);
      toast.success("주인이 답장하면 알림으로 알려 드릴게요.");
    } catch (err) {
      console.error(err);
      toast.error(friendlyError(err, "알림을 켜지 못했어요."));
    } finally {
      setSubscribing(false);
    }
  }

  async function copyLink() {
    if (!token) return;
    const ok = await copyText(`${window.location.origin}/r#t=${token}`);
    if (ok) toast.success("대화 주소를 복사했어요. 메모장 등에 저장해 두면 다른 기기에서도 들어올 수 있어요.");
    else toast.error("복사하지 못했어요. 주소창의 주소를 직접 저장해 주세요.");
  }

  if (!ready) return <ChatSkeleton />;

  if (!token) {
    return refs.length === 0 ? (
      <EmptyState icon={<MessageCircle className="h-7 w-7" />} title="이 기기에서 보낸 제보 대화가 없어요" description="QR을 찍고 제보할 때 '익명 대화'를 고르면 여기서 주인과 대화할 수 있어요." />
    ) : (
      <Card className="space-y-3">
        <p className="font-bold">내가 보낸 제보 대화</p>
        {refs.map((r) => (
          <a key={r.token} href={`/r#t=${r.token}`} className="block rounded-xl bg-slate-50 p-3 text-[14px] hover:bg-slate-100">
            <span className="font-semibold">{r.label}</span>
            <span className="ml-2 text-ink-muted">{timeAgo(r.createdAt)}</span>
          </a>
        ))}
      </Card>
    );
  }

  if (thread === "missing") {
    return <EmptyState icon={<MessageCircle className="h-7 w-7" />} title="대화를 찾을 수 없어요" description="주소가 잘못됐거나, 주인이 이동수단을 지워 대화가 끝났어요." />;
  }
  if (!thread) {
    return loadError ? (
      <ErrorState
        title="대화를 불러오지 못했어요"
        description="인터넷 연결을 확인하고 다시 시도해 주세요."
        action={
          <Button full loading={retrying} loadingText="불러오는 중..." onClick={retry}>
            다시 시도
          </Button>
        }
      />
    ) : (
      <ChatSkeleton />
    );
  }

  return (
    <>
      <Card className="space-y-2">
        <p className="flex items-center gap-2 font-bold">
          <CircleCheck aria-hidden className="h-5 w-5 text-emerald-600" />
          제보를 보냈어요. 고마워요!
        </p>
        <p className="text-[14px] leading-relaxed text-ink-soft">
          {[thread.vehicle.color, thread.vehicle.brand].filter(Boolean).join(" ") || "이동수단"} 주인에게 알림이 갔어요. 주인이 답장하면 이 화면에 보여요. 내 이름·번호는 주인에게 보이지 않아요.
        </p>
        <div className="grid grid-cols-2 gap-2 pt-1">
          <Button variant={subscribed ? "secondary" : "primary"} loading={subscribing} loadingText="켜는 중..." icon={<Bell aria-hidden className="h-4 w-4" />} onClick={subscribe} disabled={subscribed}>
            {subscribed ? "알림 켜짐" : "답장 알림 받기"}
          </Button>
          <Button variant="secondary" icon={<Copy aria-hidden className="h-4 w-4" />} onClick={copyLink}>
            대화 주소 저장
          </Button>
        </div>
      </Card>

      <Card className="space-y-3">
        <p className="text-[13px] font-semibold text-ink-muted">익명 대화 · {formatDateTime(thread.created_at)} 제보</p>
        <div className="rounded-xl bg-slate-50 p-3 text-[14px]">
          <p className="text-[12px] font-semibold text-ink-muted">내가 보낸 제보</p>
          <p className="mt-0.5 whitespace-pre-line">{thread.description}</p>
          {thread.location_text && <p className="mt-0.5 text-ink-muted">📍 {thread.location_text}</p>}
        </div>
        <ul className="space-y-2">
          {thread.messages.map((m) => (
            <li key={m.id} className={m.sender === "finder" ? "flex justify-end" : "space-y-1.5"}>
              <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-[15px] leading-relaxed ${m.sender === "finder" ? "bg-brand-600 text-white" : "bg-slate-100"}`}>
                {m.sender === "owner" && <p className="text-[11px] font-bold text-brand-700">주인</p>}
                <p className="whitespace-pre-line">{m.body}</p>
                <p className={`mt-0.5 text-[11px] ${m.sender === "finder" ? "text-brand-100" : "text-ink-faint"}`}>{timeAgo(m.created_at)}</p>
              </div>
              {m.sender === "owner" && hasMoneyRequest(m.body) && <MoneyWarning />}
            </li>
          ))}
        </ul>
        {thread.messages.length === 0 && <p className="text-center text-[13px] text-ink-muted">아직 답장이 없어요. 주인이 확인하면 여기에 답장이 와요.</p>}
        <div ref={endRef} className="scroll-mb-28" />
        {thread.open ? (
          <form onSubmit={send} className="space-y-2">
            <Textarea label="메시지" placeholder="예) 정문 앞 거치대에 그대로 있어요" value={body} maxLength={500} rows={2} onChange={(e) => setBody(e.target.value)} />
            <Button type="submit" full loading={sending} loadingText="보내는 중..." icon={<Send aria-hidden className="h-4 w-4" />} disabled={!body.trim()}>
              보내기
            </Button>
          </form>
        ) : (
          <p className="text-center text-[13px] text-ink-muted">대화가 끝났어요 (제보 후 14일).</p>
        )}
      </Card>
      <p className="text-center text-[12px] leading-relaxed text-ink-muted">직접 만나서 돌려줄 때는 사람이 많은 곳에서 만나세요. 돈을 먼저 요구하거나 주는 건 피하세요.</p>
    </>
  );
}
