"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { MoreHorizontal, Pencil, RotateCcw, ShieldCheck, Trash2 } from "lucide-react";
import { Button, Modal, useToast } from "@/components/ui";
import type { PostStatus } from "@/lib/community";
import { friendlyError } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";

type Action = "resolve" | "reopen" | "delete";

/** 연결된 이동수단의 아직 안 끝낸 도난 경보 (주인만 보여요: RLS). 72시간이 지난(expired)·숨긴 경보도 '찾았어요'로 끝내야 해요 */
async function findOpenAlert(vehicleId: string) {
  const { data, error } = await createClient()
    .from("theft_alerts")
    .select("id")
    .eq("vehicle_id", vehicleId)
    .in("status", ["open", "expired", "hidden"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) console.error(error);
  return (data?.id as string | undefined) ?? null;
}

/** 글쓴이 전용: 찾았어요 / 다시 찾는 중 / 글 수정 / 삭제 */
export function PostActions({ postId, status, vehicleId }: { postId: string; status: PostStatus; vehicleId: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState<Action | null>(null);
  const [menu, setMenu] = useState(false);
  const [loading, setLoading] = useState(false);
  // 도난 경보가 안 끝났으면(기간이 지난 경보도) '찾았어요'는 경보 화면에서 끝내요 (도움 준 제보자 고르기·사례금 기록)
  const [alertId, setAlertId] = useState<string | null>(null);

  useEffect(() => {
    if (!vehicleId || status !== "open") return;
    let alive = true;
    findOpenAlert(vehicleId).then((id) => {
      if (alive) setAlertId(id);
    });
    return () => {
      alive = false;
    };
  }, [vehicleId, status]);

  async function run(action: Action) {
    setLoading(true);
    const supabase = createClient();
    // 누르는 순간에 다시 확인해요 (창을 연 뒤 경보가 생기거나 끝났을 수 있어요)
    const openAlert = action === "resolve" && vehicleId ? await findOpenAlert(vehicleId) : null;
    const patch =
      action === "delete" ? { deleted_at: new Date().toISOString() } : { status: action === "resolve" ? "resolved" : "open" };
    const { error } = await supabase.from("lost_posts").update(patch).eq("id", postId);
    if (!error && action === "resolve" && vehicleId && !openAlert) {
      // 연결된 이동수단이 수색 중이면 회수 완료로 함께 바꿉니다.
      const { error: vErr } = await supabase.from("vehicles").update({ status: "recovered" }).eq("id", vehicleId).eq("status", "searching");
      if (vErr) {
        console.error(vErr);
        toast.error("글은 '찾았어요'로 바꿨지만 이동수단 상태는 못 바꿨어요. 이동수단 화면에서 '회수 완료'를 눌러 주세요.");
      }
    }
    setLoading(false);
    setPending(null);
    if (error) {
      console.error(error);
      toast.error(friendlyError(error, "바꾸지 못했어요. 다시 시도해 주세요."));
      return;
    }
    if (openAlert) {
      // 경보는 경보 화면의 회수 확인 창에서 끝내요
      toast.success("글을 '찾았어요'로 바꿨어요. 이제 도난 경보를 끝내 주세요.");
      router.push(`/alerts/${openAlert}?resolve=1`);
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
    resolve: alertId
      ? {
          title: "찾았어요",
          body: "글을 '찾았어요'로 바꾸고 도난 경보 화면으로 가요. 거기서 도움 준 제보자를 골라 경보를 끝내 주세요. 그래야 제보자에게 고마움이 전해지고 약속한 사례금이 기록돼요.",
          button: "경보 끝내러 가기",
          variant: "primary",
        }
      : {
          title: "찾았어요",
          body: vehicleId
            ? "글을 '찾았어요'로 바꾸고, 연결된 이동수단이 수색 중이면 '회수 완료'로 함께 바꿔요."
            : "글을 '찾았어요'로 바꿔요. 댓글은 그대로 남아요.",
          button: "'찾았어요'로 바꾸기",
          variant: "primary",
        },
    reopen: { title: "다시 찾는 중", body: "글을 다시 '찾는 중'으로 바꿔요.", button: "'찾는 중'으로 바꾸기", variant: "primary" },
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
            <Link
              href={`/community/${postId}/edit`}
              onClick={() => setMenu(false)}
              className="flex w-full items-center gap-2 px-4 py-3 text-sm font-semibold text-ink hover:bg-slate-50"
            >
              <Pencil aria-hidden className="h-4 w-4" />글 고치기
            </Link>
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
