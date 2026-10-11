"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRightLeft, Camera, CircleHelp, Search, ShieldAlert, ShieldCheck, Siren } from "lucide-react";
import { Scanner } from "@/app/scan/Scanner";
import { Button, ButtonLink, Card, Input } from "@/components/ui";
import { VehicleImage } from "@/components/vehicle/VehicleImage";
import { friendlyError } from "@/lib/format";
import { vehicleImageUrl } from "@/lib/images";
import { createClient } from "@/lib/supabase/client";
import { monthLabel } from "@/lib/trade";
import { typeLabel, type VehicleType } from "@/lib/types";

type Result = {
  result: "stolen" | "registered" | "none";
  method: "qr" | "code" | "serial";
  vehicle: {
    type: VehicleType;
    brand: string | null;
    model: string | null;
    color: string | null;
    image_path: string | null;
    registered_at: string;
    serial_registered: boolean;
    transfer_count: number;
  } | null;
  alert_id: string | null;
  report_token: string | null;
};

export function CheckForm({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  const [scan, setScan] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [res, setRes] = useState<Result | null>(null);

  async function check(input: string) {
    const v = input.trim();
    if (!v) return setError("QR 주소·조회 번호·차대번호 중 하나를 넣어 주세요.");
    setError("");
    setLoading(true);
    setRes(null);
    const { data, error: err } = await createClient().rpc("check_vehicle", { p_input: v });
    setLoading(false);
    if (err) {
      console.error(err);
      return setError(friendlyError(err, "조회하지 못했어요. 잠시 후 다시 시도해 주세요."));
    }
    setRes(data as Result);
  }

  useEffect(() => {
    if (initial) check(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 주소로 넘어온 값은 처음 한 번만 조회
  }, []);

  const v = res?.vehicle;
  const title = v ? [v.color, v.brand, v.model].filter(Boolean).join(" ") || typeLabel(v.type) : "";

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            check(value);
          }}
          className="space-y-3"
        >
          <Input
            label="QR 아래 조회 번호 · 차대번호(프레임 번호) · QR 주소"
            placeholder="예) AB3X KP9Q  또는  WTU123A4567B"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          <div className="grid grid-cols-2 gap-2">
            <Button type="submit" loading={loading} loadingText="조회 중..." icon={<Search aria-hidden className="h-4 w-4" />}>
              조회하기
            </Button>
            <Button variant="secondary" icon={<Camera aria-hidden className="h-4 w-4" />} onClick={() => setScan((s) => !s)}>
              {scan ? "카메라 닫기" : "QR 찍기"}
            </Button>
          </div>
        </form>
        {scan && (
          <Scanner
            hideManual
            onToken={(t) => {
              setScan(false);
              setValue(t);
              check(t);
            }}
          />
        )}
        {error && (
          <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
            {error}
          </p>
        )}
      </Card>

      {res?.result === "stolen" && v && (
        <Card className="space-y-3 ring-2 ring-rose-300">
          <div className="flex items-center gap-3 rounded-xl bg-rose-600 p-4 text-white">
            <ShieldAlert aria-hidden className="h-8 w-8 flex-none" />
            <div>
              <p className="text-lg font-extrabold">도난·분실 신고된 이동수단이에요</p>
              <p className="text-[13px] text-rose-50">사지 마세요. 판매자에게 티 내지 말고 주인에게 알려 주세요.</p>
            </div>
          </div>
          <VehicleImage src={vehicleImageUrl(v.image_path)} type={v.type} alt={title} className="aspect-[4/3] rounded-xl" />
          <p className="text-lg font-bold">{title}</p>
          <p className="text-[14px] leading-relaxed text-ink-soft">주인에게 알림이 갔어요. 아래 버튼으로 위치를 몰래 전해 주세요.</p>
          {res.report_token && (
            <ButtonLink href={`/report/${encodeURIComponent(res.report_token)}`} variant="danger" full size="lg" icon={<Siren aria-hidden className="h-5 w-5" />}>
              주인에게 몰래 알리기
            </ButtonLink>
          )}
          {res.alert_id && (
            <ButtonLink href={`/alerts/${res.alert_id}`} variant="secondary" full>
              도난 경보 자세히 보기
            </ButtonLink>
          )}
          <p className="rounded-xl bg-slate-100 p-3 text-[13px] leading-relaxed text-ink-soft">
            혼자 붙잡으려 하지 마세요. 위험하면 112에 신고하세요.
          </p>
        </Card>
      )}

      {res?.result === "registered" && v && (
        <Card className="space-y-3">
          <div className="flex items-center gap-3 rounded-xl bg-emerald-600 p-4 text-white">
            <ShieldCheck aria-hidden className="h-8 w-8 flex-none" />
            <div>
              <p className="text-lg font-extrabold">도난 신고 없음</p>
              <p className="text-[13px] text-emerald-50">B-LOCK에 등록된 이동수단이고, 지금 도난 신고가 없어요.</p>
            </div>
          </div>
          <ul className="space-y-1.5 text-[15px]">
            <li>
              <span className="text-ink-muted">이동수단</span> · {title}
            </li>
            <li>
              <span className="text-ink-muted">B-LOCK 등록</span> · {monthLabel(v.registered_at)}
            </li>
            <li>
              <span className="text-ink-muted">차대번호</span> · {v.serial_registered ? "등록됨" : "미등록"}
            </li>
            <li>
              <span className="text-ink-muted">주인이 바뀐 횟수</span> · {v.transfer_count}회
            </li>
          </ul>
          <p className="flex items-start gap-2 rounded-xl bg-brand-50 p-3 text-[14px] leading-relaxed text-brand-900">
            <ArrowRightLeft aria-hidden className="mt-0.5 h-4 w-4 flex-none" />
            살 거라면 &lsquo;소유권 넘기기&rsquo;를 요청하세요. 진짜 주인만 할 수 있어요.
          </p>
          <ol className="list-decimal space-y-1 pl-5 text-[13px] leading-relaxed text-ink-soft">
            <li>B-LOCK에 가입·로그인해요.</li>
            <li>판매자 화면에 뜬 QR을 찍어요.</li>
            <li>숨은 스티커(또는 차대번호)를 확인하면 끝이에요.</li>
          </ol>
        </Card>
      )}

      {res?.result === "none" && (
        <Card className="space-y-3">
          <div className="flex items-center gap-3 rounded-xl bg-slate-600 p-4 text-white">
            <CircleHelp aria-hidden className="h-8 w-8 flex-none" />
            <div>
              <p className="text-lg font-extrabold">B-LOCK 등록 기록 없음</p>
              <p className="text-[13px] text-slate-100">도난이 아니라는 뜻은 아니에요.</p>
            </div>
          </div>
          <ul className="list-disc space-y-1 pl-5 text-[14px] leading-relaxed text-ink-soft">
            <li>번호를 정확히 넣었는지 확인해 주세요. (QR 아래 조회 번호는 8자리)</li>
            <li>너무 싸거나 차대번호를 안 보여 주면 의심하세요.</li>
            <li>차대번호가 갈려 있거나 스티커를 뗀 흔적이 있으면 사지 마세요.</li>
            <li>산 뒤에는 B-LOCK에 등록하고 차대번호를 적어 두세요.</li>
          </ul>
        </Card>
      )}

      <p className="text-center text-[12px] leading-relaxed text-ink-muted">
        조회한 사람의 정보는 저장하지 않아요. 도난 신고된 이동수단이면 주인에게 조회 사실만 알려요. 경찰 신고 여부는 알 수 없어요.{" "}
        <Link href="/privacy" className="underline underline-offset-2 hover:text-ink">
          개인정보처리방침
        </Link>
      </p>
    </div>
  );
}
