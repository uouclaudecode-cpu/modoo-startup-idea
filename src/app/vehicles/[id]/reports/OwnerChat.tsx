"use client";

import { useCallback, useEffect, useState } from "react";
import { Ban, Send } from "lucide-react";
import { MoneyWarning } from "@/components/alerts/TrustInfo";
import { Button, Modal, Textarea, useToast } from "@/components/ui";
import { hasMoneyRequest, type Trust } from "@/lib/alerts";
import { friendlyError, timeAgo } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";

type Msg = { id: string; sender: "owner" | "finder"; body: string; created_at: string };

type Props = {
  reportId: string;
  createdAt: string;
  trust: Trust | null;
  anonymous: boolean;
  /** 주인이 이 대화를 차단한 시각 (차단 안 했으면 null) */
  blockedAt: string | null;
  onBlockedChange: (at: string | null) => void;
};

/** 주인 쪽 익명 대화 (발견자 이름·번호는 보이지 않아요). 장난·괴롭힘이면 이 대화만 차단할 수 있어요. */
export function OwnerChat({ reportId, createdAt, trust, anonymous, blockedAt, onBlockedChange }: Props) {
  const toast = useToast();
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const withinWindow = Date.now() - new Date(createdAt).getTime() < 14 * 86400e3;
  const open = withinWindow && !blockedAt;

  const load = useCallback(async () => {
    const { data, error } = await createClient()
      .from("report_messages")
      .select("id, sender, body, created_at")
      .eq("report_id", reportId)
      .order("created_at");
    if (error) return console.error(error);
    setMsgs(data as Msg[]);
  }, [reportId]);

  useEffect(() => {
    load();
    if (!open) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 5000);
    return () => clearInterval(id);
  }, [load, open]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setSending(true);
    const { error } = await createClient().rpc("owner_send", { p_report: reportId, p_body: body.trim() });
    setSending(false);
    if (error) {
      console.error(error);
      return toast.error(friendlyError(error, "보내지 못했어요."));
    }
    setBody("");
    load();
  }

  async function setBlocked(next: boolean) {
    setBlocking(true);
    const { data, error } = await createClient().rpc("block_report_chat", { p_report: reportId, p_block: next });
    setBlocking(false);
    if (error) {
      console.error(error);
      return toast.error(friendlyError(error, next ? "차단하지 못했어요. 잠시 후 다시 시도해 주세요." : "차단을 풀지 못했어요. 잠시 후 다시 시도해 주세요."));
    }
    setConfirmBlock(false);
    onBlockedChange(next ? ((data as string | null) ?? new Date().toISOString()) : null);
    toast.success(next ? "이 대화를 차단했어요. 발견자는 더 보낼 수 없고, 알림도 오지 않아요." : "차단을 풀었어요. 다시 대화할 수 있어요.");
  }

  return (
    <div className="space-y-2 rounded-xl bg-slate-50 p-3">
      <p className="text-[13px] font-semibold text-ink-muted">발견자와 익명 대화</p>
      {msgs === null ? (
        <p className="text-[13px] text-ink-muted">불러오는 중...</p>
      ) : msgs.length === 0 ? (
        <p className="text-[13px] text-ink-muted">아직 대화가 없어요. 먼저 고맙다는 인사를 보내 보세요.</p>
      ) : (
        <ul className="space-y-2">
          {msgs.map((m) => (
            <li key={m.id} className={m.sender === "owner" ? "flex justify-end" : "space-y-1.5"}>
              <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-[15px] leading-relaxed ${m.sender === "owner" ? "bg-brand-600 text-white" : "bg-white ring-1 ring-line"}`}>
                {m.sender === "finder" && <p className="text-[11px] font-bold text-orange-600">발견자</p>}
                <p className="whitespace-pre-line">{m.body}</p>
                <p className={`mt-0.5 text-[11px] ${m.sender === "owner" ? "text-brand-100" : "text-ink-faint"}`}>{timeAgo(m.created_at)}</p>
              </div>
              {m.sender === "finder" && hasMoneyRequest(m.body) && <MoneyWarning trust={trust} anonymous={anonymous} />}
            </li>
          ))}
        </ul>
      )}
      {blockedAt ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-3 py-2.5 text-[13px] text-ink-soft ring-1 ring-line">
          <span className="flex min-w-0 items-center gap-1.5">
            <Ban aria-hidden className="h-4 w-4 flex-none text-ink-muted" />
            차단한 대화예요. 발견자는 더 보낼 수 없어요.
          </span>
          {withinWindow && (
            <button
              type="button"
              onClick={() => setBlocked(false)}
              disabled={blocking}
              className="-my-2 py-2 font-semibold text-ink-muted underline-offset-2 hover:underline disabled:opacity-60"
            >
              {blocking ? "푸는 중..." : "차단 풀기"}
            </button>
          )}
        </div>
      ) : open ? (
        <>
          <form onSubmit={send} className="space-y-2">
            <Textarea label="답장" placeholder="예) 정말 고마워요! 지금 그쪽으로 갈게요." value={body} maxLength={500} rows={2} onChange={(e) => setBody(e.target.value)} />
            <Button type="submit" full loading={sending} loadingText="보내는 중..." icon={<Send aria-hidden className="h-4 w-4" />} disabled={!body.trim()}>
              답장 보내기
            </Button>
          </form>
          <div className="text-right">
            <button
              type="button"
              onClick={() => setConfirmBlock(true)}
              className="inline-flex items-center gap-1 py-1.5 text-[13px] font-semibold text-ink-muted underline-offset-2 hover:text-rose-700 hover:underline"
            >
              <Ban aria-hidden className="h-3.5 w-3.5" />이 대화 차단
            </button>
          </div>
        </>
      ) : (
        <p className="text-[13px] text-ink-muted">대화가 끝났어요 (제보 후 14일).</p>
      )}

      <Modal
        open={confirmBlock}
        onClose={() => !blocking && setConfirmBlock(false)}
        title="이 대화를 차단할까요?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmBlock(false)} disabled={blocking}>
              취소
            </Button>
            <Button variant="danger" loading={blocking} loadingText="차단하는 중..." icon={<Ban aria-hidden className="h-4 w-4" />} onClick={() => setBlocked(true)}>
              차단하기
            </Button>
          </>
        }
      >
        <ul className="list-disc space-y-1.5 pl-5">
          <li>발견자는 이 대화로 더는 메시지를 보낼 수 없고, 나에게 알림도 오지 않아요.</li>
          <li>지금까지 받은 제보와 대화는 그대로 남아요.</li>
          <li>장난이나 돈 요구, 욕설이 계속될 때 써 주세요. 나중에 차단을 풀 수 있어요.</li>
        </ul>
      </Modal>
    </div>
  );
}
