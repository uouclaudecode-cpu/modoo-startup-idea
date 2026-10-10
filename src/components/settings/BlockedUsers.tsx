"use client";

import { useEffect, useState } from "react";
import { RotateCw, UserX } from "lucide-react";
import { Button, Card, EmptyState, ErrorState, useToast } from "@/components/ui";
import { BlockedUsersSkeleton } from "@/components/skeletons/PageSkeletons";
import { formatDate, friendlyError } from "@/lib/format";
import type { BlockedUser } from "@/lib/moderation";
import { createClient } from "@/lib/supabase/client";

type State = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; items: BlockedUser[] };

/**
 * 설정: 내가 차단한 사용자 목록과 차단 해제.
 * 로그인한 사람만 보는 화면에 넣어 주세요 (my_blocks 는 로그인한 사람 것만 돌려줘요).
 */
export function BlockedUsers() {
  const toast = useToast();
  const [state, setState] = useState<State>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    // 화면을 떠난 뒤 늦게 온 응답으로 상태를 바꾸지 않게
    let cancelled = false;
    (async () => {
      const { data, error } = await createClient().rpc("my_blocks");
      if (cancelled) return;
      if (error) {
        console.error(error);
        setState({ status: "error", message: friendlyError(error, "차단 목록을 불러오지 못했어요.") });
        return;
      }
      setState({ status: "ready", items: (data ?? []) as BlockedUser[] });
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  function retry() {
    setState({ status: "loading" });
    setReloadKey((k) => k + 1);
  }

  async function unblock(u: BlockedUser) {
    setBusyId(u.user_id);
    const { error } = await createClient().rpc("unblock_user", { p_user: u.user_id });
    setBusyId(null);
    if (error) {
      console.error(error);
      toast.error(friendlyError(error, "차단을 해제하지 못했어요. 잠시 후 다시 시도해 주세요."));
      return;
    }
    setState((s) => (s.status === "ready" ? { status: "ready", items: s.items.filter((x) => x.user_id !== u.user_id) } : s));
    toast.success(`${u.nickname}님의 차단을 해제했어요. 이제 글과 댓글이 다시 보여요.`);
  }

  return (
    <section aria-labelledby="blocked-users-title" className="space-y-3">
      <div>
        <h2 id="blocked-users-title" className="text-lg font-bold">
          차단한 사용자
        </h2>
        <p className="mt-0.5 text-sm leading-relaxed text-ink-muted">차단한 사람의 글과 댓글은 나에게 보이지 않아요. 해제하면 다시 보여요.</p>
      </div>

      {state.status === "loading" ? (
        <BlockedUsersSkeleton rows={2} />
      ) : state.status === "error" ? (
        <ErrorState
          title="차단 목록을 불러오지 못했어요"
          description={state.message}
          action={
            <Button variant="secondary" full icon={<RotateCw aria-hidden className="h-4 w-4" />} onClick={retry}>
              다시 불러오기
            </Button>
          }
        />
      ) : state.items.length === 0 ? (
        <EmptyState
          icon={<UserX className="h-7 w-7" />}
          title="차단한 사용자가 없어요"
          description="커뮤니티 글이나 댓글의 ⋯ 메뉴에서 불편한 사용자를 차단할 수 있어요."
        />
      ) : (
        <ul className="space-y-2">
          {state.items.map((u) => (
            <li key={u.user_id}>
              <Card className="flex items-center gap-3 p-4">
                <span aria-hidden className="grid h-10 w-10 flex-none place-items-center rounded-full bg-slate-100 font-bold text-ink-muted">
                  {Array.from(u.nickname)[0]}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{u.nickname}</p>
                  <p className="text-[13px] text-ink-muted">{formatDate(u.created_at)} 차단</p>
                </div>
                <Button
                  variant="secondary"
                  loading={busyId === u.user_id}
                  loadingText="해제 중..."
                  disabled={busyId !== null && busyId !== u.user_id}
                  onClick={() => unblock(u)}
                  aria-label={`${u.nickname}님 차단 해제`}
                >
                  차단 해제
                </Button>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
