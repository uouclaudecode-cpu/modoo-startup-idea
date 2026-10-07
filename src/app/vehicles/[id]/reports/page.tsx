import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, Inbox } from "lucide-react";
import { EmptyState, ErrorState, StatusBadge } from "@/components/ui";
import { displayStatus } from "@/lib/status";
import type { Report } from "@/lib/types";
import { getOwnedVehicle } from "@/lib/vehicles";
import { ReportCard } from "./ReportCard";
import { PinMap, type MapPin } from "@/components/map/PinMap";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "발견 제보" };

export default async function VehicleReportsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, vehicle } = await getOwnedVehicle(id, `/vehicles/${id}/reports`);
  const { data, error } = await supabase
    .from("reports")
    .select("id, vehicle_id, kind, latitude, longitude, location_text, description, image_path, contact, created_at")
    .eq("vehicle_id", vehicle.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    return <ErrorState title="제보를 불러오지 못했어요" description="인터넷 연결을 확인하고 새로고침해 주세요." />;
  }
  const reports = (data ?? []) as Report[];

  // 제보 사진은 비공개라서, 소유자에게만 1시간 동안 열리는 주소를 만듭니다.
  const paths = reports.map((r) => r.image_path).filter((p): p is string => Boolean(p));
  const signed = new Map<string, string>();
  if (paths.length) {
    const { data: urls, error: urlErr } = await supabase.storage.from("report-images").createSignedUrls(paths, 3600);
    if (urlErr) console.error(urlErr);
    for (const u of urls ?? []) if (u.path && u.signedUrl) signed.set(u.path, u.signedUrl);
  }

  const found = reports.filter((r) => r.kind === "found").length;
  // 위치가 있는 제보를 지도 핀으로 (최신이 1번)
  const pins: MapPin[] = reports
    .filter((r) => r.latitude != null && r.longitude != null)
    .map((r, i) => ({
      lat: r.latitude!,
      lng: r.longitude!,
      mark: String(i + 1),
      label: `${i + 1}. ${formatDateTime(r.created_at)} · ${r.location_text || (r.kind === "found" ? "발견 제보" : "연락 요청")}`,
      color: i === 0 ? "rose" : "orange",
    }));

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Link href={`/vehicles/${vehicle.id}`} className="inline-flex items-center gap-1 text-sm font-semibold text-ink-muted hover:text-ink">
        <ChevronLeft aria-hidden className="h-4 w-4" />
        {vehicle.name}
      </Link>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">발견 제보</h1>
          <p className="mt-1 text-sm text-ink-muted">
            발견 제보 {found}건 · 연락 {reports.length - found}건
          </p>
        </div>
        <StatusBadge status={displayStatus(vehicle.status, found)} />
      </div>

      {reports.length === 0 ? (
        <EmptyState
          icon={<Inbox className="h-7 w-7" />}
          title="아직 받은 제보가 없어요"
          description={
            vehicle.status === "searching"
              ? "누군가 QR을 스캔해 제보하면 여기에 바로 보여요."
              : "분실/도난 신고를 하면 QR을 스캔한 사람에게 수색 중 안내가 보여요."
          }
        />
      ) : (
        <>
        {pins.length > 0 && (
          <section aria-label="제보 위치 지도" className="space-y-1.5">
            <PinMap pins={pins} className="h-64" />
            <p className="text-[12px] text-ink-muted">핀 번호는 최신 제보부터예요. 핀을 누르면 시간과 장소가 보여요.</p>
          </section>
        )}
        <ul className="space-y-3">
          {reports.map((r) => (
            <li key={r.id}>
              <ReportCard report={r} imageUrl={r.image_path ? signed.get(r.image_path) ?? null : null} />
            </li>
          ))}
        </ul>
        </>
      )}
    </div>
  );
}
