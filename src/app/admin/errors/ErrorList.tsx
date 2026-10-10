"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, CircleAlert, Monitor, RotateCcw, Server, Smartphone, Trash2 } from "lucide-react";
import { Badge, Button, Card, EmptyState, useToast } from "@/components/ui";
import { cn } from "@/lib/cn";
import { friendlyError, timeAgo } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";

export type AppError = {
  id: string;
  source: "client" | "server";
  message: string;
  path: string | null;
  stack: string | null;
  user_agent: string | null;
  logged_in: boolean;
  count: number;
  first_seen: string;
  last_seen: string;
  resolved_at: string | null;
};

/** 브라우저 이름을 사람이 읽기 쉽게 */
function device(ua: string | null) {
  if (!ua) return null;
  const os = /iPhone|iPad/.test(ua) ? "아이폰" : /Android/.test(ua) ? "안드로이드" : /Windows/.test(ua) ? "윈도우" : /Mac OS/.test(ua) ? "맥" : "기타";
  const br = /SamsungBrowser/.test(ua) ? "삼성 인터넷" : /KAKAOTALK/.test(ua) ? "카카오톡" : /NAVER/.test(ua) ? "네이버" : /CriOS|Chrome/.test(ua) ? "크롬" : /Safari/.test(ua) ? "사파리" : "브라우저";
  return `${os} · ${br}`;
}

export function ErrorList({ errors }: { errors: AppError[] }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const openCount = errors.filter((e) => !e.resolved_at).length;
  const resolvedCount = errors.length - openCount;

  async function resolve(id: string, resolved: boolean) {
    setBusy(id);
    const { error } = await createClient().rpc("admin_resolve_app_error", { p_id: id, p_resolved: resolved });
    setBusy(null);
    if (error) return toast.error(friendlyError(error, "바꾸지 못했어요."));
    router.refresh();
  }

  async function clearResolved() {
    setBusy("clear");
    const { data, error } = await createClient().rpc("admin_clear_resolved_errors");
    setBusy(null);
    if (error) return toast.error(friendlyError(error, "지우지 못했어요."));
    toast.success(`해결한 오류 ${data ?? 0}개를 지웠어요.`);
    router.refresh();
  }

  if (errors.length === 0) {
    return <EmptyState icon={<Check className="h-7 w-7" />} title="아직 생긴 오류가 없어요" description="오류가 생기면 여기에 쌓이고 알림이 가요." />;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 px-1">
        <p className="text-sm font-semibold text-ink-soft">
          해결할 오류 <b className="text-rose-600">{openCount}</b>개 · 해결함 {resolvedCount}개
        </p>
        {resolvedCount > 0 && (
          <Button variant="ghost" className="h-10 text-sm" loading={busy === "clear"} onClick={clearResolved} icon={<Trash2 aria-hidden className="h-4 w-4" />}>
            해결한 것 지우기
          </Button>
        )}
      </div>
      <ul className="space-y-2">
        {errors.map((e) => (
          <li key={e.id}>
            <Card className={cn("space-y-2 p-4", e.resolved_at && "opacity-60")}>
              <div className="flex flex-wrap items-center gap-1.5">
                {e.resolved_at ? (
                  <Badge tone="success" icon={<Check aria-hidden className="h-3.5 w-3.5" />}>
                    해결함
                  </Badge>
                ) : (
                  <Badge tone="danger" icon={<CircleAlert aria-hidden className="h-3.5 w-3.5" />}>
                    {e.count}번
                  </Badge>
                )}
                <Badge icon={e.source === "server" ? <Server aria-hidden className="h-3.5 w-3.5" /> : <Monitor aria-hidden className="h-3.5 w-3.5" />}>
                  {e.source === "server" ? "서버" : "화면"}
                </Badge>
                {e.path && <Badge tone="brand">{e.path}</Badge>}
              </div>
              <button type="button" onClick={() => setOpen(open === e.id ? null : e.id)} className="block w-full text-left">
                <p className="break-all text-[15px] font-semibold leading-snug">{e.message}</p>
              </button>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-ink-muted">
                <span>처음 {timeAgo(e.first_seen)}</span>
                <span>· 마지막 {timeAgo(e.last_seen)}</span>
                {device(e.user_agent) && (
                  <span className="inline-flex items-center gap-1">
                    · <Smartphone aria-hidden className="h-3 w-3" />
                    {device(e.user_agent)}
                  </span>
                )}
                <span>· {e.logged_in ? "로그인 상태" : "로그인 전"}</span>
              </p>
              {open === e.id && e.stack && (
                <pre className="max-h-60 overflow-auto rounded-lg bg-slate-900 p-3 text-[11px] leading-relaxed text-slate-100">{e.stack}</pre>
              )}
              <div className="flex gap-2">
                {e.stack && (
                  <Button variant="ghost" className="h-9 px-3 text-[13px]" onClick={() => setOpen(open === e.id ? null : e.id)}>
                    {open === e.id ? "자세히 닫기" : "자세히 (개발용)"}
                  </Button>
                )}
                <Button
                  variant="secondary"
                  className="ml-auto h-9 px-3 text-[13px]"
                  loading={busy === e.id}
                  onClick={() => resolve(e.id, !e.resolved_at)}
                  icon={e.resolved_at ? <RotateCcw aria-hidden className="h-3.5 w-3.5" /> : <Check aria-hidden className="h-3.5 w-3.5" />}
                >
                  {e.resolved_at ? "다시 열기" : "해결함"}
                </Button>
              </div>
            </Card>
          </li>
        ))}
      </ul>
      <p className="px-1 text-[12px] leading-relaxed text-ink-faint">
        해결함으로 표시한 오류가 다시 생기면 자동으로 다시 열리고 알림이 와요. 인터넷 끊김, 브라우저 확장 프로그램 오류처럼 앱 문제가 아닌 것은 모으지 않아요.
      </p>
    </div>
  );
}
