import type { Metadata } from "next";
import Link from "next/link";
import { BellRing, ChevronDown, ChevronLeft, FileBadge, MessagesSquare, Pencil, PenSquare, Siren, Tag, Wrench } from "lucide-react";
import { PART_META, partStatus, partsNeedingCare, type VehiclePart } from "@/lib/parts";
import { formatDistance } from "@/lib/ride/geo";
import { ButtonLink, Card, StatusBadge } from "@/components/ui";
import { VehicleImage } from "@/components/vehicle/VehicleImage";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import { vehicleImageUrl } from "@/lib/images";
import { displayStatus } from "@/lib/status";
import { typeLabel } from "@/lib/types";
import { getOwnedVehicle } from "@/lib/vehicles";
import { StatusActions } from "./StatusActions";
import { StickerCard, type LinkedSticker } from "./StickerCard";
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
  const [{ count }, { count: total }, { data: openPost }, { data: parts, error: partsErr }, { data: stickerRows, error: stickerErr }, { data: openAlert }] =
    await Promise.all([
      supabase.from("reports").select("id", { count: "exact", head: true }).eq("vehicle_id", vehicle.id).eq("kind", "found"),
      supabase.from("reports").select("id", { count: "exact", head: true }).eq("vehicle_id", vehicle.id),
      supabase
        .from("lost_posts")
        .select("id, comment_count")
        .eq("vehicle_id", vehicle.id)
        .eq("status", "open")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("vehicle_parts")
        .select("id, vehicle_id, kind, interval_km, interval_days, distance_m, last_serviced_at, enabled")
        .eq("vehicle_id", vehicle.id),
      // 스티커는 조회 번호(앞 8자리)만 화면으로 넘겨요
      supabase.from("stickers").select("code, claimed_at").eq("vehicle_id", vehicle.id).order("claimed_at", { ascending: true }),
      supabase.from("theft_alerts").select("id").eq("vehicle_id", vehicle.id).eq("status", "open").maybeSingle(),
    ]);
  if (partsErr) console.error(partsErr);
  if (stickerErr) console.error(stickerErr);
  const now = Date.now();
  const care = partsNeedingCare((parts ?? []) as VehiclePart[], now);
  const urgentCare = care.some((c) => partStatus(c.ratio) === "replace");
  const stickers: LinkedSticker[] = ((stickerRows ?? []) as { code: string; claimed_at: string | null }[]).map((s) => ({
    code8: s.code.slice(0, 8),
    claimedAt: s.claimed_at,
  }));
  const status = displayStatus(vehicle.status, count ?? 0);

  const summary = [typeLabel(vehicle.type), [vehicle.brand, vehicle.model].filter(Boolean).join(" "), vehicle.color].filter(Boolean).join(" · ");
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

      {/* 소유권 받기·스티커 연결 뒤 바로 이 화면으로 와요. 다음 할 일이 첫 화면에 보이도록 맨 위에 */}
      {received && (
        <div className="flex items-start gap-3 rounded-2xl bg-emerald-50 p-4 text-emerald-800 ring-1 ring-emerald-200">
          <Tag aria-hidden className="mt-0.5 h-5 w-5 flex-none" />
          <p className="text-[15px] leading-relaxed">
            <b>소유권을 받았어요!</b> 이전 주인이 알던 스티커 위치는 지웠어요. 스티커를 새 곳에 숨기고 아래 &lsquo;QR · 스티커&rsquo; 칸의 &lsquo;위치 적기&rsquo;로 적어 두세요.
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

      {/* 머리: 작은 사진 + 이름·상태. 자세한 정보는 접어 둬요 */}
      <Card className="p-4">
        <div className="flex items-center gap-4">
          <VehicleImage src={vehicleImageUrl(vehicle.image_path)} type={vehicle.type} alt={vehicle.name} className="h-20 w-20 flex-none rounded-2xl" />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h1 className="min-w-0 break-words text-xl font-extrabold tracking-tight">{vehicle.name}</h1>
              <StatusBadge status={status} />
            </div>
            {summary && <p className="mt-1 truncate text-[14px] text-ink-muted">{summary}</p>}
          </div>
        </div>
        <details className="group mt-3 border-t border-line/70 pt-3">
          <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold text-ink-soft marker:hidden">
            자세한 정보·특징
            <ChevronDown aria-hidden className="h-4 w-4 transition-transform group-open:rotate-180" />
          </summary>
          <dl className="mt-3 grid grid-cols-[5rem_1fr] gap-x-3 gap-y-2 text-[15px]">
            {rows.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-ink-muted">{k}</dt>
                <dd className="font-medium">{v || "—"}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-3 rounded-xl bg-slate-50 p-3">
            <p className="text-[13px] font-semibold text-ink-muted">특징</p>
            <p className="mt-1 whitespace-pre-line text-[15px] leading-relaxed">{vehicle.description || "등록된 특징이 없어요."}</p>
          </div>
        </details>
      </Card>

      {openAlert && (
        <ButtonLink href={`/alerts/${openAlert.id}`} variant="danger" full size="lg" icon={<Siren aria-hidden className="h-5 w-5" />}>
          진행 중인 도난 경보 보기
        </ButtonLink>
      )}

      <StatusActions vehicleId={vehicle.id} status={vehicle.status} foundReports={count ?? 0} totalReports={total ?? 0} />

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

      <StickerCard vehicleId={vehicle.id} stickers={stickers} stickerSpot={vehicle.sticker_spot} />

      <Card className="flex items-center gap-3 p-4">
        <span
          aria-hidden
          className={cn(
            "grid h-11 w-11 flex-none place-items-center rounded-xl",
            urgentCare ? "bg-rose-50 text-rose-600" : care.length ? "bg-amber-50 text-amber-600" : "bg-brand-50 text-brand-600",
          )}
        >
          {care.length ? <BellRing className="h-5 w-5" /> : <Wrench className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-bold">소모품·정비</p>
          <p className="text-[13px] text-ink-muted">누적 주행 {formatDistance(vehicle.odometer_m ?? 0)}</p>
          <p className={cn("text-[13px]", care.length ? (urgentCare ? "font-semibold text-rose-700" : "font-semibold text-amber-800") : "text-ink-muted")}>
            {care.length
              ? `정비 알림 ${care.length}건 · ${care
                  .slice(0, 2)
                  .map((c) => PART_META[c.part.kind].label)
                  .join("·")}${care.length > 2 ? " 외" : ""}`
              : "모두 양호"}
          </p>
        </div>
        <ButtonLink href={`/vehicles/${vehicle.id}/maintenance`} variant="secondary" className="flex-none">
          보기
        </ButtonLink>
      </Card>

      <TradeCard vehicleId={vehicle.id} serialLast4={vehicle.serial_last4 ?? null} searching={vehicle.status === "searching"} />

      <Card className="flex items-center gap-3 p-4">
        <span aria-hidden className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-emerald-50 text-emerald-600">
          <FileBadge className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-bold">소유 증명</p>
          <p className="text-[13px] text-ink-muted">차대번호·영수증·사진을 모아 경찰·보험 제출용 증명서로</p>
        </div>
        <ButtonLink href={`/vehicles/${vehicle.id}/evidence`} variant="secondary" className="flex-none">
          열기
        </ButtonLink>
      </Card>

      <ButtonLink href={`/vehicles/${vehicle.id}/edit`} variant="secondary" full size="lg" icon={<Pencil aria-hidden className="h-5 w-5" />}>
        정보 수정
      </ButtonLink>
    </div>
  );
}
