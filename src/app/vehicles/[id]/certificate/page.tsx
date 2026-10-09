/* eslint-disable @next/next/no-img-element -- 인쇄용 증명서라 기본 img 사용 */
import type { Metadata } from "next";
import Link from "next/link";
import QRCode from "qrcode";
import { ChevronLeft, ShieldCheck } from "lucide-react";
import { ErrorState } from "@/components/ui";
import { type Evidence, evidenceLabel } from "@/lib/evidence";
import { formatDate, formatDateTime } from "@/lib/format";
import { vehicleImageUrl } from "@/lib/images";
import { formatDistance } from "@/lib/ride/geo";
import { typeLabel } from "@/lib/types";
import { getOwnedVehicle } from "@/lib/vehicles";
import { PrintButton } from "./PrintButton";

export const metadata: Metadata = { title: "소유 증명서", robots: { index: false, follow: false } };

const STATUS_TEXT: Record<string, string> = { active: "정상", searching: "분실·도난 수색 중", recovered: "회수 완료" };

export default async function CertificatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, vehicle } = await getOwnedVehicle(id, `/vehicles/${id}/certificate`);
  const [{ data: cert, error }, { data: ev }, { data: history }, { data: stickers }, { data: profile }, { data: auth }] = await Promise.all([
    supabase.rpc("issue_certificate", { p_vehicle: vehicle.id }),
    supabase.from("vehicle_evidence").select("*").eq("vehicle_id", vehicle.id).order("created_at"),
    supabase.from("vehicle_ownership_history").select("started_at, ended_at, method").eq("vehicle_id", vehicle.id).order("started_at"),
    supabase.from("stickers").select("claimed_at").eq("vehicle_id", vehicle.id),
    supabase.from("profiles").select("nickname").eq("id", vehicle.owner_id).maybeSingle(),
    supabase.auth.getUser(),
  ]);
  if (error || !cert) {
    console.error(error);
    return <ErrorState title="증명서를 만들지 못했어요" description="잠시 후 다시 시도해 주세요." />;
  }
  const c = cert as { id: string; token: string; issued_at: string };
  const items = (ev ?? []) as Evidence[];
  const signed: Record<string, string> = {};
  if (items.length) {
    const { data: urls } = await supabase.storage.from("evidence").createSignedUrls(items.map((e) => e.photo_path), 3600);
    for (const u of urls ?? []) if (u.path && u.signedUrl) signed[u.path] = u.signedUrl;
  }
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "https://b-lock-app.vercel.app").replace(/\/$/, "");
  const verifyUrl = `${base}/c/${c.token}`;
  const qr = await QRCode.toDataURL(verifyUrl, { width: 300, margin: 1 });
  const v = vehicle as typeof vehicle & { purchased_on?: string | null; purchase_place?: string | null };
  const stickerAt = (stickers ?? []).map((s) => s.claimed_at).filter(Boolean).sort()[0] as string | undefined;

  const rows: [string, string][] = [
    ["종류", typeLabel(vehicle.type)],
    ["브랜드·모델", [vehicle.brand, vehicle.model].filter(Boolean).join(" ") || "—"],
    ["색상", vehicle.color || "—"],
    ["차대번호", vehicle.serial_last4 ? `끝 4자리 ${vehicle.serial_last4} (전체 번호는 아래 사진)` : "미등록"],
    ["특징", vehicle.description || "—"],
    ["구매", [v.purchased_on ? formatDate(v.purchased_on) : null, v.purchase_place].filter(Boolean).join(" · ") || "—"],
    ["B-LOCK 등록", formatDateTime(vehicle.created_at)],
    ["현재 소유 시작", vehicle.owned_since ? formatDateTime(vehicle.owned_since) : formatDateTime(vehicle.created_at)],
    ["QR 스티커 연결", stickerAt ? formatDateTime(stickerAt) : "없음"],
    ["기록된 주행거리", formatDistance(vehicle.odometer_m ?? 0)],
    ["현재 상태", STATUS_TEXT[vehicle.status] ?? vehicle.status],
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <Link href={`/vehicles/${vehicle.id}/evidence`} className="-ml-2 inline-flex h-10 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-ink-muted hover:bg-slate-100 hover:text-ink">
          <ChevronLeft aria-hidden className="h-4 w-4" />
          소유 증명
        </Link>
        <PrintButton />
      </div>

      <article className="space-y-5 rounded-2xl bg-white p-6 shadow-card ring-1 ring-line/70 print:p-0 print:shadow-none print:ring-0">
        <header className="flex items-start justify-between gap-4 border-b border-line pb-4">
          <div>
            <p className="flex items-center gap-1.5 text-sm font-bold text-brand-700">
              <ShieldCheck aria-hidden className="h-4 w-4" />
              B-LOCK
            </p>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight">이동수단 소유 증명서</h1>
            <p className="mt-1 text-[13px] text-ink-muted">
              발급 {formatDateTime(c.issued_at)} · 문서번호 {c.id.slice(0, 8).toUpperCase()}
            </p>
          </div>
          <div className="flex-none text-center">
            <img src={qr} alt="진위 확인 QR" className="h-24 w-24" />
            <p className="mt-1 text-[10px] text-ink-muted">QR로 진위 확인</p>
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-[1fr_200px]">
          <dl className="grid grid-cols-[7.5rem_1fr] gap-x-3 gap-y-1.5 text-[14px]">
            {rows.map(([k, val]) => (
              <div key={k} className="contents">
                <dt className="text-ink-muted">{k}</dt>
                <dd className="whitespace-pre-line font-medium">{val}</dd>
              </div>
            ))}
          </dl>
          {vehicle.image_path && <img src={vehicleImageUrl(vehicle.image_path) ?? ""} alt="등록 사진" className="aspect-square w-full rounded-xl object-cover" />}
        </section>

        <section>
          <h2 className="mb-2 text-[15px] font-bold">소유 이력</h2>
          <ol className="space-y-1 text-[14px]">
            {(history ?? []).map((h, i) => (
              <li key={i}>
                {formatDate(h.started_at)} {h.method === "register" ? "등록" : h.method === "transfer" ? "넘겨받음" : "관리자 조정"}
                {h.ended_at ? ` → ${formatDate(h.ended_at)} 이전` : " → 현재"}
              </li>
            ))}
          </ol>
        </section>

        {items.length > 0 && (
          <section>
            <h2 className="mb-2 text-[15px] font-bold">증거 사진 (올린 시각은 B-LOCK이 자동으로 기록)</h2>
            <div className="grid grid-cols-3 gap-2">
              {items.map((e) => (
                <figure key={e.id} className="space-y-1">
                  {signed[e.photo_path] && <img src={signed[e.photo_path]} alt={evidenceLabel(e.kind)} className="aspect-square w-full rounded-lg object-cover" />}
                  <figcaption className="text-[11px] leading-tight text-ink-muted">
                    {evidenceLabel(e.kind)} · {formatDateTime(e.created_at)}
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>
        )}

        <footer className="space-y-1 border-t border-line pt-3 text-[12px] leading-relaxed text-ink-muted">
          <p>
            등록자: {profile?.nickname || "회원"} ({auth.user?.email ?? ""})
          </p>
          <p>
            이 문서는 B-LOCK에 등록된 정보와 B-LOCK에 자동으로 남은 시각을 정리한 것으로, 법적 소유권을 확정하는 공문서는 아니에요. 진위는 QR 또는 {verifyUrl}에서 확인할 수
            있어요.
          </p>
        </footer>
      </article>
    </div>
  );
}
