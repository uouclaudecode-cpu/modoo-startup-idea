"use client";

import { useState } from "react";
import { UserX } from "lucide-react";
import { Button, Input, Modal } from "@/components/ui";
import { friendlyError } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";

const CONFIRM_WORD = "탈퇴";

export function DeleteAccount({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const [word, setWord] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function close() {
    if (loading) return;
    setOpen(false);
    setPassword("");
    setError("");
  }

  async function remove() {
    setError("");
    setLoading(true);
    // 서버에서 비밀번호를 확인한 뒤 계정을 지워요. 사진은 미리 지우지 않아서, 실패하면 모든 것이 그대로 남아요.
    // (지워진 계정의 사진은 데이터베이스가 정리 대기열에 넣어요)
    try {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        setLoading(false);
        return setError(json.error ?? "탈퇴하지 못했어요. 잠시 후 다시 시도해 주세요.");
      }
    } catch (err) {
      console.error(err);
      setLoading(false);
      return setError(friendlyError(err, "탈퇴하지 못했어요. 잠시 후 다시 시도해 주세요."));
    }
    await createClient().auth.signOut().catch(() => {}); // 이미 지워진 계정이라 실패해도 괜찮아요
    try {
      // 이 기기에 남은 라이딩 진행 기록도 정리
      Object.keys(localStorage)
        .filter((k) => k.startsWith("b-lock:"))
        .forEach((k) => localStorage.removeItem(k));
    } catch {
      // 저장소를 못 쓰는 환경이면 지울 것도 없어요
    }
    window.location.replace("/?bye=1");
  }

  return (
    <>
      <Button variant="ghost" className="text-rose-600 hover:bg-rose-50" icon={<UserX aria-hidden className="h-4 w-4" />} onClick={() => setOpen(true)}>
        회원 탈퇴
      </Button>
      <Modal
        open={open}
        onClose={close}
        title="정말 탈퇴할까요?"
        footer={
          <>
            <Button variant="ghost" onClick={close} disabled={loading}>
              취소
            </Button>
            <Button variant="danger" loading={loading} loadingText="지우는 중..." disabled={word.trim() !== CONFIRM_WORD || !password} onClick={remove}>
              탈퇴하기
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p>
            <b>{email}</b> 계정과 등록한 이동수단·QR·라이딩·정비 기록·커뮤니티 글과 댓글이 모두 지워져요. 붙여 둔 QR 스티커도 더 이상 쓸 수 없어요.
          </p>
          <Input label={`확인을 위해 '${CONFIRM_WORD}'라고 입력해 주세요`} value={word} onChange={(e) => setWord(e.target.value)} autoComplete="off" />
          <Input
            label="비밀번호"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            hint="본인 확인을 위해 지금 쓰는 비밀번호를 적어 주세요. 기억나지 않으면 로그아웃한 뒤 '비밀번호를 잊었어요'로 다시 정할 수 있어요."
          />
          {error && (
            <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
              {error}
            </p>
          )}
        </div>
      </Modal>
    </>
  );
}
