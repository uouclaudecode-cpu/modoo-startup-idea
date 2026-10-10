"use client";

import Link from "next/link";
import { useState } from "react";
import { Bike, Pencil, Settings } from "lucide-react";
import { Card, Modal } from "@/components/ui";
import { avatarUrl } from "@/lib/images";
import { Avatar } from "./Avatar";
import { ProfileForm } from "./ProfileForm";

/** MY 맨 위 내 정보. 사진·이름이나 '편집'을 누르면 바로 프로필을 바꾸고, ⚙️로 알림·계정 설정에 가요. (설정은 앱에서 여기 한 곳) */
export function ProfileCard({ userId, nickname, avatarPath, vehicleCount }: { userId: string; nickname: string; avatarPath: string | null; vehicleCount: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Card className="flex items-center gap-4 p-4">
        <button type="button" onClick={() => setOpen(true)} className="flex min-w-0 flex-1 items-center gap-4 text-left" aria-label="프로필 편집">
          <Avatar src={avatarUrl(avatarPath)} name={nickname} className="h-14 w-14 text-xl" />
          <span className="min-w-0 flex-1">
            <span className="line-clamp-1 break-all text-xl font-extrabold tracking-tight">{nickname}님</span>
            <span className="mt-0.5 flex items-center gap-1.5 text-sm text-ink-muted">
              <Bike aria-hidden className="h-4 w-4" />내 이동수단 {vehicleCount}개
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-10 flex-none items-center gap-1 rounded-xl bg-slate-100 px-3 text-sm font-semibold text-ink-soft hover:bg-slate-200"
        >
          <Pencil aria-hidden className="h-4 w-4" />
          편집
        </button>
        <Link
          href="/settings"
          aria-label="설정 (알림·계정)"
          title="설정"
          className="-ml-2 grid h-10 w-10 flex-none place-items-center rounded-xl bg-slate-100 text-ink-soft hover:bg-slate-200"
        >
          <Settings aria-hidden className="h-[18px] w-[18px]" />
        </Link>
      </Card>
      <Modal open={open} onClose={() => setOpen(false)} title="프로필 편집">
        <ProfileForm userId={userId} nickname={nickname} avatarPath={avatarPath} onSaved={() => setOpen(false)} />
      </Modal>
    </>
  );
}
