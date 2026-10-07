"use client";

/* eslint-disable @next/next/no-img-element -- Supabase 저장소 사진이라 기본 img 사용 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ExternalLink, Lock, MapPin, Trash2 } from "lucide-react";
import { Button, Modal, useToast } from "@/components/ui";
import type { PostComment } from "@/lib/community";
import { cn } from "@/lib/cn";
import { formatDateTime, friendlyError, timeAgo } from "@/lib/format";
import { kakaoMapLink } from "@/lib/map";
import { createClient } from "@/lib/supabase/client";

export function CommentItem({ comment: c, imageUrl, canDelete }: { comment: PostComment; imageUrl: string | null; canDelete: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  async function remove() {
    setLoading(true);
    const { error } = await createClient().rpc("delete_post_comment", { p_comment: c.id });
    setLoading(false);
    setConfirm(false);
    if (error) {
      console.error(error);
      toast.error(friendlyError(error, "댓글을 지우지 못했어요."));
      return;
    }
    toast.success("댓글을 지웠어요.");
    router.refresh();
  }

  // 볼 수 없는 비밀 댓글: 내용·위치·사진 없이 자리만 보여줌
  if (!c.can_view) {
    return (
      <div className="flex items-center gap-2 rounded-2xl bg-slate-100 px-4 py-3 text-sm text-ink-muted">
        <Lock aria-hidden className="h-4 w-4" />
        비밀 댓글입니다. 글쓴이와 댓글 쓴 사람만 볼 수 있어요.
        <span className="ml-auto text-[13px] text-ink-faint">{timeAgo(c.created_at)}</span>
      </div>
    );
  }

  const hasCoords = c.latitude != null && c.longitude != null;

  return (
    <div className={cn("space-y-2.5 rounded-2xl bg-white p-4 ring-1", c.is_secret ? "ring-amber-300 bg-amber-50/40" : "ring-line/70")}>
      <div className="flex items-center gap-2">
        <span aria-hidden className="grid h-8 w-8 place-items-center rounded-full bg-brand-50 text-sm font-bold text-brand-700">
          {c.author_name.slice(0, 1)}
        </span>
        <span className="text-sm font-semibold">{c.author_name}</span>
        {c.is_mine && <span className="text-[12px] text-ink-faint">(나)</span>}
        {c.is_secret && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[12px] font-semibold text-amber-800">
            <Lock aria-hidden className="h-3 w-3" />
            비밀
          </span>
        )}
        <time className="ml-auto text-[13px] text-ink-faint" dateTime={c.created_at} title={formatDateTime(c.created_at)}>
          {timeAgo(c.created_at)}
        </time>
      </div>

      <p className="whitespace-pre-line text-[15px] leading-relaxed">{c.body}</p>

      {(c.location_text || hasCoords) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-orange-50 px-3 py-2 text-sm text-orange-900">
          <span className="flex items-start gap-1.5">
            <MapPin aria-hidden className="mt-0.5 h-4 w-4 flex-none text-orange-600" />
            <span className="font-semibold">{c.location_text || "현재 위치 공유"}</span>
          </span>
          {hasCoords && (
            <a
              href={kakaoMapLink(c.latitude!, c.longitude!, "본 위치")}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-semibold text-brand-700 underline-offset-2 hover:underline"
            >
              지도에서 보기 <ExternalLink aria-hidden className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      )}

      {imageUrl ? (
        <a href={imageUrl} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl ring-1 ring-line">
          <img src={imageUrl} alt="댓글 사진" className="max-h-80 w-full object-cover" loading="lazy" />
        </a>
      ) : (
        c.image_path && <p className="text-[13px] text-ink-muted">사진을 불러오지 못했어요. 새로고침해 주세요.</p>
      )}

      {canDelete && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setConfirm(true)}
            className="-m-2 inline-flex items-center gap-1 rounded-lg p-2 text-[13px] text-ink-faint hover:bg-slate-100 hover:text-ink-soft"
          >
            <Trash2 aria-hidden className="h-3.5 w-3.5" />
            삭제
          </button>
        </div>
      )}

      <Modal
        open={confirm}
        onClose={() => !loading && setConfirm(false)}
        title="댓글 삭제"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)} disabled={loading}>
              취소
            </Button>
            <Button variant="danger" loading={loading} loadingText="지우는 중..." onClick={remove}>
              삭제하기
            </Button>
          </>
        }
      >
        이 댓글을 지울까요? 되돌릴 수 없어요.
      </Modal>
    </div>
  );
}
