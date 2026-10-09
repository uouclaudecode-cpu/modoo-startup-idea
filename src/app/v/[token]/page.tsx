import type { Metadata } from "next";
import { CircleCheck, CircleAlert, Clock, Hash, ShieldAlert, ShieldCheck, Tag, TriangleAlert, UserRound, Wrench } from "lucide-react";
import { Card } from "@/components/ui";
import { VehicleImage } from "@/components/vehicle/VehicleImage";
import { formatDate, formatDateTime } from "@/lib/format";
import { vehicleImageUrl } from "@/lib/images";
import { formatDistance } from "@/lib/ride/geo";
import { createClient } from "@/lib/supabase/server";
import { durationLabel, INVALID_REASON, monthLabel, WARNING_TEXT, type TradeVerification } from "@/lib/trade";
import { typeLabel } from "@/lib/types";
import { PART_META, PART_STATUS_META, partStatus, wearRatio, type PartKind } from "@/lib/parts";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "안심거래 인증",
  description: "B-LOCK 등록 주인·도난 이력 확인 화면",
  robots: { index: false, follow: false },
};

const TOKEN = /^[A-Za-z0-9_-]{16,40}$/;

export default async function VerifyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let data: TradeVerification = { valid: false, reason: "not_found" };
  if (TOKEN.test(token)) {
    const supabase = await createClient();
    const { data: res, error } = await supabase.rpc("get_trade_verification", { p_token: token });
    if (error) {
      console.error(error);
      return (
        <Card className="mx-auto max-w-md text-center text-[15px] text-ink-soft">인증 정보를 불러오지 못했어요. 잠시 후 새로고침해 주세요.</Card>
      );
    }
    data = res as TradeVerification;
  }

  if (!data.valid) {
    const danger = data.reason === "flagged";
    return (
      <div className="mx-auto max-w-md">
        <Card className={`flex flex-col items-center gap-3 py-10 text-center ${danger ? "ring-rose-300" : ""}`}>
          {danger ? <ShieldAlert aria-hidden className="h-12 w-12 text-rose-600" /> : <CircleAlert aria-hidden className="h-12 w-12 text-ink-muted" />}
          <p className={`text-xl font-extrabold ${danger ? "text-rose-700" : ""}`}>{danger ? "거래 주의" : "확인할 수 없는 링크"}</p>
          <p className="text-[15px] leading-relaxed text-ink-soft">{INVALID_REASON[data.reason]}</p>
        </Card>
      </div>
    );
  }

  const v = data.vehicle;
  const title = [v.brand, v.model].filter(Boolean).join(" ") || typeLabel(v.type);
  const theftClear = data.searching_count === 0;
  const now = new Date(data.checked_at).getTime();

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="flex items-center gap-3 rounded-2xl bg-emerald-600 p-4 text-white shadow-lift">
        <ShieldCheck aria-hidden className="h-8 w-8 flex-none" />
        <div>
          <p className="text-lg font-extrabold">B-LOCK 등록 주인 확인</p>
          <p className="text-[13px] text-emerald-50">판매자가 이 이동수단의 지금 주인이에요.</p>
        </div>
      </div>

      <Card className="overflow-hidden p-0">
        <VehicleImage src={vehicleImageUrl(v.image_path)} type={v.type} alt={title} className="aspect-[4/3]" />
        <div className="space-y-1 p-5">
          <p className="text-[13px] font-semibold text-ink-muted">{typeLabel(v.type)}</p>
          <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
          {v.color && <p className="text-[15px] text-ink-soft">색상 {v.color}</p>}
        </div>
      </Card>

      <Card className="divide-y divide-line/70 p-0">
        <Row
          icon={theftClear ? <CircleCheck className="h-5 w-5 text-emerald-600" /> : <TriangleAlert className="h-5 w-5 text-orange-600" />}
          label="도난·분실 이력"
          value={
            theftClear
              ? "신고 이력 없음"
              : `수색 ${data.searching_count}회 · 회수 완료${data.last_recovered_at ? ` (${formatDate(data.last_recovered_at)})` : ""}`
          }
          strong={theftClear}
        />
        <Row icon={<Clock className="h-5 w-5 text-brand-600" />} label="B-LOCK 등록" value={monthLabel(data.registered_at)} />
        <Row icon={<UserRound className="h-5 w-5 text-brand-600" />} label="현재 주인 보유 기간" value={durationLabel(data.owned_since)} />
        <Row icon={<UserRound className="h-5 w-5 text-brand-600" />} label="주인이 바뀐 횟수" value={`${data.transfer_count}회`} />
        <Row icon={<Hash className="h-5 w-5 text-brand-600" />} label="차대번호" value={data.serial_last4 ? `등록됨 (••••${data.serial_last4})` : "미등록"} />
        <Row icon={<Tag className="h-5 w-5 text-brand-600" />} label="B-LOCK QR 스티커" value={data.sticker_attached ? "부착됨" : "없음"} />
        <Row
          icon={<Wrench className="h-5 w-5 text-brand-600" />}
          label="정비 기록"
          value={`${data.maintenance_count}건${data.odometer_m > 0 ? ` · 기록된 주행 ${formatDistance(data.odometer_m)}` : ""}`}
        />
        <Row
          icon={<UserRound className="h-5 w-5 text-brand-600" />}
          label="판매자"
          value={`${data.seller.masked_nickname}${data.seller.member_since ? ` · ${monthLabel(data.seller.member_since)} 가입` : ""}`}
        />
      </Card>

      {((data.maintenance_recent?.length ?? 0) > 0 || (data.parts?.length ?? 0) > 0) && (
        <Card className="space-y-3">
          <p className="flex items-center gap-2 font-bold">
            <Wrench aria-hidden className="h-5 w-5 text-brand-600" />
            정비 이력
          </p>
          {(data.parts?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {data.parts!.map((p) => {
                const meta = PART_META[p.kind as PartKind];
                if (!meta) return null;
                const st = partStatus(wearRatio(p, now));
                return (
                  <span key={p.kind} className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ring-1 ring-inset ${PART_STATUS_META[st].badge}`}>
                    {meta.emoji} {meta.label} · {PART_STATUS_META[st].label}
                  </span>
                );
              })}
            </div>
          )}
          {(data.maintenance_recent?.length ?? 0) > 0 && (
            <ul className="divide-y divide-line/70 text-[14px]">
              {data.maintenance_recent!.map((l, i) => (
                <li key={i} className="flex items-center gap-2 py-2">
                  <span aria-hidden>{PART_META[l.kind as PartKind]?.emoji ?? "🔧"}</span>
                  <span className="font-semibold">{PART_META[l.kind as PartKind]?.label ?? l.kind}</span>
                  {l.shop && <span className="truncate text-ink-muted">· {l.shop}</span>}
                  <span className="ml-auto flex-none tabular-nums text-ink-muted">
                    {monthLabel(l.serviced_on)}
                    {l.distance_m > 0 ? ` · ${formatDistance(l.distance_m)}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[12px] leading-relaxed text-ink-muted">사면 정비 기록과 소모품 상태가 그대로 넘어와요. 비용·메모는 보여 주지 않아요.</p>
        </Card>
      )}

      {data.warnings.length > 0 && (
        <Card className="space-y-2 bg-orange-50 ring-orange-200">
          <p className="flex items-center gap-2 font-bold text-orange-800">
            <TriangleAlert aria-hidden className="h-5 w-5" />
            확인해 보세요
          </p>
          <ul className="list-disc space-y-1 pl-5 text-[14px] leading-relaxed text-orange-900">
            {data.warnings.map((w) => (
              <li key={w}>{WARNING_TEXT[w]}</li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="space-y-2 text-center">
        <p className="text-[13px] font-semibold text-ink-muted">확인 코드</p>
        <p className="text-3xl font-extrabold tracking-[0.25em] text-brand-700">{data.check_code}</p>
        <p className="text-[13px] leading-relaxed text-ink-muted">
          판매자 앱에 보이는 코드와 같은지 확인하세요. 조회 {formatDateTime(data.checked_at)} · {formatDateTime(data.expires_at)}까지 유효
        </p>
      </Card>

      <div className="space-y-2 rounded-2xl bg-slate-100 p-4 text-[13px] leading-relaxed text-ink-soft">
        <p>
          <b>주소가 b-lock-app.vercel.app인지 꼭 확인하세요.</b> 캡처 이미지는 믿지 말고 링크를 직접 열어 보세요.
        </p>
        <p>
          이 화면은 B-LOCK에 등록된 정보를 보여 줄 뿐, 법적 소유권을 증명하지는 않아요. 직거래 때는 실물의 차대번호와 숨은 스티커를 확인하고, 앱의
          &lsquo;소유권 넘기기&rsquo;로 소유권을 바로 넘겨받으세요.
        </p>
      </div>
    </div>
  );
}

function Row({ icon, label, value, strong }: { icon: React.ReactNode; label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center gap-3 px-5 py-3.5">
      <span aria-hidden className="flex-none">
        {icon}
      </span>
      <span className="flex-1 text-[14px] text-ink-muted">{label}</span>
      <span className={`text-right text-[15px] ${strong ? "font-bold text-emerald-700" : "font-semibold text-ink"}`}>{value}</span>
    </div>
  );
}
