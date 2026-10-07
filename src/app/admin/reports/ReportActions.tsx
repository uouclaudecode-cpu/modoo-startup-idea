"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Eye, EyeOff, Trash2 } from "lucide-react";
import { Button, Modal, useToast } from "@/components/ui";
import { friendlyError } from "@/lib/format";
import type { ReportTarget } from "@/lib/moderation";
import { createClient } from "@/lib/supabase/client";

type Action = "hide" | "show" | "delete";

/** 관리자: 신고 대상 하나에 대한 숨기기 / 다시 보이기 / 삭제 (모두 확인 창을 거쳐요) */
export function ReportActions({ targetType, targetId, hidden }: { targetType: ReportTarget; targetId: string; hidden: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState<Action | null>(null);
  const [loading, setLoading] = useState(false);

  const what = targetType === "post" ? "글" : "댓글";

  async function run(action: Action) {
    setLoading(true);
    const supabase = createClient();
    const { error } =
      action === "delete"
        ? await supabase.rpc("admin_delete_content", { p_type: targetType, p_id: targetId })
        : await supabase.rpc("admin_set_hidden", { p_type: targetType, p_id: targetId, p_hidden: action === "hide" });
    setLoading(false);
    setPending(null);
    if (error) {
      console.error(error);
      toast.error(friendlyError(error, "처리하지 못했어요. 잠시 후 다시 시도해 주세요."));
      return;
    }
    toast.success(action === "delete" ? `${what}을 삭제했어요.` : action === "hide" ? `${what}을 숨겼어요.` : `${what}을 다시 보이게 했어요.`);
    router.refresh();
  }

  const CONFIRM: Record<Action, { title: string; body: string; button: string; loadingText: string; variant: "primary" | "danger" }> = {
    hide: {
      title: `${what} 숨기기`,
      body: `이 ${what}을 숨길까요? 쓴 사람과 관리자에게만 보이고, 언제든 다시 보이게 할 수 있어요.`,
      button: "숨기기",
      loadingText: "숨기는 중...",
      variant: "primary",
    },
    show: {
      title: "다시 보이기",
      body: `문제가 없다고 보고 이 ${what}을 다시 모두에게 보이게 할까요? 이후 신고가 더 들어와도 자동으로 숨기지 않아요.`,
      button: "다시 보이기",
      loadingText: "바꾸는 중...",
      variant: "primary",
    },
    delete: {
      title: `${what} 삭제`,
      body:
        targetType === "post"
          ? "이 글을 삭제할까요? 목록과 글 화면에서 사라지고 댓글도 볼 수 없어요. 글쓴이도 되살릴 수 없어요."
          : "이 댓글을 삭제할까요? 댓글에 달린 답글도 함께 보이지 않아요. 되돌릴 수 없어요.",
      button: "삭제하기",
      loadingText: "삭제하는 중...",
      variant: "danger",
    },
  };
  const c = pending ? CONFIRM[pending] : null;

  return (
    <div className="grid grid-cols-2 gap-2">
      {hidden ? (
        <Button variant="secondary" icon={<Eye aria-hidden className="h-4 w-4" />} onClick={() => setPending("show")}>
          다시 보이기
        </Button>
      ) : (
        <Button variant="secondary" icon={<EyeOff aria-hidden className="h-4 w-4" />} onClick={() => setPending("hide")}>
          숨기기
        </Button>
      )}
      <Button
        variant="secondary"
        className="!text-rose-700"
        icon={<Trash2 aria-hidden className="h-4 w-4" />}
        onClick={() => setPending("delete")}
      >
        삭제
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
            <Button variant={c?.variant} loading={loading} loadingText={c?.loadingText} onClick={() => pending && run(pending)}>
              {c?.button}
            </Button>
          </>
        }
      >
        {c?.body}
      </Modal>
    </div>
  );
}
