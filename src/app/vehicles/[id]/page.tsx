import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, EyeOff, MessagesSquare, Pencil, PenSquare, QrCode, ScanLine, Tag, Wrench } from "lucide-react";
import { MaintenanceAlert } from "@/components/maintenance/MaintenanceAlert";
import { partsNeedingCare, type VehiclePart } from "@/lib/parts";
import { formatDistance } from "@/lib/ride/geo";
import { ButtonLink, Card, StatusBadge } from "@/components/ui";
import { VehicleImage } from "@/components/vehicle/VehicleImage";
import { formatDate } from "@/lib/format";
import { vehicleImageUrl } from "@/lib/images";
import { displayStatus } from "@/lib/status";
import { typeLabel } from "@/lib/types";
import { getOwnedVehicle } from "@/lib/vehicles";
import { StatusActions } from "./StatusActions";
import { TradeCard } from "./TradeCard";

export const metadata: Metadata = { title: "이동수단 상세" };

export default async function VehicleDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sticker?: string; received?: string }>;
}) {
  const { id } = await params;
  const { sticker: justClaimed, received } = await searchParams;
  const { supabase, vehicle } = await getOwnedVehicle(id, `/vehicles/${id}`);
  const { count } = await supabase
    .from("reports")
    .select("id", { count: "exact", head: true })
    .eq("vehicle_id", vehicle.id)
    .eq("kind", "found");
  const { count: total } = await supabase.from("reports").select("id", { count: "exact", head: true }).eq("vehicle_id", vehicle.id);
  const { data: openPost } = await supabase
    .from("lost_posts")
    .select("id, comment_count")
    .eq("vehicle_id", vehicle.id)
    .eq("status", "open")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: parts, error: partsErr } = await supabase
    .from("vehicle_parts")
    .select("id, vehicle_id, kind, interval_km, interval_days, distance_m, last_serviced_at, enabled")
    .eq("vehicle_id", vehicle.id);
  if (partsErr) console.error(partsErr);
  const now = Date.now();
  const care = partsNeedingCare((parts ?? []) as VehiclePart[], now);
  const { count: stickerCount } = await supabase
    .from("stickers")
    .select("code", { count: "exact", head: true })
    .eq("vehicle_id", vehicle.id);
  const status = displayStatus(vehicle.status, count ?? 0);

  const rows: [string, string | null][] = [
    ["종류", typeLabel(vehicle.type)],
    ["브랜드", vehicle.brand],
    ["모델", vehicle.model],
    ["색상", vehicle.color],
    ["등록일", formatDate(vehicle.created_at)],
  ];

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm font-semibold text-ink-muted hover:text-ink">
        <ChevronLeft aria-hidden className="h-4 w-4" />내 이동수단
      </Link>

      <Card className="overflow-hidden p-0">
        <VehicleImage src={vehicleImageUrl(vehicle.image_path)} type={vehicle.type} alt={vehicle.name} className="aspect-[4/3]" />
        <div className="space-y-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-2xl font-extrabold tracking-tight">{vehicle.name}</h1>
            <StatusBadge status={status} size="lg" />
          </div>
          <dl className="grid grid-cols-[5rem_1fr] gap-x-3 gap-y-2 text-[15px]">
            {rows.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-ink-muted">{k}</dt>
                <dd className="font-medium">{v || "—"}</dd>
              </div>
            ))}
          </dl>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-[13px] font-semibold text-ink-muted">특징</p>
            <p className="mt-1 whitespace-pre-line text-[15px] leading-relaxed">{vehicle.description || "등록된 특징이 없어요."}</p>
          </div>
        </div>
      </Card>

      {received && (
        <div className="flex items-start gap-3 rounded-2xl bg-emerald-50 p-4 text-emerald-800 ring-1 ring-emerald-200">
          <Tag aria-hidden className="mt-0.5 h-5 w-5 flex-none" />
          <p className="text-[15px] leading-relaxed">
            <b>소유권을 받았어요!</b> 이전 주인이 알던 스티커 위치는 지웠어요. 스티커를 새 곳에 숨기고 아래 &lsquo;위치 적기&rsquo;로 적어 두세요.
          </p>
        </div>
      )}

      {justClaimed && (
        <div className="flex items-start gap-3 rounded-2xl bg-emerald-50 p-4 text-emerald-800 ring-1 ring-emerald-200">
          <Tag aria-hidden className="mt-0.5 h-5 w-5 flex-none" />
          <p className="text-[15px] leading-relaxed">
            <b>스티커를 연결했어요!</b> 주인만 아는 곳에 붙여 주세요. 이제 누가 이 스티커를 찍으면 이 화면의 이동수단 정보가 보이고, 발견 제보가 나에게 와요.
          </p>
        </div>
      )}

      <MaintenanceAlert vehicleId={vehicle.id} vehicleName={vehicle.name} items={care} now={now} />

      <Card className="flex items-center gap-3 p-4">
        <span aria-hidden className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-brand-50 text-brand-600">
          <Wrench className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-bold">소모품·정비</p>
          <p className="text-[13px] text-ink-muted">
            누적 주행 {formatDistance(vehicle.odometer_m ?? 0)} · {care.length ? `알림 ${care.length}건` : "모두 양호"}
          </p>
        </div>
        <ButtonLink href={`/vehicles/${vehicle.id}/maintenance`} variant="secondary" className="flex-none">
          보기
        </ButtonLink>
      </Card>

      <Card className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-2 font-bold">
            <Tag aria-hidden className="h-4 w-4 text-brand-600" />
            QR 스티커
          </p>
          <span className="text-sm text-ink-muted">{stickerCount ? `받은 스티커 ${stickerCount}장 연결됨` : "연결한 스티커 없음"}</span>
        </div>
        <p className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-[14px] leading-relaxed text-ink-soft">
          <EyeOff aria-hidden className="mt-0.5 h-4 w-4 flex-none" />
          {vehicle.sticker_spot ? (
            <span>
              붙인 위치 (나만 보기): <b className="text-ink">{vehicle.sticker_spot}</b>
            </span>
          ) : (
            <span>붙인 위치를 적어 두면, 커뮤니티에서 &ldquo;이건가요?&rdquo;라고 묻는 사람에게 비밀 답글로 바로 알려줄 수 있어요.</span>
          )}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <ButtonLink href="/scan" variant="secondary" icon={<ScanLine aria-hidden className="h-4 w-4" />}>
            스티커 연결
          </ButtonLink>
          <ButtonLink href={`/vehicles/${vehicle.id}/edit`} variant="secondary" icon={<EyeOff aria-hidden className="h-4 w-4" />}>
            위치 적기
          </ButtonLink>
        </div>
      </Card>

      <StatusActions vehicleId={vehicle.id} status={vehicle.status} foundReports={count ?? 0} totalReports={total ?? 0} />

      <TradeCard vehicleId={vehicle.id} serialLast4={vehicle.serial_last4 ?? null} searching={vehicle.status === "searching"} />

      {openPost ? (
        <ButtonLink href={`/community/${openPost.id}`} variant="secondary" full size="lg" icon={<MessagesSquare aria-hidden className="h-5 w-5" />}>
          커뮤니티 분실 글 보기 (댓글 {openPost.comment_count})
        </ButtonLink>
      ) : (
        vehicle.status === "searching" && (
          <ButtonLink href={`/community/new?vehicle=${vehicle.id}`} variant="secondary" full size="lg" icon={<PenSquare aria-hidden className="h-5 w-5" />}>
            커뮤니티에 분실 글 올리기
          </ButtonLink>
        )
      )}

      <div className="grid grid-cols-2 gap-2">
        <ButtonLink href={`/vehicles/${vehicle.id}/qr`} variant="secondary" size="lg" icon={<QrCode aria-hidden className="h-5 w-5" />}>
          QR 보기·저장
        </ButtonLink>
        <ButtonLink href={`/vehicles/${vehicle.id}/edit`} variant="secondary" size="lg" icon={<Pencil aria-hidden className="h-5 w-5" />}>
          정보 수정
        </ButtonLink>
      </div>
    </div>
  );
}
