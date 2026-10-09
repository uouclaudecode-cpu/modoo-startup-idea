"use client";

import { useEffect, useState } from "react";
import { MoneyWarning } from "@/components/alerts/TrustInfo";
import type { Trust } from "@/lib/alerts";
import { createClient } from "@/lib/supabase/client";

/** 돈·계좌를 요구하는 댓글 아래 경고 + 쓴 사람의 신뢰 정보 (로그인한 사람에게만 신뢰 정보를 불러와요) */
export function CommentMoneyWarning({ commentId, loggedIn }: { commentId: string; loggedIn: boolean }) {
  const [trust, setTrust] = useState<Trust | null>(null);

  useEffect(() => {
    if (!loggedIn) return;
    let alive = true;
    createClient()
      .rpc("get_comment_author_trust", { p_comment: commentId })
      .then(({ data, error }) => {
        if (error) return console.error(error);
        const row = (data as Omit<Trust, "user_id">[] | null)?.[0];
        if (alive && row) setTrust({ user_id: "", ...row });
      });
    return () => {
      alive = false;
    };
  }, [commentId, loggedIn]);

  return <MoneyWarning trust={trust} />;
}
