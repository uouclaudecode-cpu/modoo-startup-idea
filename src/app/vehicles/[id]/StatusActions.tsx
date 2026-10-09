"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Inbox, RotateCcw, Search, ShieldCheck, Siren, Trash2 } from "lucide-react";
import { Button, ButtonLink, Card, Modal, useToast } from "@/components/ui";
import { friendlyError } from "@/lib/format";
import type { VehicleStatus } from "@/lib/status";
import { createClient } from "@/lib/supabase/client";

type Action = "search" | "recover" | "reset" | "delete";
type Confirm = { title: string; body: string; button: string; variant: "danger" | "primary" };

// '수색 중으로 바꾸기'(분실)는 아래 '분실·도난 신고' 고르기 창에서 바로 해요
const CONFIRM: Record<Exclude<Action, "search">, Confirm> = {
  recover: {
    title: "회수 완료",
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
    body: "삭제하면 목록에서 사라지고, 이 QR을 스캔하면 '현재 사용할 수 없는 QR'로 보여요. 되돌릴 수 없어요.",
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
  /** 진행 중인 도난 경보 id. 화면에서 안 넘겨 주면(undefined) 여기서 직접 찾아요 */
  openAlertId?: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState<Exclude<Action, "search"> | null>(null);
  const [choice, setChoice] = useState(false);
  const [loading, setLoading] = useState(false);
  // 진행 중인 경보 찾기 (undefined = 확인 중)
  const [looked, setLooked] = useState<string | null | undefined>(undefined);
  const needLookup = openAlertId === undefined && status === "searching";

  useEffect(() => {
    if (!needLookup) return;
    let alive = true;
    createClient()
      .from("theft_alerts")
      .select("id")
      .eq("vehicle_id", vehicleId)
      .eq("status", "open")
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) console.error(error);
        if (alive) setLooked((data?.id as string | undefined) ?? null);
      });
    return () => {
      alive = false;
    };
  }, [needLookup, vehicleId]);

  const alertId = openAlertId !== undefined ? openAlertId : status === "searching" ? looked : null;

  async function run(action: Action) {
    setLoading(true);
    const patch =
      action === "delete"
        ? { deleted_at: new Date().toISOString() }
        : { status: action === "search" ? "searching" : action === "recover" ? "recovered" : "active" };
    const { error } = await createClient().from("vehicles").update(patch).eq("id", vehicleId);
    setLoading(false);
    setPending(null);
    setChoice(false);
    if (error) {
      console.error(error);
      toast.error(friendlyError(error, "상태를 바꾸지 못했습니다. 다시 시도해 주세요."));
      return;
    }
    if (action === "delete") {
      toast.success("삭제되었습니다.");
      router.replace("/dashboard");
    } else {
      toast.success(action === "search" ? "수색 중으로 바꿨어요. 발견 제보를 기다려요." : action === "recover" ? "회수 완료! 다행이에요." : "정상으로 바꿨어요.");
    }
    router.refresh();
  }

  const c = pending ? CONFIRM[pending] : null;

  return (
    <Card className="space-y-3">
      {status === "active" && (
        <Button variant="danger" full size="lg" icon={<Siren aria-hidden className="h-5 w-5" />} onClick={() => setChoice(true)}>
          분실·도난 신고
        </Button>
      )}
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
      <Button variant="ghost" full icon={<Trash2 aria-hidden className="h-4 w-4" />} onClick={() => setPending("delete")}>
        이동수단 삭제
      </Button>

      {/* 분실·도난 신고: 도난이면 근처 경보, 분실이면 수색 중으로만 (입구 하나) */}
      <Modal
        open={choice}
        onClose={() => !loading && setChoice(false)}
        title="분실·도난 신고"
        footer={
          <Button variant="ghost" onClick={() => setChoice(false)} disabled={loading}>
            취소
          </Button>
        }
      >
        <div className="space-y-4">
          <p className="text-[15px] text-ink-soft">어떤 상황인지 골라 주세요.</p>
          <div className="space-y-1.5">
            <ButtonLink href={`/vehicles/${vehicleId}/alert`} variant="danger" full size="lg" icon={<Siren aria-hidden className="h-5 w-5" />}>
              도둑맞았어요
            </ButtonLink>
            <p className="text-[13px] leading-relaxed text-ink-muted">
              근처에 도난 경보를 보내요. 알림을 켠 근처 사람들에게 사진·특징이 바로 가고, 목격·중고 매물 제보를 받아요.
            </p>
          </div>
          <div className="space-y-1.5">
            <Button variant="secondary" full size="lg" loading={loading} loadingText="바꾸는 중..." icon={<Search aria-hidden className="h-5 w-5" />} onClick={() => run("search")}>
              잃어버렸어요 (분실)
            </Button>
            <p className="text-[13px] leading-relaxed text-ink-muted">
              근처 알림 없이 상태만 &lsquo;수색 중&rsquo;으로 바꿔요. QR을 스캔한 사람에게 분실 안내와 사진·특징이 보이고, 발견 위치 제보를 받을 수 있어요.
            </p>
          </div>
          <p className="rounded-xl bg-slate-50 p-3 text-[13px] leading-relaxed text-ink-soft">
            이름·연락처 같은 개인정보는 공개되지 않아요. 수색 기록(수색 횟수)은 지워지지 않고, 나중에 중고로 팔 때 안심거래 인증 화면의 &lsquo;도난·분실 이력&rsquo;에 남아요.
          </p>
        </div>
      </Modal>

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
