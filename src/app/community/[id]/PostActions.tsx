"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MoreHorizontal, RotateCcw, ShieldCheck, Trash2 } from "lucide-react";
import { Button, Modal, useToast } from "@/components/ui";
import type { PostStatus } from "@/lib/community";
import { friendlyError } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";

type Action = "resolve" | "reopen" | "delete";

/** 글쓴이 전용: 찾았어요 / 다시 찾는 중 / 삭제 */
export function PostActions({ postId, status, vehicleId }: { postId: string; status: PostStatus; vehicleId: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState<Action | null>(null);
  const [menu, setMenu] = useState(false);
  const [loading, setLoading] = useState(false);

  async function run(action: Action) {
    setLoading(true);
    const supabase = createClient();
    const patch =
      action === "delete" ? { deleted_at: new Date().toISOString() } : { status: action === "resolve" ? "resolved" : "open" };
    const { error } = await supabase.from("lost_posts").update(patch).eq("id", postId);
    if (!error && action === "resolve" && vehicleId) {
      // 연결된 이동수단이 수색 중이면 회수 완료로 함께 바꿉니다.
      const { error: vErr } = await supabase.from("vehicles").update({ status: "recovered" }).eq("id", vehicleId).eq("status", "searching");
      if (vErr) console.error(vErr);
    }
    setLoading(false);
    setPending(null);
    if (error) {
      console.error(error);
      toast.error(friendlyError(error, "바꾸지 못했어요. 다시 시도해 주세요."));
      return;
    }
    if (action === "delete") {
      toast.success("글을 삭제했어요.");
      router.replace("/community");
    } else {
      toast.success(action === "resolve" ? "찾았다니 다행이에요! 🎉" : "다시 '찾는 중'으로 바꿨어요.");
    }
    router.refresh();
  }

  const CONFIRM: Record<Action, { title: string; body: string; button: string; variant: "primary" | "danger" }> = {
    resolve: {
      title: "찾았어요",
      body: vehicleId
        ? "글을 '찾았어요'로 바꾸고, 연결된 이동수단이 수색 중이면 '회수 완료'로 함께 바꿔요."
        : "글을 '찾았어요'로 바꿔요. 댓글은 그대로 남아요.",
      button: "찾았어요로 바꾸기",
      variant: "primary",
    },
    reopen: { title: "다시 찾는 중", body: "글을 다시 '찾는 중'으로 바꿔요.", button: "찾는 중으로 바꾸기", variant: "primary" },
    delete: { title: "글 삭제", body: "글을 삭제하면 목록에서 사라지고 댓글도 볼 수 없어요. 되돌릴 수 없어요.", button: "삭제하기", variant: "danger" },
  };
  const c = pending ? CONFIRM[pending] : null;

  return (
    <div className="flex gap-2">
      {status === "open" ? (
        <Button full icon={<ShieldCheck aria-hidden className="h-4 w-4" />} onClick={() => setPending("resolve")}>
          찾았어요
        </Button>
      ) : (
        <Button full variant="secondary" icon={<RotateCcw aria-hidden className="h-4 w-4" />} onClick={() => setPending("reopen")}>
          다시 찾는 중
        </Button>
      )}
      <div className="relative">
        <Button variant="secondary" className="w-11 px-0" aria-label="더 보기" aria-expanded={menu} onClick={() => setMenu(!menu)}>
          <MoreHorizontal aria-hidden className="h-5 w-5" />
        </Button>
        {menu && (
          <div className="absolute left-0 top-12 z-10 w-36 overflow-hidden rounded-xl bg-white shadow-lift ring-1 ring-line">
            <button
              type="button"
              onClick={() => {
                setMenu(false);
                setPending("delete");
              }}
              className="flex w-full items-center gap-2 px-4 py-3 text-sm font-semibold text-rose-600 hover:bg-rose-50"
            >
              <Trash2 aria-hidden className="h-4 w-4" />글 삭제
            </button>
          </div>
        )}
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
    </div>
  );
}
