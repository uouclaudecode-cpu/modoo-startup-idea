"use client";

import { Share2 } from "lucide-react";
import { Button } from "./Button";
import { useToast } from "./Toast";
import { copyText } from "@/lib/clipboard";

/** 카카오톡 등으로 공유 (휴대폰 공유 창, 안 되면 주소 복사) */
export function ShareButton({ title, text, path, label = "공유하기", className }: { title: string; text: string; path: string; label?: string; className?: string }) {
  const toast = useToast();
  async function share() {
    const url = new URL(path, window.location.origin).toString();
    try {
      if (navigator.share) {
        await navigator.share({ title, text, url });
        return;
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
    }
    const ok = await copyText(`${text}\n${url}`);
    if (ok) toast.success("주소를 복사했어요. 카카오톡 단톡방에 붙여 넣어 주세요.");
    else toast.error("복사하지 못했어요.");
  }
  return (
    <Button variant="secondary" full className={className} icon={<Share2 aria-hidden className="h-4 w-4" />} onClick={share}>
      {label}
    </Button>
  );
}
