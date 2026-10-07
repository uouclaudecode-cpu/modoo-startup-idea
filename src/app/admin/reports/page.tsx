import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, EyeOff, Flag, Lock, ShieldCheck, Trash2 } from "lucide-react";
import { Badge, Card, EmptyState, ErrorState } from "@/components/ui";
import { requireAdmin } from "@/lib/admin";
import { formatDateTime, timeAgo } from "@/lib/format";
import { reasonLabel, type ReportSummary } from "@/lib/moderation";
import { ReportActions } from "./ReportActions";

export const metadata: Metadata = { title: "신고 관리", robots: { index: false } };

/** 관리자: 신고된 글·댓글을 모아 보고 숨기기·다시 보이기·삭제 */
export default async function AdminReportsPage() {
  const { supabase } = await requireAdmin("/admin/reports");
  const { data, error } = await supabase.rpc("admin_list_reports");
  if (error) console.error(error);
  const rows = (data ?? []) as ReportSummary[];
  // 아직 처리하지 않은 것(보이는 중) 개수: 머리말에 보여줘요
  const open = rows.filter((r) => !r.deleted && !r.hidden_at).length;

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">🚨 신고 관리</h1>
        <p className="mt-1 text-sm leading-relaxed text-ink-muted">
          서로 다른 3명이 신고하면 자동으로 숨겨져요. 내용을 확인하고 숨기기·다시 보이기·삭제를 골라 주세요.
          {!error && rows.length > 0 && (
            <>
              {" "}
              지금 보이는 중인 신고 대상은 <b className="text-ink">{open}개</b>예요.
            </>
          )}
        </p>
      </div>

      {error ? (
        <ErrorState title="신고 목록을 불러오지 못했어요" description="인터넷 연결을 확인하고 새로고침해 주세요." />
      ) : rows.length === 0 ? (
        <EmptyState icon={<ShieldCheck className="h-7 w-7" />} title="들어온 신고가 없어요" description="신고가 들어오면 여기에 최근 순으로 모여요." />
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={`${r.target_type}:${r.target_id}`}>
              <ReportCard row={r} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ReportCard({ row: r }: { row: ReportSummary }) {
  const kind = r.target_type === "post" ? "글" : r.is_secret ? "비밀 댓글" : "댓글";
  const canOpen = !r.deleted && r.post_id;
  const text = r.excerpt ?? "(사라진 내용이에요)";

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone="neutral" icon={r.is_secret ? <Lock aria-hidden className="h-3 w-3" /> : undefined}>
          {kind}
        </Badge>
        <Badge tone="brand" icon={<Flag aria-hidden className="h-3 w-3" />}>
          신고 {r.report_count}명
        </Badge>
        {r.deleted ? (
          <Badge tone="danger" icon={<Trash2 aria-hidden className="h-3 w-3" />}>
            삭제됨
          </Badge>
        ) : r.hidden_at ? (
          <Badge tone="warning" icon={<EyeOff aria-hidden className="h-3 w-3" />}>
            숨김
          </Badge>
        ) : (
          <Badge tone="success">보이는 중</Badge>
        )}
        <time className="ml-auto text-[13px] text-ink-faint" dateTime={r.last_reported_at} title={formatDateTime(r.last_reported_at)}>
          {timeAgo(r.last_reported_at)}
        </time>
      </div>

      <div className="space-y-1">
        {canOpen ? (
          <Link
            href={`/community/${r.post_id}`}
            className="group inline-flex items-start gap-1.5 font-semibold leading-snug text-ink underline-offset-2 hover:underline"
          >
            <span className="line-clamp-2 break-all">{r.target_type === "comment" ? `“${text}”` : text}</span>
            <ExternalLink aria-hidden className="mt-1 h-3.5 w-3.5 flex-none text-ink-faint group-hover:text-ink-soft" />
          </Link>
        ) : (
          <p className="line-clamp-2 break-all font-semibold leading-snug text-ink-muted">{r.target_type === "comment" ? `“${text}”` : text}</p>
        )}
        {r.author_name && <p className="text-[13px] text-ink-muted">작성자 {r.author_name}</p>}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <span className="sr-only">신고 이유:</span>
        {r.reasons.map((reason) => (
          <span key={reason} className="rounded-full bg-rose-50 px-2.5 py-1 text-[12px] font-semibold text-rose-700">
            {reasonLabel(reason)}
          </span>
        ))}
      </div>

      {r.details.length > 0 && (
        <ul className="space-y-1 rounded-xl bg-slate-50 px-3 py-2.5 text-[13px] leading-relaxed text-ink-soft">
          {r.details.slice(0, 3).map((d, i) => (
            <li key={i} className="break-all">
              “{d}”
            </li>
          ))}
          {r.details.length > 3 && <li className="text-ink-faint">외 {r.details.length - 3}개</li>}
        </ul>
      )}

      {!r.deleted && <ReportActions targetType={r.target_type} targetId={r.target_id} hidden={Boolean(r.hidden_at)} />}
    </Card>
  );
}
