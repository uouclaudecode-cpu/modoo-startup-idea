"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button, Modal, useToast } from "@/components/ui";
import { friendlyError } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";

/** 잘못 기록한 라이딩 지우기 (누적 거리·소모품 거리에서도 그만큼 빼요) */
export function DeleteRideButton({ rideId }: { rideId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function remove() {
    setLoading(true);
    const { error } = await createClient().rpc("delete_ride", { p_ride: rideId });
    setLoading(false);
    if (error) {
      console.error(error);
      toast.error(friendlyError(error, "지우지 못했어요. 다시 시도해 주세요."));
      return;
    }
    setOpen(false);
    toast.success("기록을 지웠어요.");
    router.replace("/rides");
    router.refresh();
  }

  return (
    <>
      <Button variant="ghost" full icon={<Trash2 aria-hidden className="h-4 w-4" />} onClick={() => setOpen(true)}>
        이 기록 삭제
      </Button>
      <Modal
        open={open}
        onClose={() => !loading && setOpen(false)}
        title="라이딩 기록 삭제"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={loading}>
              취소
            </Button>
            <Button variant="danger" loading={loading} loadingText="지우는 중..." onClick={remove}>
              삭제하기
            </Button>
          </>
        }
      >
        이 기록을 지우면 이동수단 누적 거리와, 이 라이딩 뒤로 정비하지 않은 소모품 거리에서도 그만큼 빠져요. 되돌릴 수 없어요.
      </Modal>
    </>
  );
}
