import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, CalendarClock, ChevronLeft, Gift, MapPin, Siren } from "lucide-react";
import { ButtonLink, Card } from "@/components/ui";
import { ShareButton } from "@/components/ui/ShareButton";
import { PinMap, type MapPin as PinMapPin } from "@/components/map/PinMap";
import { VehicleImage } from "@/components/vehicle/VehicleImage";
import { ALERT_STATUS, vehicleTitle, wonLabel, type AlertCard, type Reward, type Sighting, type Trust } from "@/lib/alerts";
import { formatDateTime, timeAgo } from "@/lib/format";
import { vehicleImageUrl } from "@/lib/images";
import { createClient } from "@/lib/supabase/server";
import { OwnerPanel } from "./OwnerPanel";
import { ReporterPanel } from "./ReporterPanel";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  if (!UUID.test(id)) return { title: "도난 경보" };
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_alert", { p_alert: id });
  const a = data as AlertCard | null;
  if (!a) return { title: "도난 경보" };
  const title = `🚨 ${vehicleTitle(a.vehicle)} 도난 경보`;
  return { title, description: `${a.place_label ?? "근처"}에서 잃어버렸어요. 비슷한 걸 보면 알려 주세요.`, openGraph: { title } };
}

export default async function AlertPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  // resolve=1: 이동수단 화면 '찾았어요'·분실 글 '찾았어요'에서 왔어요 (회수 확인 창을 바로 열어요)
  searchParams: Promise<{ sent?: string; resolve?: string }>;
}) {
  const { id } = await params;
  const { sent, resolve } = await searchParams;
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const [{ data, error }, { data: auth }] = await Promise.all([supabase.rpc("get_alert", { p_alert: id }), supabase.auth.getUser()]);
  if (error) {
    console.error(error);
    return <Card className="mx-auto max-w-xl text-center">경보를 불러오지 못했어요. 잠시 후 새로고침해 주세요.</Card>;
  }
  const a = data as AlertCard | null;
  if (!a) notFound();
  const user = auth.user;
  const open = a.status === "open";

  // 주인: 들어온 제보 전체 / 제보자: 내 제보만 (RLS)
  let sightings: Sighting[] = [];
  let rewards: Reward[] = [];
  let trust: Trust[] = [];
  let photos: Record<string, string> = {};
  if (user) {
    const rewardCols = "id, alert_id, sighting_id, amount, status, paid_at, confirmed_at";
    if (a.is_owner) {
      // 주인에게는 제보자 아이디를 주지 않아요 (신뢰 정보는 제보 번호에 붙여서)
      const [{ data: s }, { data: r }] = await Promise.all([
        supabase.rpc("owner_alert_sightings", { p_alert: a.id }),
        supabase.from("alert_rewards").select(rewardCols).eq("alert_id", a.id),
      ]);
      const rows = (s ?? []) as (Omit<Sighting, "reporter_id" | "alert_id"> & Omit<Trust, "user_id" | "unpaid_count">)[];
      sightings = rows.map((x) => ({ ...x, alert_id: a.id, reporter_id: x.id }));
      trust = rows.map((x) => ({ user_id: x.id, member_since: x.member_since, helped_count: x.helped_count, false_count: x.false_count, identity_verified: x.identity_verified, unpaid_count: 0 }));
      rewards = ((r ?? []) as Omit<Reward, "reporter_id" | "owner_id">[]).map((x) => ({ ...x, reporter_id: "", owner_id: "" }));
    } else {
      const [{ data: s }, { data: r }] = await Promise.all([
        supabase.from("sightings").select("*").eq("alert_id", a.id).order("created_at", { ascending: false }),
        supabase.from("alert_rewards").select(rewardCols).eq("alert_id", a.id),
      ]);
      sightings = (s ?? []) as Sighting[];
      rewards = ((r ?? []) as Omit<Reward, "reporter_id" | "owner_id">[]).map((x) => ({ ...x, reporter_id: "", owner_id: "" }));
    }
    const paths = sightings.map((x) => x.photo_path).filter((p): p is string => Boolean(p));
    if (paths.length) {
      const { data: signed } = await supabase.storage.from("sighting-images").createSignedUrls(paths, 3600);
      photos = Object.fromEntries((signed ?? []).filter((x) => x.signedUrl && x.path).map((x) => [x.path as string, x.signedUrl]));
    }
  }

  const pins: PinMapPin[] = [
    { lat: a.lat, lng: a.lng, mark: "분실", label: a.place_label ?? "잃어버린 곳", color: "rose" },
    ...sightings
      .filter((s) => s.lat != null && s.lng != null)
      .map((s, i) => ({ lat: s.lat as number, lng: s.lng as number, mark: String(i + 1), label: `목격 ${formatDateTime(s.seen_at)}`, color: "orange" as const })),
  ];

  return (
    <div className="mx-auto max-w-xl space-y-4">
      {/* 공유 링크로 처음 온 사람도 다른 경보·내 경보로 갈 수 있게 */}
      <Link href={a.is_owner ? "/alerts#mine" : "/alerts"} className="inline-flex items-center gap-1 text-sm font-semibold text-ink-muted hover:text-ink">
        <ChevronLeft aria-hidden className="h-4 w-4" />
        {a.is_owner ? "내 경보·제보" : "근처 도난 경보"}
      </Link>

      {sent && a.is_owner && (
        <div className="flex items-start gap-3 rounded-2xl bg-emerald-50 p-4 text-emerald-800 ring-1 ring-emerald-200">
          <BadgeCheck aria-hidden className="mt-0.5 h-5 w-5 flex-none" />
          <p className="text-[15px] leading-relaxed">
            <b>경보를 보냈어요.</b> 근처 {a.recipients ?? 0}명에게 알림이 갔어요. 제보가 오면 알림으로 알려 드릴게요. 직접 찾아가지 말고, 위험하면 112에 신고하세요.
          </p>
        </div>
      )}

      <Card className="overflow-hidden p-0">
        <div className={`flex items-center gap-2 px-5 py-3 text-white ${open ? "bg-rose-600" : "bg-slate-600"}`}>
          <Siren aria-hidden className="h-5 w-5" />
          <p className="font-bold">{open ? "도난 경보 · 수색 중" : `도난 경보 · ${ALERT_STATUS[a.status]}`}</p>
          {a.police_reported && <span className="ml-auto rounded-full bg-white/20 px-2.5 py-0.5 text-[12px] font-semibold">경찰 신고 완료</span>}
        </div>
        <VehicleImage src={vehicleImageUrl(a.vehicle.image_path)} type={a.vehicle.type} alt={vehicleTitle(a.vehicle)} className="aspect-[4/3]" />
        <div className="space-y-3 p-5">
          <h1 className="text-2xl font-extrabold tracking-tight">{vehicleTitle(a.vehicle)}</h1>
          <div className="space-y-1.5 text-[15px] text-ink-soft">
            <p className="flex items-center gap-2">
              <CalendarClock aria-hidden className="h-4 w-4 flex-none text-ink-muted" />
              {formatDateTime(a.lost_at)} ({timeAgo(a.lost_at)})
            </p>
            {a.place_label && (
              <p className="flex items-center gap-2">
                <MapPin aria-hidden className="h-4 w-4 flex-none text-ink-muted" />
                {a.place_label} 근처
              </p>
            )}
            {a.bounty_amount && (
              <p className="flex items-center gap-2 font-semibold text-brand-700">
                <Gift aria-hidden className="h-4 w-4 flex-none" />
                찾아 주면 사례금 {wonLabel(a.bounty_amount)} (주인이 직접 지급하는 약속)
              </p>
            )}
            {a.bounty_amount && (a.owner_unpaid ?? 0) > 0 && (
              <p className="rounded-lg bg-orange-50 px-2.5 py-1.5 text-[13px] font-semibold text-orange-800">이 주인은 사례금 미지급 기록이 {a.owner_unpaid}건 있어요.</p>
            )}
          </div>
          {(a.marks || a.vehicle.description) && (
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-[13px] font-semibold text-ink-muted">눈에 띄는 특징</p>
              <p className="mt-1 whitespace-pre-line text-[15px] leading-relaxed">{[a.marks, a.vehicle.description].filter(Boolean).join("\n")}</p>
            </div>
          )}
        </div>
      </Card>

      {open && (
        <ShareButton
          title={`🚨 ${vehicleTitle(a.vehicle)} 도난 경보`}
          text={`${a.place_label ?? "근처"}에서 ${vehicleTitle(a.vehicle)}을(를) 도둑맞았어요. 비슷한 걸 보면 알려 주세요!`}
          path={`/alerts/${a.id}`}
          label="카카오톡·단톡방에 공유해서 같이 찾기"
        />
      )}

      <PinMap pins={pins} className="h-64" />

      {a.is_owner ? (
        <OwnerPanel alert={a} sightings={sightings} rewards={rewards} trust={trust} photos={photos} autoResolve={resolve === "1"} />
      ) : user ? (
        <ReporterPanel alert={a} mySightings={sightings} myRewards={rewards} photos={photos} />
      ) : open ? (
        <Card className="space-y-3 text-center">
          <p className="text-[15px] leading-relaxed text-ink-soft">비슷한 걸 봤다면 로그인하고 제보해 주세요. 제보자 정보는 주인에게 보이지 않아요.</p>
          <ButtonLink href={`/login?next=${encodeURIComponent(`/alerts/${a.id}`)}`} full size="lg">
            로그인하고 제보하기
          </ButtonLink>
        </Card>
      ) : null}

      <p className="rounded-xl bg-slate-100 p-3 text-[13px] leading-relaxed text-ink-soft">
        직접 다가가거나 되찾으려 하지 마세요. 위험하면 112에 신고하세요. 경보 내용은 주인이 적은 것이며, B-LOCK은 실시간 위치 추적을 하지 않아요.
      </p>
    </div>
  );
}
