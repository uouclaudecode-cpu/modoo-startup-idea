import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { LogoutButton } from "@/components/layout/LogoutButton";
import { PushSettings } from "@/components/push/PushSettings";
import { BlockedUsers } from "@/components/settings/BlockedUsers";
import { Card } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { DeleteAccount } from "./DeleteAccount";
import { NicknameForm } from "./NicknameForm";
import { PasswordForm } from "./PasswordForm";
import { SettingsSection } from "./SettingsSection";

export const metadata: Metadata = { title: "설정" };

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/settings");

  const { data: profile, error } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (error) console.error(error);

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm font-semibold text-ink-muted hover:text-ink">
        <ChevronLeft aria-hidden className="h-4 w-4" />MY
      </Link>
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">설정</h1>
        <p className="mt-1 text-sm text-ink-muted">{user.email}</p>
      </div>

      <SettingsSection title="프로필" description="닉네임은 인사말과 커뮤니티 글·댓글에 보여요.">
        <NicknameForm initial={profile?.nickname ?? ""} />
      </SettingsSection>

      {/* 알림 카드는 자체 제목·설명을 가진 카드라 그대로 넣어요 */}
      <PushSettings
        notify_reports={profile?.notify_reports ?? true}
        notify_comments={profile?.notify_comments ?? true}
        notify_maintenance={profile?.notify_maintenance ?? true}
      />

      <SettingsSection title="비밀번호 변경">
        <PasswordForm />
      </SettingsSection>

      <Card>
        <BlockedUsers />
      </Card>

      <SettingsSection title="로그아웃" description="이 기기에서 로그아웃하고, 이 기기의 알림도 함께 꺼요.">
        <LogoutButton />
      </SettingsSection>

      <SettingsSection title="회원 탈퇴" description="계정과 등록한 이동수단·라이딩·정비 기록·커뮤니티 글과 댓글이 모두 지워지고 되돌릴 수 없어요." danger>
        <DeleteAccount email={user.email ?? ""} />
      </SettingsSection>
    </div>
  );
}
