import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { site } from "@/config/site";
import { requireAdmin } from "@/lib/admin";
import { UUID_RE } from "@/lib/community";
import { formatDateTime } from "@/lib/format";
import { PrintSheet } from "./PrintSheet";

export const metadata: Metadata = { title: "스티커 인쇄", robots: { index: false } };

export default async function StickerBatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const { supabase } = await requireAdmin(`/admin/stickers/${id}`);
  const [{ data: batch, error: bErr }, { data: stickers, error: sErr }] = await Promise.all([
    supabase.from("sticker_batches").select("id, label, quantity, created_at").eq("id", id).maybeSingle(),
    supabase.from("stickers").select("code, vehicle_id, lookup_code").eq("batch_id", id).order("created_at"),
  ]);
  if (bErr || sErr) throw bErr ?? sErr;
  if (!batch) notFound();
  const list = stickers ?? [];
  const claimed = list.filter((s) => s.vehicle_id).length;

  return (
    // print:space-y-0 — 인쇄할 때 숨긴 제목 영역 몫의 위 여백이 첫 장에 남지 않게
    <div className="space-y-4 print:space-y-0">
      <div className="space-y-3 print:hidden">
        <Link href="/admin/stickers" className="inline-flex items-center gap-1 text-sm font-semibold text-ink-muted hover:text-ink">
          <ChevronLeft aria-hidden className="h-4 w-4" />
          스티커 관리
        </Link>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">{batch.label}</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {list.length}장 · 등록됨 {claimed}장 · {formatDateTime(batch.created_at)}
          </p>
        </div>
      </div>
      <PrintSheet codes={list.map((s) => s.code)} lookups={list.map((s) => (s as { lookup_code?: string | null }).lookup_code ?? null)} label={batch.label} siteName={site.name} />
    </div>
  );
}
