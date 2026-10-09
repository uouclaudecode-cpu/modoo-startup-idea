"use client";

import { Share2 } from "lucide-react";
import { Button, useToast } from "@/components/ui";
import { copyText } from "@/lib/clipboard";

/** 글 공유: 휴대폰은 공유 창(카카오톡 등), 안 되면 주소 복사 */
export function ShareButton({ title }: { title: string }) {
  const toast = useToast();

  async function share() {
    const url = window.location.href.split("#")[0];
    if (navigator.share) {
      try {
        await navigator.share({ title, text: `${title} — 보셨다면 댓글로 알려 주세요!`, url });
        return;
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
      }
    }
    const ok = await copyText(url);
    toast[ok ? "success" : "error"](ok ? "글 주소를 복사했어요. 단톡방에 붙여 넣어 알려 주세요!" : "복사하지 못했어요.");
  }

  return (
    <Button variant="secondary" icon={<Share2 aria-hidden className="h-4 w-4" />} onClick={share}>
      공유
    </Button>
  );
}
