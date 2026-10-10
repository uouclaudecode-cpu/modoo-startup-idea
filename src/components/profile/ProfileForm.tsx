"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Camera, Trash2 } from "lucide-react";
import { Button, Input, useToast } from "@/components/ui";
import { friendlyError } from "@/lib/format";
import { avatarUrl, IMAGE_ACCEPT, prepareAvatar } from "@/lib/images";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "./Avatar";

type Props = {
  userId: string;
  nickname: string;
  avatarPath: string | null;
  /** 저장한 뒤 (창 닫기 등) */
  onSaved?: () => void;
};

/**
 * 프로필 사진·닉네임을 한 화면에서 바꾸기. MY의 '프로필 편집' 창과 설정 화면에서 함께 써요.
 * 사진은 저장을 누를 때 올려요 (고르기만 하고 닫으면 아무것도 바뀌지 않아요).
 */
export function ProfileForm({ userId, nickname, avatarPath, onSaved }: Props) {
  const router = useRouter();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(nickname);
  // 새로 고른 사진 (null: 그대로) · 사진 지우기
  const [file, setFile] = useState<File | null>(null);
  const [removed, setRemoved] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const trimmed = name.trim();

  useEffect(() => {
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const shown = preview ?? (removed ? null : avatarUrl(avatarPath));
  const photoChanged = Boolean(file) || (removed && Boolean(avatarPath));
  const changed = photoChanged || trimmed !== nickname;

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("image/")) return setError("사진 파일만 올릴 수 있어요.");
    setError("");
    setFile(f);
    setRemoved(false);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!trimmed) return setError("닉네임을 입력해 주세요.");
    if (trimmed.length > 20) return setError("닉네임은 20자 이하로 정해 주세요.");
    setError("");
    setLoading(true);
    const supabase = createClient();
    let uploaded: string | null = null;
    try {
      if (file) {
        const blob = await prepareAvatar(file);
        uploaded = `${userId}/avatar-${crypto.randomUUID()}.jpg`;
        const { error: upErr } = await supabase.storage.from("vehicle-images").upload(uploaded, blob, { contentType: "image/jpeg", upsert: false });
        if (upErr) {
          console.error(upErr);
          uploaded = null;
          throw new Error("사진을 올리지 못했어요. 다시 시도해 주세요.");
        }
      }
      const { data, error: err } = await supabase.rpc("update_my_profile", {
        p_nickname: trimmed,
        p_avatar_path: uploaded ?? (removed ? "" : null),
      });
      if (err) {
        // 프로필 사진 기능(031)이 아직 데이터베이스에 없으면 닉네임만 예전 방식으로 바꿔요
        if (err.code === "PGRST202" && !photoChanged) {
          const { error: err2 } = await supabase.rpc("change_nickname", { p_nickname: trimmed });
          if (err2) throw err2;
        } else {
          throw err;
        }
      }
      // 예전 사진 파일은 지워요 (실패해도 프로필은 이미 바뀌었어요)
      const old = (data as { old_avatar_path?: string | null } | null)?.old_avatar_path;
      if (old) supabase.storage.from("vehicle-images").remove([old]).then(({ error: rmErr }) => rmErr && console.error(rmErr));
      setFile(null);
      setRemoved(false);
      toast.success("프로필을 저장했어요.");
      onSaved?.();
      router.refresh();
    } catch (err) {
      console.error(err);
      if (uploaded) supabase.storage.from("vehicle-images").remove([uploaded]).then(() => {});
      setError(friendlyError(err, "저장하지 못했어요. 잠시 후 다시 시도해 주세요."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <div className="flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="relative rounded-full focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/40"
          aria-label="프로필 사진 고르기"
        >
          <Avatar src={shown} name={trimmed || nickname} className="h-24 w-24 text-3xl" />
          <span className="absolute -bottom-0.5 -right-0.5 grid h-9 w-9 place-items-center rounded-full bg-white text-ink shadow-lift ring-1 ring-line">
            <Camera aria-hidden className="h-[18px] w-[18px]" />
          </span>
        </button>
        <input ref={fileRef} type="file" accept={IMAGE_ACCEPT} onChange={pick} className="sr-only" tabIndex={-1} aria-hidden />
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={() => fileRef.current?.click()} className="h-10 text-sm">
            사진 {shown ? "바꾸기" : "넣기"}
          </Button>
          {shown && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setFile(null);
                setRemoved(true);
              }}
              icon={<Trash2 aria-hidden className="h-4 w-4" />}
              className="h-10 text-sm"
            >
              사진 지우기
            </Button>
          )}
        </div>
        <p className="text-center text-[13px] text-ink-muted">사진은 MY와 커뮤니티 글·댓글에 보여요. 얼굴 사진이 아니어도 괜찮아요.</p>
      </div>

      <Input
        label="닉네임"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={20}
        hint={`커뮤니티 글·댓글에 보여요. 실명이나 전화번호는 쓰지 마세요. (${Array.from(trimmed).length}/20)`}
        error={error}
      />
      <Button type="submit" full loading={loading} loadingText="저장 중..." disabled={!trimmed || !changed}>
        저장
      </Button>
    </form>
  );
}
