import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Printer } from "lucide-react";
import { Card, EmptyState } from "@/components/ui";
import { requireAdmin } from "@/lib/admin";
import { formatDateTime } from "@/lib/format";
import { NewBatchForm } from "./NewBatchForm";
import { SpotManager, type AdminSpot } from "./SpotManager";

export const metadata: Metadata = { title: "스티커 관리", robots: { index: false } };

/** 관리자: QR 스티커 묶음 만들기·인쇄 */
export default async function AdminStickersPage() {
  const { supabase } = await requireAdmin("/admin/stickers");
  const { data: batches, error } = await supabase
    .from("sticker_batches")
    .select("id, label, quantity, created_at")
    .order("created_at", { ascending: false });
  if (error) console.error(error);
  const { data: spots, error: spotErr } = await supabase
    .from("sticker_spots")
    .select("id, name, address, hours, note, lat, lng, active")
    .order("created_at", { ascending: true });
  if (spotErr) console.error(spotErr);

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">🏷️ 스티커 관리</h1>
        <p className="mt-1 text-sm leading-relaxed text-ink-muted">
          학교·편의점에 둘 빈 스티커를 만들어요. 스티커마다 다른 무작위 QR이 들어가고, 사용자가 찍어서 자기 이동수단에 등록해요.
        </p>
      </div>
      <NewBatchForm />
      <SpotManager spots={(spots ?? []) as AdminSpot[]} />
      <section className="space-y-2">
        <h2 className="font-bold">만든 묶음</h2>
        {error && <p className="text-sm text-rose-600">목록을 불러오지 못했어요. 새로고침해 주세요.</p>}
        {(batches ?? []).length === 0 && !error ? (
          <EmptyState icon={<Printer className="h-7 w-7" />} title="아직 만든 스티커가 없어요" description="위에서 장소 이름과 장수를 넣고 만들어 보세요." />
        ) : (
          <ul className="space-y-2">
            {(batches ?? []).map((b) => (
              <li key={b.id}>
                <Link href={`/admin/stickers/${b.id}`} className="block">
                  <Card className="flex items-center gap-3 p-4 hover:shadow-lift">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{b.label}</p>
                      <p className="text-[13px] text-ink-muted">
                        {b.quantity}장 · {formatDateTime(b.created_at)}
                      </p>
                    </div>
                    <ChevronRight aria-hidden className="h-5 w-5 text-ink-faint" />
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
