import Link from "next/link";
import { ChevronRight, Inbox, QrCode, ShieldCheck, Siren, Wrench } from "lucide-react";
import { ButtonLink, StatusBadge } from "@/components/ui";
import { cn } from "@/lib/cn";
import { vehicleImageUrl } from "@/lib/images";
import type { CareItem } from "@/lib/myHome";
import { PART_META, partStatus } from "@/lib/parts";
import { formatDistance } from "@/lib/ride/geo";
import { displayStatus, STATUS_META } from "@/lib/status";
import { typeLabel, type Vehicle } from "@/lib/types";
import { LostReportButton } from "./LostReportButton";
import { VehicleImage } from "./VehicleImage";

/**
 * 홈의 '내 이동수단' 카드: 상태를 한눈에, 자주 쓰는 곳(QR·받은 제보·정비)은 한 번에,
 * 잃어버렸을 때는 카드에서 바로 신고(두 번 누르면 끝).
 */
export function HomeVehicleCard({ vehicle: v, foundReports, waiting, care }: { vehicle: Vehicle; foundReports: number; waiting: number; care: CareItem[] }) {
  const status = displayStatus(v.status, foundReports);
  const searching = v.status === "searching";
  const urgentCare = care.find((c) => partStatus(c.ratio) === "replace") ?? null;
  const careTop = urgentCare ?? care[0] ?? null;

  return (
    <article className={cn("flex h-full flex-col overflow-hidden rounded-3xl bg-white shadow-card ring-1 ring-line/70", STATUS_META[status].ring)}>
      {searching && (
        <div className={cn("flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white", status === "reported" ? "bg-orange-500" : "bg-rose-600")}>
          <Siren aria-hidden className="h-4 w-4" />
          {status === "reported" ? `발견 제보 ${foundReports}건이 도착했어요` : "찾고 있어요 · 제보를 기다리는 중"}
        </div>
      )}
      <Link href={`/vehicles/${v.id}`} className="flex items-center gap-3 p-4 pb-3">
        <VehicleImage thumb src={vehicleImageUrl(v.image_path)} type={v.type} alt={v.name} className="h-16 w-16 flex-none rounded-2xl" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-lg font-bold leading-snug">{v.name}</span>
          <span className="block truncate text-[13px] text-ink-muted">
            {typeLabel(v.type)}
            {v.odometer_m > 0 ? ` · 누적 ${formatDistance(v.odometer_m)}` : ""}
          </span>
          <span className="mt-1 inline-flex">
            <StatusBadge status={status} />
          </span>
        </span>
        <ChevronRight aria-hidden className="h-5 w-5 flex-none text-ink-faint" />
      </Link>

      {/* 정비가 필요하면 한 줄로 */}
      {careTop && (
        <Link
          href={`/vehicles/${v.id}/maintenance`}
          className={cn(
            "mx-4 mb-2 flex items-center gap-2 rounded-xl px-3 py-2 text-[13px] font-semibold",
            urgentCare ? "bg-rose-50 text-rose-800" : "bg-amber-50 text-amber-900",
          )}
        >
          <span aria-hidden>{PART_META[careTop.part.kind].emoji}</span>
          {PART_META[careTop.part.kind].label} · {urgentCare ? "지금 챙겨 주세요" : "곧 챙길 때예요"}
          {care.length > 1 && <span className="opacity-70">외 {care.length - 1}건</span>}
          <ChevronRight aria-hidden className="ml-auto h-4 w-4 opacity-60" />
        </Link>
      )}

      {/* 자주 쓰는 곳 */}
      <nav aria-label={`${v.name} 바로가기`} className="mx-4 grid grid-cols-3 gap-1 border-t border-line/70 py-2 text-center text-[12px] font-semibold text-ink-soft">
        <Link href={`/vehicles/${v.id}/qr`} className="flex flex-col items-center gap-1 rounded-xl py-2 hover:bg-slate-50">
          <QrCode aria-hidden className="h-5 w-5 text-brand-600" />내 QR
        </Link>
        <Link href={`/vehicles/${v.id}/reports`} className="relative flex flex-col items-center gap-1 rounded-xl py-2 hover:bg-slate-50">
          <Inbox aria-hidden className="h-5 w-5 text-emerald-600" />
          받은 제보
          {waiting > 0 && (
            <span className="absolute right-2 top-1 grid h-5 min-w-5 place-items-center rounded-full bg-rose-600 px-1 text-[11px] font-bold text-white" aria-label={`답장 기다림 ${waiting}건`}>
              {waiting}
            </span>
          )}
        </Link>
        <Link href={`/vehicles/${v.id}/maintenance`} className="flex flex-col items-center gap-1 rounded-xl py-2 hover:bg-slate-50">
          <Wrench aria-hidden className="h-5 w-5 text-amber-600" />
          정비
        </Link>
      </nav>

      {/* 잃어버렸을 때 / 찾고 있을 때 */}
      <div className="mt-auto p-4 pt-1">
        {searching ? (
          <div className="grid grid-cols-2 gap-2">
            <ButtonLink href={`/vehicles/${v.id}/reports`} variant="danger" icon={<Inbox aria-hidden className="h-4 w-4" />} className="h-11">
              제보 보기
            </ButtonLink>
            <ButtonLink href={`/vehicles/${v.id}#status`} variant="secondary" icon={<ShieldCheck aria-hidden className="h-4 w-4" />} className="h-11">
              찾았어요
            </ButtonLink>
          </div>
        ) : (
          <LostReportButton vehicleId={v.id} label="잃어버렸어요" compact soft />
        )}
      </div>
    </article>
  );
}
