"use client";

import { useCallback, useEffect, useState } from "react";
import { Send } from "lucide-react";
import { MoneyWarning } from "@/components/alerts/TrustInfo";
import { Button, Textarea, useToast } from "@/components/ui";
import { hasMoneyRequest, type Trust } from "@/lib/alerts";
import { friendlyError, timeAgo } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";

type Msg = { id: string; sender: "owner" | "finder"; body: string; created_at: string };

/** 주인 쪽 익명 대화 (발견자 이름·번호는 보이지 않아요) */
export function OwnerChat({ reportId, createdAt, trust, anonymous }: { reportId: string; createdAt: string; trust: Trust | null; anonymous: boolean }) {
  const toast = useToast();
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const open = Date.now() - new Date(createdAt).getTime() < 14 * 86400e3;

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
    const id = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 5000);
    return () => clearInterval(id);
  }, [load]);

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
      {open ? (
        <form onSubmit={send} className="space-y-2">
          <Textarea label="답장" placeholder="예) 정말 고마워요! 지금 그쪽으로 갈게요." value={body} maxLength={500} rows={2} onChange={(e) => setBody(e.target.value)} />
          <Button type="submit" full loading={sending} loadingText="보내는 중..." icon={<Send aria-hidden className="h-4 w-4" />} disabled={!body.trim()}>
            답장 보내기
          </Button>
        </form>
      ) : (
        <p className="text-[13px] text-ink-muted">대화가 끝났어요 (제보 후 14일).</p>
      )}
    </div>
  );
}
