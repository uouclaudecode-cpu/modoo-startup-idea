import type { Metadata } from "next";
import { BadgeCheck, Lock, MapPinned, MessageCircle, MessagesSquare, Siren } from "lucide-react";
import { ButtonLink, Card, ErrorState, StatusBadge } from "@/components/ui";
import { VehicleImage } from "@/components/vehicle/VehicleImage";
import { vehicleImageUrl } from "@/lib/images";
import { createClient } from "@/lib/supabase/server";
import { typeEmoji, typeLabel, type PublicVehicle } from "@/lib/types";
import { NewSticker } from "./NewSticker";

export const metadata: Metadata = { title: "QR 확인", robots: { index: false } };

/** QR을 스캔한 사람이 보는 공개 화면 (로그인 필요 없음, 소유자 개인정보 없음) */
export default async function ScanResultPage({ params }: { params: Promise<{ qrId: string }> }) {
  const { qrId } = await params;
  const token = decodeURIComponent(qrId);

  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) {
    return <ErrorState title="⚠️ 등록되지 않은 QR입니다." description="QR이 훼손됐거나 잘못된 주소일 수 있어요." />;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_vehicle", { p_token: token });
  if (error) {
    console.error(error);
    return <ErrorState title="인터넷 연결을 확인해주세요." description="QR 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요." />;
  }
  const v = (data as PublicVehicle[] | null)?.[0];
  if (!v) {
    // 아직 아무 이동수단에도 등록하지 않은 새 스티커인지 확인
    const { data: stickerStatus, error: stickerErr } = await supabase.rpc("get_sticker_status", { p_code: token });
    if (stickerErr) console.error(stickerErr);
    if (stickerStatus === "unclaimed") return <NewSticker code={token} />;
    return <ErrorState title="⚠️ 등록되지 않은 QR입니다." description="QR이 훼손됐거나 잘못된 주소일 수 있어요." />;
  }
  if (!v.available) return <ErrorState title="⚠️ 현재 사용할 수 없는 QR입니다." description="소유자가 이 이동수단의 등록을 해제했어요." />;

  // 로그인한 주인이 자기 스티커·QR을 찍었는지 (주인 확인용). RLS 때문에 본인 것만 찾아져요.
  let ownVehicleId: string | null = null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const [{ data: ownByQr }, { data: ownBySticker }] = await Promise.all([
      supabase.from("vehicles").select("id").eq("qr_token", token).maybeSingle(),
      supabase.from("stickers").select("vehicle_id").eq("code", token).maybeSingle(),
    ]);
    ownVehicleId = ownByQr?.id ?? ownBySticker?.vehicle_id ?? null;
  }
  const ownerBanner = ownVehicleId && (
    <div className="flex items-center gap-3 rounded-2xl bg-emerald-50 p-4 text-emerald-800 ring-1 ring-emerald-200">
      <BadgeCheck aria-hidden className="h-6 w-6 flex-none" />
      <p className="flex-1 text-[15px] leading-snug">
        <b>✅ 내 이동수단이에요</b>
        <span className="block text-[13px] text-emerald-700">이 QR은 내 계정에 등록돼 있어요.</span>
      </p>
      <ButtonLink href={`/vehicles/${ownVehicleId}`} variant="secondary" className="h-10 flex-none px-3 text-sm">
        관리
      </ButtonLink>
    </div>
  );

  const reportHref = `/report/${encodeURIComponent(token)}`;
  const facts: [string, string | null][] = [
    ["종류", typeLabel(v.type)],
    ["색상", v.color],
    ["브랜드·모델", [v.brand, v.model].filter(Boolean).join(" ") || null],
  ];

  const details = (
    <Card className="overflow-hidden p-0">
      <VehicleImage src={vehicleImageUrl(v.image_path)} type={v.type} alt={`${typeLabel(v.type)} 사진`} className="aspect-[4/3]" />
      <div className="space-y-4 p-5">
        <dl className="grid grid-cols-[6rem_1fr] gap-x-3 gap-y-2 text-[15px]">
          {facts.map(([k, val]) => (
            <div key={k} className="contents">
              <dt className="text-ink-muted">{k}</dt>
              <dd className="font-medium">{val || "—"}</dd>
            </div>
          ))}
        </dl>
        {v.description && (
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-[13px] font-semibold text-ink-muted">특징</p>
            <p className="mt-1 whitespace-pre-line text-[15px] leading-relaxed">{v.description}</p>
          </div>
        )}
      </div>
    </Card>
  );

  const privacy = (
    <p className="flex items-start gap-2 rounded-xl bg-slate-100 p-3 text-[13px] leading-relaxed text-ink-muted">
      <Lock aria-hidden className="mt-0.5 h-4 w-4 flex-none" />
      이 이동수단의 소유자 정보는 개인정보 보호를 위해 공개하지 않습니다. 제보는 소유자에게만 전달돼요.
    </p>
  );

  if (v.status === "searching") {
    // 소유자가 커뮤니티에 올린 분실 글이 있으면 이어 줍니다. (글 ID만 받아요)
    const { data: postId, error: postErr } = await supabase.rpc("get_vehicle_post", { p_token: token });
    if (postErr) console.error(postErr);
    return (
      <div className="mx-auto max-w-md space-y-4">
        {ownerBanner}
        <div role="alert" className="rounded-3xl bg-rose-600 p-6 text-white shadow-lift">
          <Siren aria-hidden className="h-9 w-9" />
          <h1 className="mt-3 text-2xl font-extrabold leading-snug">현재 분실·도난 수색 중이에요</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-rose-50">
            이 이동수단을 발견하셨다면 위치와 사진을 제보해 주세요. 소유자에게 바로 전달돼요.
          </p>
          <ButtonLink href={`${reportHref}?kind=found`} variant="light" size="lg" full className="mt-5" icon={<MapPinned aria-hidden className="h-5 w-5" />}>
            발견 제보하기
          </ButtonLink>
          {typeof postId === "string" && (
            <ButtonLink href={`/community/${postId}`} variant="glass" full className="mt-2" icon={<MessagesSquare aria-hidden className="h-5 w-5" />}>
              커뮤니티 분실 글 보기
            </ButtonLink>
          )}
        </div>
        {details}
        {privacy}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
        {ownerBanner}
      <Card className="space-y-3 text-center">
        <p className="text-4xl" aria-hidden>
          {typeEmoji(v.type)}
        </p>
        <h1 className="text-xl font-extrabold">등록된 이동수단입니다.</h1>
        <div className="flex justify-center">
          <StatusBadge status={v.status} />
        </div>
        {v.status === "recovered" && <p className="text-sm text-ink-muted">최근 소유자가 회수를 마친 이동수단이에요.</p>}
      </Card>
      {privacy}
      <div className="grid gap-2">
        <ButtonLink href={`${reportHref}?kind=contact`} size="lg" full icon={<MessageCircle aria-hidden className="h-5 w-5" />}>
          이 이동수단의 소유자에게 연락하기
        </ButtonLink>
        <ButtonLink href={`${reportHref}?kind=found`} size="lg" full variant="secondary" icon={<MapPinned aria-hidden className="h-5 w-5" />}>
          발견 제보하기
        </ButtonLink>
      </div>
      {details}
    </div>
  );
}
