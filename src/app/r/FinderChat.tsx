"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, CircleCheck, Copy, MessageCircle, Send } from "lucide-react";
import { reportTodo, type MyReport } from "@/components/alerts/MyAlerts";
import { MoneyWarning } from "@/components/alerts/TrustInfo";
import { ChatSkeleton } from "@/components/skeletons/PageSkeletons";
import { Button, ButtonLink, Card, EmptyState, ErrorState, Textarea, useToast } from "@/components/ui";
import { hasMoneyRequest } from "@/lib/alerts";
import { copyText } from "@/lib/clipboard";
import { loadFinderThreads, saveFinderThread, type FinderThreadRef } from "@/lib/finderThreads";
import { formatDateTime, friendlyError, timeAgo } from "@/lib/format";
import { browserPushSubscription } from "@/lib/push";
import { createClient } from "@/lib/supabase/client";
import { typeLabel } from "@/lib/types";

type Thread = {
  report_id: string;
  kind: "found" | "contact";
  created_at: string;
  description: string;
  location_text: string | null;
  open: boolean;
  vehicle: { type: string; brand: string | null; color: string | null };
  messages: { id: string; sender: "owner" | "finder"; body: string; created_at: string }[];
  blocked?: boolean;
  /** 계정으로 연 대화만: 대화를 고른 제보인지 */
  chat?: boolean;
};

/** 주소의 #rid=… (답장 알림·내 경보·제보 목록에서 와요) */
function ridFromHash() {
  return window.location.hash.match(/rid=([0-9a-f-]{36})/)?.[1] ?? null;
}

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
  // 대화 열쇠가 이 기기에 없을 때: 로그인한 계정으로 보낸 제보면 제보 번호로 열어요
  const [rid, setRid] = useState<string | null>(null);
  // 로그인해서 보낸 제보 대화 (이 기기에 열쇠가 없어도 계정으로 열 수 있어요)
  const [mine, setMine] = useState<MyReport[] | null>(null);
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
      // 답장 알림(#rid=…)으로 왔는데 이 기기에 없는 대화면 다른 대화를 대신 열지 않아요
      const r = t ? null : ridFromHash();
      setToken(t ?? (!r && list.length === 1 ? list[0].token : null));
      setRid(r);
      setReady(true);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  // 대화 목록 화면일 때만: 내 계정으로 보낸 제보 중 대화가 있는 것
  useEffect(() => {
    if (!ready || token || rid || mine) return;
    createClient()
      .rpc("my_reports")
      .then(({ data, error }) => setMine(error ? [] : ((data ?? []) as MyReport[]).filter((r) => r.chat)));
  }, [ready, token, rid, mine]);

  // 다른 대화로 바뀌면 이전 대화 내용·알림 상태를 지워요
  useEffect(() => {
    setThread(null);
    setSubscribed(false);
    setBody("");
    setLoadError(false);
    seenCountRef.current = null;
  }, [token, rid]);

  const load = useCallback(async () => {
    if (!token && !rid) return;
    const { data, error } = token
      ? await createClient().rpc("finder_thread", { p_finder: token })
      : await createClient().rpc("finder_thread_mine", { p_report: rid });
    if (error) {
      console.error(error);
      // 계정으로 여는데 로그인 전이면(권한 없음) '로그인하기' 안내로
      if (!token && error.code === "42501") return setThread("missing");
      setLoadError(true);
      return;
    }
    setLoadError(false);
    setThread(data ? (data as Thread) : "missing");
    // 다른 기기에서 저장한 대화 주소로 열었어도 이 기기에 기억해 둬요 (답장 알림을 누르면 바로 열리게)
    const reportId = (data as { report_id?: string } | null)?.report_id;
    if (token && reportId && !loadFinderThreads().some((t) => t.token === token)) {
      saveFinderThread({ token, reportId, createdAt: (data as { created_at?: string }).created_at ?? new Date().toISOString(), label: "발견 제보" });
    }
  }, [token, rid]);

  async function retry() {
    setRetrying(true);
    await load();
    setRetrying(false);
  }

  // 화면이 보일 때만 5초마다 새 답장 확인
  useEffect(() => {
    if (!token && !rid) return;
    load();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 5000);
    return () => clearInterval(id);
  }, [token, rid, load]);

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
    if ((!token && !rid) || !body.trim()) return;
    setSending(true);
    const { error } = token
      ? await createClient().rpc("finder_send", { p_finder: token, p_body: body.trim() })
      : await createClient().rpc("finder_send_mine", { p_report: rid, p_body: body.trim() });
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
    if (ok) toast.success("대화 주소를 복사했어요. 저장해 두면 다른 기기에서도 열 수 있어요.");
    else toast.error("복사하지 못했어요. 주소창의 주소를 직접 저장해 주세요.");
  }

  if (!ready) return <ChatSkeleton />;

  if (!token && !rid) {
    if (mine === null) return <ChatSkeleton />;
    const local = refs.filter((r) => !mine.some((m) => m.id === r.reportId));
    return local.length === 0 && mine.length === 0 ? (
      <EmptyState
        icon={<MessageCircle className="h-7 w-7" />}
        title="아직 보낸 제보 대화가 없어요"
        description="QR을 찍어 제보하면 여기서 주인과 대화할 수 있어요."
        action={
          <ButtonLink href="/alerts#mine" variant="secondary">
            내 경보·제보 보기
          </ButtonLink>
        }
      />
    ) : (
      <Card className="space-y-3">
        <p className="font-bold">내가 보낸 제보 대화</p>
        {mine.map((m) => (
          <a key={m.id} href={`/r#rid=${m.id}`} className="flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-[14px] hover:bg-slate-100">
            <span className="min-w-0 flex-1 truncate font-semibold">{[m.color, m.brand, typeLabel(m.type)].filter(Boolean).join(" ")}</span>
            {reportTodo(m) && <span className="flex-none rounded-full bg-rose-600 px-2 py-0.5 text-[12px] font-bold text-white">새 답장</span>}
            <span className="flex-none text-ink-muted">{timeAgo(m.created_at)}</span>
          </a>
        ))}
        {local.map((r) => (
          <a key={r.token} href={`/r#t=${r.token}`} className="block rounded-xl bg-slate-50 p-3 text-[14px] hover:bg-slate-100">
            <span className="font-semibold">{r.label}</span>
            <span className="ml-2 text-ink-muted">{timeAgo(r.createdAt)}</span>
          </a>
        ))}
      </Card>
    );
  }

  if (thread === "missing") {
    return rid ? (
      <EmptyState
        icon={<MessageCircle className="h-7 w-7" />}
        title="대화를 찾을 수 없어요"
        description="제보를 보낸 계정으로 로그인하거나, 제보를 보낸 기기에서 열어 주세요."
        action={
          <ButtonLink href={`/login?next=${encodeURIComponent(`/r#rid=${rid}`)}`} variant="secondary">
            로그인하기
          </ButtonLink>
        }
      />
    ) : (
      <EmptyState icon={<MessageCircle className="h-7 w-7" />} title="대화를 찾을 수 없어요" description="주소가 잘못됐거나, 주인이 이동수단을 지워 대화가 끝났어요." />
    );
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
          {thread.chat === false
            ? "주인에게 알림이 갔어요."
            : rid
              ? "주인이 답장하면 알림으로 알려 드려요."
              : "주인이 답장하면 여기에 보여요."}
        </p>
        {token && (
        <div className="grid gap-2 pt-1 min-[400px]:grid-cols-2">
          <Button variant={subscribed ? "secondary" : "primary"} loading={subscribing} loadingText="켜는 중..." icon={<Bell aria-hidden className="h-4 w-4" />} onClick={subscribe} disabled={subscribed}>
            {subscribed ? "알림 켜짐" : "답장 알림 받기"}
          </Button>
          <Button variant="secondary" icon={<Copy aria-hidden className="h-4 w-4" />} onClick={copyLink}>
            대화 주소 저장
          </Button>
        </div>
        )}
      </Card>

      <Card className="space-y-3">
        <p className="text-[13px] font-semibold text-ink-muted">
          {thread.chat === false ? "내가 보낸 제보" : "익명 대화"} · {formatDateTime(thread.created_at)} 제보
        </p>
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
        {thread.messages.length === 0 && thread.chat !== false && <p className="text-center text-[13px] text-ink-muted">아직 답장이 없어요.</p>}
        <div ref={endRef} className="scroll-mb-28" />
        {thread.open ? (
          <form onSubmit={send} className="space-y-2">
            <Textarea label="메시지" placeholder="예) 정문 앞 거치대에 그대로 있어요" value={body} maxLength={500} rows={2} onChange={(e) => setBody(e.target.value)} />
            <Button type="submit" full loading={sending} loadingText="보내는 중..." icon={<Send aria-hidden className="h-4 w-4" />} disabled={!body.trim()}>
              보내기
            </Button>
          </form>
        ) : thread.chat === false ? null : (
          <p className="text-center text-[13px] text-ink-muted">{thread.blocked ? "주인이 대화를 끝냈어요." : "대화가 끝났어요 (제보 후 14일)."}</p>
        )}
      </Card>
      <p className="text-center text-[12px] leading-relaxed text-ink-muted">만날 때는 사람 많은 곳에서, 돈 거래는 피해 주세요.</p>
    </>
  );
}
