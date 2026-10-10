"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Search, Siren } from "lucide-react";
import { Button, ButtonLink, Modal, useToast } from "@/components/ui";
import { cn } from "@/lib/cn";
import { friendlyError } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";

/**
 * 분실·도난 신고 입구 (홈의 내 이동수단 카드 · 이동수단 화면에서 함께 써요)
 * - 도둑맞았어요 → 근처 도난 경보 보내기 화면 (마지막으로 세운 곳이 미리 채워져요)
 * - 잃어버렸어요 → 바로 '수색 중'으로 (QR을 찍은 사람에게 분실 안내가 보여요)
 */
/** soft: 매일 보는 홈 카드에서는 연한 빨강 (놀라거나 실수로 누르지 않게, 누르면 확인 창이 한 번 더 나와요) */
export function LostReportButton({ vehicleId, label = "분실·도난 신고", compact = false, soft = false }: { vehicleId: string; label?: string; compact?: boolean; soft?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function markLost() {
    setLoading(true);
    const { error } = await createClient().from("vehicles").update({ status: "searching" }).eq("id", vehicleId);
    setLoading(false);
    if (error) {
      console.error(error);
      return toast.error(friendlyError(error, "상태를 바꾸지 못했어요. 다시 시도해 주세요."));
    }
    setOpen(false);
    toast.success("수색 중으로 바꿨어요. 누가 QR을 찍으면 바로 알려 드려요.");
    router.refresh();
  }

  return (
    <>
      <Button
        variant={soft ? "secondary" : "danger"}
        full
        size={compact ? "md" : "lg"}
        className={cn(compact && "h-11", soft && "bg-rose-50 text-rose-700 ring-rose-200 hover:bg-rose-100 active:bg-rose-100")}
        icon={<Siren aria-hidden className={compact ? "h-4 w-4" : "h-5 w-5"} />}
        onClick={() => setOpen(true)}
      >
        {label}
      </Button>
      <Modal
        open={open}
        onClose={() => !loading && setOpen(false)}
        title="분실·도난 신고"
        footer={
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={loading}>
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
              근처에 도난 경보를 보내요. 알림을 켠 근처 사람들에게 사진·특징이 바로 가고, 목격·중고 매물 제보를 받아요. 마지막으로 세운 곳이 있으면 미리 채워 드려요.
            </p>
          </div>
          <div className="space-y-1.5">
            <Button variant="secondary" full size="lg" loading={loading} loadingText="바꾸는 중..." icon={<Search aria-hidden className="h-5 w-5" />} onClick={markLost}>
              잃어버렸어요 (분실)
            </Button>
            <p className="text-[13px] leading-relaxed text-ink-muted">
              근처 알림 없이 상태만 &lsquo;수색 중&rsquo;으로 바꿔요. QR을 스캔한 사람에게 분실 안내와 사진·특징이 보이고, 발견 제보를 받을 수 있어요.
            </p>
          </div>
          <p className="rounded-xl bg-slate-50 p-3 text-[13px] leading-relaxed text-ink-soft">
            이름·연락처 같은 개인정보는 공개되지 않아요. 수색 기록(수색 횟수)은 지워지지 않고, 나중에 중고로 팔 때 안심거래 인증 화면의 &lsquo;도난·분실 이력&rsquo;에 남아요.
          </p>
        </div>
      </Modal>
    </>
  );
}
