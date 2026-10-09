import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Bell, ChevronRight, Settings } from "lucide-react";
import { Card, EmptyState, ErrorState } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatDateTime, timeAgo } from "@/lib/format";
import { safeNext } from "@/lib/safeNext";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "알림함", robots: { index: false } };

type Notification = { id: string; title: string; body: string | null; url: string; created_at: string; read_at: string | null };

/** 이 화면에서 한 번에 보여 주는 개수 (데이터베이스에는 최근 200개까지 남아요) */
const LIMIT = 100;

/**
 * 앱 안 알림함: 휴대폰 알림(푸시)으로 보낸 소식을 모두 모아 둬요.
 * 알림을 꺼 두었거나, 아이폰에서 홈 화면 앱이 아니거나, 다른 기기로 로그인해도 여기서 다시 볼 수 있어요.
 * 화면을 열면 모두 읽음으로 바꾸고, 이번에 처음 본 알림에는 '새 알림' 표시를 남겨 둬요.
 */
export default async function NotificationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/notifications");

  const { data, error } = await supabase
    .from("notifications")
    .select("id, title, body, url, created_at, read_at")
    .order("created_at", { ascending: false })
    .limit(LIMIT);
  if (error) console.error(error);
  const items = (data ?? []) as Notification[];

  if (items.some((n) => !n.read_at)) {
    const { error: readErr } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .is("read_at", null);
    if (readErr) console.error(readErr);
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">알림함</h1>
          <p className="mt-1 text-sm leading-relaxed text-ink-muted">댓글·제보·경보·사례금·소유권 넘기기 소식을 모아 둬요. 최근 90일, 200개까지 남아요.</p>
        </div>
        <Link
          href="/settings"
          className="-mr-2 inline-flex min-h-11 flex-none items-center gap-1 rounded-lg px-2 text-sm font-semibold text-brand-700 hover:bg-brand-50"
        >
          <Settings aria-hidden className="h-4 w-4" />
          알림 설정
        </Link>
      </div>

      {error ? (
        <ErrorState title="알림을 불러오지 못했어요" description="인터넷 연결을 확인하고 새로고침해 주세요." />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Bell aria-hidden className="h-7 w-7" />}
          title="아직 알림이 없어요"
          description="내 글의 댓글, 발견·목격 제보, 근처 도난 경보, 사례금·소유권 넘기기 소식이 오면 여기에 모여요. 휴대폰 알림을 못 받아도 여기서 다시 볼 수 있어요."
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <ul className="divide-y divide-line">
            {items.map((n) => {
              const fresh = !n.read_at;
              return (
                <li key={n.id}>
                  <Link
                    href={safeNext(n.url, "/dashboard")}
                    className={cn("flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-slate-50", fresh && "bg-brand-50/60")}
                  >
                    <span aria-hidden className={cn("mt-2 h-2 w-2 flex-none rounded-full", fresh ? "bg-rose-500" : "bg-transparent")} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold leading-snug text-ink">
                        {fresh && <span className="sr-only">새 알림: </span>}
                        {n.title}
                      </span>
                      {n.body && <span className="mt-0.5 line-clamp-2 block text-[14px] leading-relaxed text-ink-soft">{n.body}</span>}
                      <time dateTime={n.created_at} title={formatDateTime(n.created_at)} className="mt-1 block text-[12px] text-ink-faint">
                        {timeAgo(n.created_at)}
                      </time>
                    </span>
                    <ChevronRight aria-hidden className="mt-1 h-4 w-4 flex-none text-ink-faint" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      {items.length >= LIMIT && <p className="text-center text-[12px] text-ink-muted">최근 {LIMIT}개만 보여요.</p>}
    </div>
  );
}
