import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ShieldCheck } from "lucide-react";
import { Card, EmptyState } from "@/components/ui";
import { requireAdmin } from "@/lib/admin";
import { formatDateTime } from "@/lib/format";
import { AlertModeration } from "./AlertModeration";

export const metadata: Metadata = { title: "도난 경보 신고", robots: { index: false } };

type Row = { id: string; status: string; flag_count: number; created_at: string; place_label: string | null; marks: string | null; brand: string | null; color: string | null; type: string; reasons: string[] };

export default async function AdminAlertsPage() {
  const { supabase } = await requireAdmin("/admin/alerts");
  const { data, error } = await supabase.rpc("admin_list_flagged_alerts");
  if (error) console.error(error);
  const rows = (data ?? []) as Row[];
  return (
    <div className="mx-auto max-w-xl space-y-5">
      <Link href="/admin" className="inline-flex items-center gap-1 text-sm font-semibold text-ink-muted hover:text-ink">
        <ChevronLeft aria-hidden className="h-4 w-4" />
        운영 통계
      </Link>
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">도난 경보 신고</h1>
        <p className="mt-1 text-sm leading-relaxed text-ink-muted">&lsquo;이 경보가 이상해요&rsquo; 신고가 들어온 경보예요. 3명이 신고하면 자동으로 숨겨져요.</p>
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={<ShieldCheck className="h-7 w-7" />} title="신고된 경보가 없어요" description="신고가 들어오면 여기에 모여요." />
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id}>
              <Card className="space-y-2 p-4">
                <div className="flex items-center justify-between gap-2">
                  <Link href={`/alerts/${r.id}`} className="font-bold text-brand-700 underline">
                    {[r.color, r.brand].filter(Boolean).join(" ") || r.type} 경보
                  </Link>
                  <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${r.status === "hidden" ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-ink-muted"}`}>
                    {r.status === "hidden" ? "숨김" : "보이는 중"} · 신고 {r.flag_count}
                  </span>
                </div>
                <p className="text-[13px] text-ink-muted">
                  {formatDateTime(r.created_at)} · {r.place_label ?? "장소 설명 없음"}
                </p>
                {r.marks && <p className="text-[14px]">{r.marks}</p>}
                {r.reasons.length > 0 && (
                  <ul className="list-disc space-y-0.5 pl-5 text-[13px] text-ink-soft">
                    {r.reasons.map((x, i) => (
                      <li key={i}>{x}</li>
                    ))}
                  </ul>
                )}
                <AlertModeration id={r.id} status={r.status} />
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
