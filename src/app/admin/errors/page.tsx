import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { ErrorState } from "@/components/ui";
import { requireAdmin } from "@/lib/admin";
import { ErrorList, type AppError } from "./ErrorList";

export const metadata: Metadata = { title: "오류 알림", robots: { index: false } };

/** 관리자 전용: 사용자 화면·서버에서 난 오류 모아 보기 */
export default async function AdminErrorsPage() {
  const { supabase } = await requireAdmin("/admin/errors");
  const { data, error } = await supabase
    .from("app_errors")
    .select("id, source, message, path, stack, user_agent, logged_in, count, first_seen, last_seen, resolved_at")
    .order("resolved_at", { ascending: false, nullsFirst: true })
    .order("last_seen", { ascending: false })
    .limit(200);

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Link href="/admin" className="-ml-2 inline-flex h-10 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-ink-muted hover:bg-slate-100 hover:text-ink">
        <ChevronLeft aria-hidden className="h-4 w-4" />
        운영 통계
      </Link>
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">오류 알림</h1>
        <p className="mt-1 text-sm leading-relaxed text-ink-muted">
          사용자가 말하지 않아도 앱에서 난 오류를 모아 보여 줘요. 같은 오류는 한 줄로 묶고 횟수를 세요. 새 오류가 생기면 관리자에게 알림이 가요(10분에 한 번까지). 회원 정보는 모으지 않아요.
        </p>
      </div>
      {error ? (
        <ErrorState title="오류 목록을 불러오지 못했어요" description="Supabase에서 034_app_errors.sql을 실행했는지 확인해 주세요." />
      ) : (
        <ErrorList errors={(data ?? []) as AppError[]} />
      )}
    </div>
  );
}
