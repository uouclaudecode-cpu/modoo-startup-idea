"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Inbox, RotateCcw, ShieldCheck, Siren, Trash2 } from "lucide-react";
import { Button, ButtonLink, Card, Modal, useToast } from "@/components/ui";
import { friendlyError } from "@/lib/format";
import type { VehicleStatus } from "@/lib/status";
import { createClient } from "@/lib/supabase/client";

type Action = "search" | "recover" | "reset" | "delete";

const CONFIRM: Record<Action, { title: string; body: string; button: string; variant: "danger" | "primary" }> = {
  search: {
    title: "🚨 분실/도난 신고",
    body: "상태를 '수색 중'으로 바꿔요. QR을 스캔한 사람에게 분실 안내와 사진·색상·특징이 보이고, 발견 위치 제보를 받을 수 있어요. 이름·연락처 같은 개인정보는 공개되지 않아요.",
    button: "수색 중으로 바꾸기",
    variant: "danger",
  },
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
}: {
  vehicleId: string;
  status: VehicleStatus;
  foundReports: number;
  totalReports: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState<Action | null>(null);
  const [loading, setLoading] = useState(false);

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
        <Button variant="danger" full size="lg" icon={<Siren aria-hidden className="h-5 w-5" />} onClick={() => setPending("search")}>
          🚨 분실/도난 신고
        </Button>
      )}
      {status === "searching" && (
        <>
          <ButtonLink href={`/vehicles/${vehicleId}/reports`} full size="lg" variant={foundReports ? "danger" : "primary"} icon={<Inbox aria-hidden className="h-5 w-5" />}>
            발견 제보 확인{foundReports ? ` (${foundReports}건)` : ""}
          </ButtonLink>
          <Button variant="secondary" full size="lg" icon={<ShieldCheck aria-hidden className="h-5 w-5" />} onClick={() => setPending("recover")}>
            회수 완료
          </Button>
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
