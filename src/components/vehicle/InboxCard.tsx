import Link from "next/link";
import { ChevronRight, Inbox, MapPin, MessageCircle, PhoneCall } from "lucide-react";
import { Card } from "@/components/ui";
import { timeAgo } from "@/lib/format";

export type InboxItem = {
  reportId: string;
  vehicleId: string;
  vehicleName: string;
  kind: "found" | "contact";
  mode: "chat" | "callback" | "none";
  preview: string;
  at: string;
  /** 발견자가 마지막으로 말했거나, 아직 답하지 않은 새 대화·전화 요청 (주인이 '확인함·연락함'으로 표시하면 빠져요) */
  needsReply: boolean;
};

/** 홈 위쪽: 모든 이동수단의 최근 발견 제보·익명 대화를 한곳에 */
export function InboxCard({ items }: { items: InboxItem[] }) {
  if (items.length === 0) return null;
  const waiting = items.filter((i) => i.needsReply).length;
  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 font-bold">
          <Inbox aria-hidden className="h-5 w-5 text-brand-600" />
          받은 제보·대화
        </p>
        {waiting > 0 && <span className="rounded-full bg-rose-600 px-2.5 py-0.5 text-[12px] font-bold text-white">답장 기다림 {waiting}</span>}
      </div>
      <ul className="divide-y divide-line/70">
        {items.map((i) => (
          <li key={i.reportId}>
            <Link href={`/vehicles/${i.vehicleId}/reports#r-${i.reportId}`} className="flex items-center gap-3 py-2.5">
              <span
                aria-hidden
                className={`grid h-9 w-9 flex-none place-items-center rounded-full ${i.needsReply ? "bg-rose-50 text-rose-600" : "bg-slate-100 text-ink-muted"}`}
              >
                {i.mode === "chat" ? <MessageCircle className="h-4 w-4" /> : i.mode === "callback" ? <PhoneCall className="h-4 w-4" /> : <MapPin className="h-4 w-4" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-[13px] text-ink-muted">
                  <span className="truncate font-semibold text-ink">{i.vehicleName}</span>
                  <span className="flex-none whitespace-nowrap">· {timeAgo(i.at)}</span>
                  {i.needsReply && <span className="flex-none font-bold text-rose-600">· {i.mode === "callback" ? "전화 요청" : "새 메시지"}</span>}
                </span>
                <span className="block truncate text-[14px]">{i.preview}</span>
              </span>
              <ChevronRight aria-hidden className="h-4 w-4 flex-none text-ink-faint" />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
