"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BookOpen, Store, Trash2 } from "lucide-react";
import { Button, Card, EmptyState, Modal, useToast } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatDate, friendlyError } from "@/lib/format";
import { PART_META, PART_ORDER, won, type MaintenanceLog, type PartKind } from "@/lib/parts";
import { createClient } from "@/lib/supabase/client";

const labelOf = (kind: string) => PART_META[kind as PartKind]?.label ?? kind;
const emojiOf = (kind: string) => PART_META[kind as PartKind]?.emoji ?? "🔧";

/** 정비 이력 (최신순) + 항목별 보기 + 총 비용 */
export function MaintenanceDiary({ logs, ownedSince = null }: { logs: MaintenanceLog[]; /** 지금 주인이 된 때 (이전 기록 표시용) */ ownedSince?: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const [filter, setFilter] = useState<string>("all");
  const [deleting, setDeleting] = useState<MaintenanceLog | null>(null);
  const [loading, setLoading] = useState(false);

  const kinds = PART_ORDER.filter((k) => logs.some((l) => l.kind === k));
  // 고른 항목의 기록을 모두 지웠다면 다시 전체로 (필터가 빈 항목에 갇히지 않게)
  const active = filter !== "all" && kinds.includes(filter as PartKind) ? filter : "all";
  const shown = active === "all" ? logs : logs.filter((l) => l.kind === active);
  const total = shown.reduce((a, l) => a + (l.cost ?? 0), 0);

  async function remove() {
    if (!deleting) return;
    setLoading(true);
    const { error } = await createClient().from("maintenance_logs").delete().eq("id", deleting.id);
    setLoading(false);
    if (error) {
      console.error(error);
      toast.error(friendlyError(error, "지우지 못했어요. 다시 시도해 주세요."));
      return;
    }
    setDeleting(null);
    toast.success("정비 기록을 지웠어요.");
    router.refresh();
  }

  return (
    <section aria-labelledby="diary-title" className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <h2 id="diary-title" className="text-lg font-bold">
          정비 다이어리
        </h2>
        {logs.length > 0 && (
          <p className="text-[13px] text-ink-muted">
            {active === "all" ? "총" : labelOf(active)} 비용 <b className="text-ink">{won(total)}</b> · {shown.length}건
          </p>
        )}
      </div>

      {logs.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="h-7 w-7" />}
          title="아직 정비 기록이 없어요"
          description="위에서 ‘정비 완료’를 누르면 날짜·비용·정비소·메모가 여기에 차곡차곡 쌓여요."
        />
      ) : (
        <>
          {kinds.length > 1 && (
            <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
              {["all", ...kinds].map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setFilter(k)}
                  aria-pressed={active === k}
                  className={cn(
                    "flex-none rounded-full px-3 py-1.5 text-sm font-semibold ring-1 ring-inset",
                    active === k ? "bg-brand-600 text-white ring-brand-600" : "bg-white text-ink-soft ring-line hover:bg-slate-50",
                  )}
                >
                  {k === "all" ? "전체" : `${emojiOf(k)} ${labelOf(k)}`}
                </button>
              ))}
            </div>
          )}
          <ol className="space-y-2">
            {shown.map((l) => (
              <li key={l.id}>
                <Card className="space-y-1.5 p-4">
                  <div className="flex items-center gap-2">
                    <span aria-hidden>{emojiOf(l.kind)}</span>
                    <p className="font-bold">{labelOf(l.kind)}</p>
                    {ownedSince && l.created_at < ownedSince && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-ink-muted">이전 주인 기록</span>
                    )}
                    <time className="ml-auto text-[13px] tabular-nums text-ink-muted" dateTime={l.serviced_on}>
                      {formatDate(l.serviced_on + "T00:00:00+09:00")}
                    </time>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-ink-soft">
                    <span>{l.cost != null ? won(l.cost) : "비용 기록 없음"}</span>
                    {l.shop && (
                      <span className="inline-flex items-center gap-1">
                        <Store aria-hidden className="h-3.5 w-3.5" />
                        {l.shop}
                      </span>
                    )}
                    <span className="text-ink-muted">정비 전까지 {(l.distance_m / 1000).toFixed(1)}km 주행</span>
                  </div>
                  {l.memo && <p className="whitespace-pre-line rounded-xl bg-slate-50 p-2.5 text-[14px] leading-relaxed">{l.memo}</p>}
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => setDeleting(l)}
                      className="-m-2 inline-flex items-center gap-1 rounded-lg p-2 text-[13px] text-ink-faint hover:bg-slate-100 hover:text-ink-soft"
                    >
                      <Trash2 aria-hidden className="h-3.5 w-3.5" />
                      삭제
                    </button>
                  </div>
                </Card>
              </li>
            ))}
          </ol>
        </>
      )}

      <Modal
        open={Boolean(deleting)}
        onClose={() => !loading && setDeleting(null)}
        title="이 정비 기록을 지울까요?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)} disabled={loading}>
              취소
            </Button>
            <Button variant="danger" loading={loading} loadingText="지우는 중..." onClick={remove}>
              지우기
            </Button>
          </>
        }
      >
        이 기록만 지워지고, 소모품의 현재 거리는 바뀌지 않아요. 되돌릴 수 없어요.
      </Modal>
    </section>
  );
}
