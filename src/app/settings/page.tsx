import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
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
        <ChevronLeft aria-hidden className="h-4 w-4" />내 이동수단
      </Link>
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">설정</h1>
        <p className="mt-1 text-sm text-ink-muted">{user.email}</p>
      </div>

      <SettingsSection title="프로필" description="닉네임은 인사말과 커뮤니티 글·댓글에 보여요.">
        <NicknameForm initial={profile?.nickname ?? ""} />
      </SettingsSection>

      <SettingsSection title="비밀번호 변경">
        <PasswordForm />
      </SettingsSection>

      <SettingsSection title="회원 탈퇴" description="계정과 등록한 이동수단·라이딩·정비 기록·커뮤니티 글과 댓글이 모두 지워지고 되돌릴 수 없어요." danger>
        <DeleteAccount email={user.email ?? ""} />
      </SettingsSection>
    </div>
  );
}
