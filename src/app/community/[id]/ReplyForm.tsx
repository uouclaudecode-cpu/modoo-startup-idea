"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Lock, MapPinned, Send } from "lucide-react";
import { Button, useToast } from "@/components/ui";
import type { PostComment } from "@/lib/community";
import { cn } from "@/lib/cn";
import { friendlyError } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";

/**
 * 답글 쓰기. 비밀 댓글에 다는 답글은 기본으로 비밀이에요.
 * 글쓴이(주인)는 '스티커 위치 넣기'로 주인만 아는 부착 위치를 비밀 답글로 알려줄 수 있어요.
 */
export function ReplyForm({ postId, parent, stickerSpot, onDone }: { postId: string; parent: PostComment; stickerSpot: string | null; onDone: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [body, setBody] = useState("");
  const [secret, setSecret] = useState(parent.is_secret);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function insertSpot() {
    if (!stickerSpot) return;
    const line = `QR 스티커는 ${stickerSpot}에 붙어 있어요. 찍어 주시면 위치와 사진이 저에게 바로 와요!`;
    setBody((b) => (b.trim() ? `${b.trim()}\n${line}` : line));
    setSecret(true); // 부착 위치는 반드시 비밀로
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) {
      setError("내용을 적어 주세요.");
      return;
    }
    if (stickerSpot && !secret && body.includes(stickerSpot)) {
      setError("스티커 위치는 비밀 답글로만 보낼 수 있어요. 비밀 답글을 켜 주세요.");
      return;
    }
    setError("");
    setLoading(true);
    const { error: err } = await createClient().from("post_comments").insert({
      post_id: postId,
      parent_id: parent.id,
      body: body.trim(),
      is_secret: secret,
    });
    setLoading(false);
    if (err) {
      console.error(err);
      setError(friendlyError(err, "답글을 남기지 못했어요. 잠시 후 다시 시도해 주세요."));
      return;
    }
    toast.success(secret ? `비밀 답글을 남겼어요. ${parent.author_name}님과 나만 볼 수 있어요.` : "답글을 남겼어요.");
    onDone();
    router.refresh();
  }

  return (
    <form onSubmit={submit} noValidate className={cn("space-y-2.5 rounded-2xl p-3 ring-1", secret ? "bg-amber-50/60 ring-amber-300" : "bg-white ring-line")}>
      <label className="sr-only" htmlFor={`reply-${parent.id}`}>
        답글
      </label>
      <textarea
        id={`reply-${parent.id}`}
        rows={3}
        maxLength={1000}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={`${parent.author_name}님에게 답글`}
        className="w-full rounded-xl border border-line bg-white px-3 py-2.5 text-[16px] leading-relaxed focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
      />
      {stickerSpot !== null && (
        stickerSpot ? (
          <Button variant="secondary" full className="h-10 text-sm" icon={<MapPinned aria-hidden className="h-4 w-4" />} onClick={insertSpot}>
            📍 스티커 위치 넣기
          </Button>
        ) : (
          <p className="text-[13px] text-ink-muted">내 이동수단 &gt; 정보 수정에서 스티커 붙인 위치를 적어 두면 여기서 바로 넣을 수 있어요.</p>
        )
      )}
      <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-soft">
        <input type="checkbox" checked={secret} onChange={(e) => setSecret(e.target.checked)} className="h-4 w-4 accent-amber-600" />
        <Lock aria-hidden className="h-3.5 w-3.5" />
        비밀 답글 ({parent.author_name}님과 글쓴이만 보기)
      </label>
      {error && (
        <p role="alert" className="text-sm text-rose-600">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button variant="ghost" className="flex-1" onClick={onDone} disabled={loading}>
          취소
        </Button>
        <Button type="submit" className="flex-[2]" loading={loading} loadingText="남기는 중..." icon={<Send aria-hidden className="h-4 w-4" />}>
          답글 남기기
        </Button>
      </div>
    </form>
  );
}
