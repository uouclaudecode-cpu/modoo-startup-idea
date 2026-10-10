"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Inbox, RotateCcw, ShieldCheck, Siren, Trash2 } from "lucide-react";
import { Button, ButtonLink, Card, Modal, useToast } from "@/components/ui";
import { friendlyError } from "@/lib/format";
import type { VehicleStatus } from "@/lib/status";
import { createClient } from "@/lib/supabase/client";
import { LostReportButton } from "@/components/vehicle/LostReportButton";

type Action = "search" | "recover" | "reset" | "delete";
type Found = { id: string; status: string; expires_at: string | null };
type Confirm = { title: string; body: string; button: string; variant: "danger" | "primary" };

// '수색 중으로 바꾸기'(분실)는 공용 '분실·도난 신고' 버튼(LostReportButton)의 고르기 창에서 해요
const CONFIRM: Record<Exclude<Action, "search">, Confirm> = {
  recover: {
    title: "회수 완료로 바꿀까요?",
    body: "이동수단을 찾았나요? 상태를 '회수 완료'로 바꾸면 QR 화면의 분실 안내가 사라져요.",
    button: "회수 완료로 바꾸기",
    variant: "primary",
  },
  reset: {
    title: "정상으로 되돌리기",
    body: "상태를 '정상'으로 바꿔요.",
    button: "정상으로 바꾸기",
    variant: "primary",
  },
  delete: {
    title: "이동수단 삭제",
    body: "삭제하면 목록에서 사라지고, 이 QR을 찍으면 '지금은 쓸 수 없는 QR'로 보여요. 되돌릴 수 없어요.",
    button: "삭제하기",
    variant: "danger",
  },
};

export function StatusActions({
  vehicleId,
  status,
  foundReports,
  totalReports,
  openAlertId,
}: {
  vehicleId: string;
  status: VehicleStatus;
  foundReports: number;
  totalReports: number;
  /** 진행 중인(open) 도난 경보 id. 없거나 안 넘겨 주면 72시간이 지난 경보까지 여기서 직접 찾아요 */
  openAlertId?: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState<Exclude<Action, "search"> | null>(null);
  const [loading, setLoading] = useState(false);
  // 아직 안 끝낸 경보 찾기 (undefined = 확인 중). 기간이 지난(expired)·숨긴 경보도 '찾았어요'로 끝내야 제보자에게 알림·사례금 기록이 남아요
  const [looked, setLooked] = useState<Found | null | undefined>(undefined);
  const needLookup = !openAlertId && status === "searching";

  useEffect(() => {
    if (!needLookup) return;
    let alive = true;
    createClient()
      .from("theft_alerts")
      .select("id, status, expires_at")
      .eq("vehicle_id", vehicleId)
      .in("status", ["open", "expired", "hidden"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) console.error(error);
        if (alive) setLooked((data as Found | null) ?? null);
      });
    return () => {
      alive = false;
    };
  }, [needLookup, vehicleId]);

  const found: Found | null | undefined = openAlertId ? { id: openAlertId, status: "open", expires_at: null } : status === "searching" ? looked : null;
  const alertId = found === undefined ? undefined : (found?.id ?? null);
  // 기간이 지난 경보 (정리 작업이 아직 안 돌아 open으로 남은 것도)
  const alertEnded = found?.status === "expired" || (found?.status === "open" && !!found.expires_at && new Date(found.expires_at) <= new Date());

  async function run(action: Action) {
    setLoading(true);
    const patch =
      action === "delete"
        ? { deleted_at: new Date().toISOString() }
        : { status: action === "search" ? "searching" : action === "recover" ? "recovered" : "active" };
    const { error } = await createClient().from("vehicles").update(patch).eq("id", vehicleId);
    setLoading(false);
    setPending(null);
    if (error) {
      console.error(error);
      toast.error(friendlyError(error, "상태를 바꾸지 못했어요. 다시 시도해 주세요."));
      return;
    }
    if (action === "delete") {
      toast.success("삭제했어요.");
      router.replace("/");
    } else {
      toast.success(action === "search" ? "수색 중으로 바꿨어요. 발견 제보를 기다려요." : action === "recover" ? "회수 완료! 다행이에요." : "정상으로 바꿨어요.");
    }
    router.refresh();
  }

  const c = pending ? CONFIRM[pending] : null;

  return (
    <Card className="space-y-3">
      {/* 회수 완료 뒤 또 잃어버려도 여기서 바로 신고해요 */}
      {status !== "searching" && <LostReportButton vehicleId={vehicleId} />}
      {status === "searching" && (
        <>
          <ButtonLink href={`/vehicles/${vehicleId}/reports`} full size="lg" variant={foundReports ? "danger" : "primary"} icon={<Inbox aria-hidden className="h-5 w-5" />}>
            발견 제보 확인{foundReports ? ` (${foundReports}건)` : ""}
          </ButtonLink>
          {alertId === undefined ? (
            <Button variant="secondary" full size="lg" loading loadingText="확인 중...">
              회수 완료
            </Button>
          ) : alertId ? (
            // 경보가 진행 중이면 경보 화면에서 끝내야 도움 준 제보자에게 알림·사례금 기록이 남아요
            <div className="space-y-1.5">
              <ButtonLink href={`/alerts/${alertId}?resolve=1`} variant="secondary" full size="lg" icon={<ShieldCheck aria-hidden className="h-5 w-5" />}>
                찾았어요 · 경보 끝내기
              </ButtonLink>
              <p className="text-center text-[13px] leading-relaxed text-ink-muted">도움 준 제보자를 골라 고마움을 전하고, 약속한 사례금을 기록해요.</p>
              {/* 72시간이 지나 끝난 경보: 아직 못 찾았으면 다시 보낼 수 있어요 */}
              {alertEnded && (
                <ButtonLink href={`/vehicles/${vehicleId}/alert`} variant="ghost" full className="text-rose-700" icon={<Siren aria-hidden className="h-4 w-4" />}>
                  근처에 도난 경보 다시 보내기
                </ButtonLink>
              )}
            </div>
          ) : (
            <>
              <Button variant="secondary" full size="lg" icon={<ShieldCheck aria-hidden className="h-5 w-5" />} onClick={() => setPending("recover")}>
                회수 완료
              </Button>
              {/* 분실로 신고했다가 도난 같으면 여기서 경보로 */}
              <ButtonLink href={`/vehicles/${vehicleId}/alert`} variant="ghost" full className="text-rose-700" icon={<Siren aria-hidden className="h-4 w-4" />}>
                근처에 도난 경보 보내기
              </ButtonLink>
            </>
          )}
        </>
      )}
      {status === "recovered" && (
        <Button variant="secondary" full size="lg" icon={<RotateCcw aria-hidden className="h-5 w-5" />} onClick={() => setPending("reset")}>
          정상으로 되돌리기
        </Button>
      )}
      {status !== "searching" && totalReports > 0 && (
        <ButtonLink href={`/vehicles/${vehicleId}/reports`} full variant="ghost" icon={<Inbox aria-hidden className="h-4 w-4" />}>
          지난 제보·연락 {totalReports}건 보기
        </ButtonLink>
      )}
      <div className="pt-2 text-center">
        <button
          type="button"
          onClick={() => setPending("delete")}
          className="inline-flex h-10 items-center gap-1 rounded-lg px-3 text-[13px] font-semibold text-rose-600 hover:bg-rose-50"
        >
          <Trash2 aria-hidden className="h-3.5 w-3.5" />
          이동수단 삭제
        </button>
      </div>

      <Modal
        open={Boolean(c)}
        onClose={() => !loading && setPending(null)}
        title={c?.title ?? ""}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPending(null)} disabled={loading}>
              취소
            </Button>
            <Button variant={c?.variant} loading={loading} loadingText="바꾸는 중..." onClick={() => pending && run(pending)}>
              {c?.button}
            </Button>
          </>
        }
      >
        {c?.body}
      </Modal>
    </Card>
  );
}
