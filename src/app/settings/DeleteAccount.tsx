"use client";

import { useState } from "react";
import { UserX } from "lucide-react";
import { Button, Input, Modal } from "@/components/ui";
import { friendlyError } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";

/** 내 폴더에 올린 사진들 (탈퇴 전에 지워요. 계정을 지우면 내 폴더를 지울 권한도 사라져서) */
const MY_BUCKETS = ["vehicle-images", "community-images", "community-secret"] as const;
const CONFIRM_WORD = "탈퇴";

export function DeleteAccount({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const [word, setWord] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function remove() {
    setError("");
    setLoading(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return setError("로그인이 만료됐어요. 다시 로그인해 주세요.");
    }
    // 1) 내가 올린 사진 지우기 (실패해도 탈퇴는 진행하지만 기록은 남겨요)
    for (const bucket of MY_BUCKETS) {
      const { data: files, error: listErr } = await supabase.storage.from(bucket).list(user.id, { limit: 1000 });
      if (listErr) {
        console.error(listErr);
        continue;
      }
      const paths = (files ?? []).map((f) => `${user.id}/${f.name}`);
      if (paths.length) {
        const { error: rmErr } = await supabase.storage.from(bucket).remove(paths);
        if (rmErr) console.error(rmErr);
      }
    }
    // 2) 계정 지우기 (연결된 데이터는 데이터베이스가 함께 지움)
    const { error: delErr } = await supabase.rpc("delete_my_account");
    if (delErr) {
      console.error(delErr);
      setLoading(false);
      return setError(friendlyError(delErr, "탈퇴하지 못했어요. 잠시 후 다시 시도해 주세요."));
    }
    await supabase.auth.signOut().catch(() => {}); // 이미 지워진 계정이라 실패해도 괜찮아요
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
        onClose={() => !loading && setOpen(false)}
        title="정말 탈퇴할까요?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={loading}>
              취소
            </Button>
            <Button variant="danger" loading={loading} loadingText="지우는 중..." disabled={word.trim() !== CONFIRM_WORD} onClick={remove}>
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
