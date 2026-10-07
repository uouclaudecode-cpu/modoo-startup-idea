"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Input, useToast } from "@/components/ui";
import { friendlyError } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";

export function NicknameForm({ initial }: { initial: string }) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState(initial);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const trimmed = name.trim();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!trimmed) return setError("닉네임을 입력해 주세요.");
    if (trimmed.length > 20) return setError("닉네임은 20자 이하로 정해 주세요.");
    setError("");
    setLoading(true);
    const { error: err } = await createClient().rpc("change_nickname", { p_nickname: trimmed });
    setLoading(false);
    if (err) {
      console.error(err);
      return setError(friendlyError(err, "바꾸지 못했어요. 잠시 후 다시 시도해 주세요."));
    }
    toast.success("닉네임을 바꿨어요. 커뮤니티 글·댓글에도 반영됐어요.");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-3">
      <Input
        label="닉네임"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={20}
        hint="실명이나 전화번호는 쓰지 마세요."
        error={error}
      />
      <Button type="submit" loading={loading} loadingText="저장 중..." disabled={!trimmed || trimmed === initial}>
        닉네임 저장
      </Button>
    </form>
  );
}
