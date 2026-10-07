"use client";

/* eslint-disable @next/next/no-img-element -- Supabase 저장소 사진이라 기본 img 사용 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CornerDownRight, ExternalLink, EyeOff, Lock, MapPin, MessageSquareReply, Trash2 } from "lucide-react";
import { Button, Modal, useToast } from "@/components/ui";
import { ContentMenu } from "@/components/community/ContentMenu";
import type { PostComment } from "@/lib/community";
import { cn } from "@/lib/cn";
import { formatDateTime, friendlyError, timeAgo } from "@/lib/format";
import { kakaoMapLink } from "@/lib/map";
import { createClient } from "@/lib/supabase/client";
import { ReplyForm } from "./ReplyForm";

type Thread = {
  comment: PostComment;
  replies: PostComment[];
  imageOf: Record<string, string | null>;
  /** 지금 보는 사람이 글쓴이인지 */
  viewerIsAuthor: boolean;
  postId: string;
  /** 글쓴이에게만: 연결한 이동수단의 스티커 위치 */
  stickerSpot: string | null;
  loggedIn: boolean;
};

/** 댓글 하나 + 답글들 + 답글 쓰기 */
export function CommentThread({ comment, replies, imageOf, viewerIsAuthor, postId, stickerSpot, loggedIn }: Thread) {
  const [replying, setReplying] = useState(false);
  // 답글은 글쓴이(주인)와 원래 댓글 쓴 사람이 주고받아요
  const canReply = loggedIn && comment.can_view && (viewerIsAuthor || comment.is_mine);

  return (
    <div className="space-y-2">
      <CommentBody
        comment={comment}
        imageUrl={imageOf[comment.id] ?? null}
        canDelete={comment.is_mine || viewerIsAuthor}
        loggedIn={loggedIn}
        postId={postId}
      />
      {(replies.length > 0 || replying) && (
        <div className="space-y-2 border-l-2 border-line pl-3">
          {replies.map((r) => (
            <CommentBody
              key={r.id}
              comment={r}
              imageUrl={imageOf[r.id] ?? null}
              canDelete={r.is_mine || viewerIsAuthor}
              loggedIn={loggedIn}
              postId={postId}
              reply
            />
          ))}
          {replying && (
            <ReplyForm
              postId={postId}
              parent={comment}
              stickerSpot={viewerIsAuthor ? stickerSpot : null}
              onDone={() => setReplying(false)}
            />
          )}
        </div>
      )}
      {canReply && !replying && (
        <button
          type="button"
          onClick={() => setReplying(true)}
          className={cn(
            "ml-1 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[13px] font-semibold hover:bg-slate-100",
            viewerIsAuthor && comment.is_secret ? "text-amber-800" : "text-ink-muted",
          )}
        >
          <MessageSquareReply aria-hidden className="h-4 w-4" />
          {viewerIsAuthor && comment.is_secret ? "비밀 답글 (스티커 위치 알려주기)" : "답글"}
        </button>
      )}
    </div>
  );
}

type BodyProps = {
  comment: PostComment;
  imageUrl: string | null;
  canDelete: boolean;
  /** 신고·차단 메뉴: 로그인 안 했으면 로그인 안내를 보여줘요 */
  loggedIn: boolean;
  postId: string;
  reply?: boolean;
};

function CommentBody({ comment: c, imageUrl, canDelete, loggedIn, postId, reply }: BodyProps) {
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
        {reply ? <CornerDownRight aria-hidden className="h-4 w-4" /> : <Lock aria-hidden className="h-4 w-4" />}
        {reply ? "비밀 답글입니다." : "비밀 댓글입니다. 글쓴이와 댓글 쓴 사람만 볼 수 있어요."}
        <span className="ml-auto text-[13px] text-ink-faint" suppressHydrationWarning>
          {/* "N분 전"은 서버와 브라우저 시각이 조금 달라 1분 차이가 날 수 있어요 */}
          {timeAgo(c.created_at)}
        </span>
      </div>
    );
  }

  const hasCoords = c.latitude != null && c.longitude != null;

  return (
    <div className={cn("space-y-2.5 rounded-2xl p-4 ring-1", c.is_secret ? "bg-amber-50/60 ring-amber-300" : "bg-white ring-line/70")}>
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className={cn(
            "grid h-8 w-8 place-items-center rounded-full text-sm font-bold",
            c.is_post_author ? "bg-brand-600 text-white" : "bg-brand-50 text-brand-700",
          )}
        >
          {c.author_name.slice(0, 1)}
        </span>
        <span className="min-w-0 truncate text-sm font-semibold">{c.author_name}</span>
        {c.is_post_author && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[12px] font-semibold text-brand-700">글쓴이</span>}
        {c.is_mine && <span className="text-[12px] text-ink-faint">(나)</span>}
        {c.is_secret && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[12px] font-semibold text-amber-800">
            <Lock aria-hidden className="h-3 w-3" />
            비밀
          </span>
        )}
        <time className="ml-auto flex-none text-[13px] text-ink-faint" dateTime={c.created_at} title={formatDateTime(c.created_at)} suppressHydrationWarning>
          {timeAgo(c.created_at)}
        </time>
        {/* 내 댓글이 아닐 때만 신고·차단 (내 댓글은 아래 '삭제'로) */}
        {!c.is_mine && (
          <ContentMenu
            target="comment"
            targetId={c.id}
            authorName={c.author_name}
            authorIsPostAuthor={c.is_post_author}
            loggedIn={loggedIn}
            nextPath={`/community/${postId}`}
            className="-my-2 -mr-2"
          />
        )}
      </div>

      {/* 숨긴 댓글은 쓴 사람·관리자에게만 와요 */}
      {c.hidden_at && (
        <p role="status" className="flex items-start gap-1.5 rounded-xl bg-amber-50 px-3 py-2 text-[13px] leading-relaxed text-amber-900 ring-1 ring-amber-200">
          <EyeOff aria-hidden className="mt-0.5 h-3.5 w-3.5 flex-none text-amber-600" />
          {c.is_mine ? "신고가 많아 다른 사람에게는 숨겨졌어요." : "숨김 처리된 댓글이에요. 관리자와 쓴 사람에게만 보여요."}
        </p>
      )}

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
        {reply ? "이 답글을 지울까요? 되돌릴 수 없어요." : "이 댓글을 지울까요? 답글도 함께 사라지고, 되돌릴 수 없어요."}
      </Modal>
    </div>
  );
}
