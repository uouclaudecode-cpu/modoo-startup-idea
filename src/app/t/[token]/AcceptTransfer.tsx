"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRightLeft, CircleCheck, Tag, TriangleAlert } from "lucide-react";
import { Scanner } from "@/app/scan/Scanner";
import { Button, Card, Input } from "@/components/ui";
import { VehicleImage } from "@/components/vehicle/VehicleImage";
import { friendlyError } from "@/lib/format";
import { vehicleImageUrl } from "@/lib/images";
import { extractToken } from "@/lib/qr";
import { createClient } from "@/lib/supabase/client";
import type { TransferPeek } from "@/lib/trade";
import { typeLabel } from "@/lib/types";

type Pending = Extract<TransferPeek, { status: "pending" }>;

export function AcceptTransfer({ token, peek }: { token: string; peek: Pending }) {
  const router = useRouter();
  const v = peek.vehicle;
  const [code, setCode] = useState("");
  const [scanned, setScanned] = useState(false);
  const [last4, setLast4] = useState("");
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const mode = peek.requires_sticker ? "sticker" : peek.has_serial ? "serial" : "none";
  const check = mode === "sticker" ? (extractToken(code) ?? code.trim()) : mode === "serial" ? last4.trim() : "";
  const ready = mode === "sticker" ? Boolean(check) : mode === "serial" ? check.replace(/[^A-Za-z0-9]/g, "").length >= 5 : agree;

  async function accept() {
    setError("");
    setLoading(true);
    const { data, error: err } = await createClient().rpc("accept_transfer", { p_token: token, p_check: check });
    setLoading(false);
    if (err) {
      console.error(err);
      return setError(friendlyError(err, "받지 못했어요. 잠시 후 다시 시도해 주세요."));
    }
    const vehicleId = (data as { vehicle_id: string }).vehicle_id;
    router.replace(`/vehicles/${vehicleId}?received=1`);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden p-0">
        <VehicleImage src={vehicleImageUrl(v.image_path)} type={v.type} alt={v.name} className="aspect-[4/3]" />
        <div className="space-y-1 p-5">
          <p className="text-[13px] font-semibold text-ink-muted">{typeLabel(v.type)}</p>
          <p className="text-xl font-extrabold">{[v.brand, v.model].filter(Boolean).join(" ") || v.name}</p>
          <p className="text-[15px] text-ink-soft">
            {v.color ? `색상 ${v.color}` : ""}
          </p>
        </div>
      </Card>

      <Card className="space-y-3">
        <p className="flex items-center gap-2 font-bold">
          <Tag aria-hidden className="h-4 w-4 text-brand-600" />
          실물 확인
        </p>
        {mode === "sticker" && (
          <>
            <p className="text-[14px] leading-relaxed text-ink-soft">
              판매자에게 숨은 스티커 위치를 물어보고, 자전거에 붙은 그 스티커를 찍어 주세요. 같은 기기인지 확인해요.
            </p>
            {scanned ? (
              <p className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-[14px] font-semibold text-emerald-800">
                <CircleCheck aria-hidden className="h-5 w-5" />
                스티커를 읽었어요.
                <button type="button" className="ml-auto text-[13px] underline" onClick={() => { setScanned(false); setCode(""); }}>
                  다시 찍기
                </button>
              </p>
            ) : (
              <Scanner
                hideManual
                onToken={(t) => {
                  setCode(t);
                  setScanned(true);
                }}
              />
            )}
            {!scanned && (
              <Input label="또는 스티커 아래 주소·코드 입력" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" placeholder="https://…/scan/…" />
            )}
          </>
        )}
        {mode === "serial" && (
          <>
            <p className="text-[14px] leading-relaxed text-ink-soft">이 기기에는 스티커가 없어요. 프레임에 새겨진 차대번호(프레임·시리얼 번호) 전체를 직접 보고 적어 주세요. 자전거는 페달 사이 프레임 아랫면, 킥보드는 발판 아래·핸들 기둥에 새겨진 영문·숫자예요. (판매자가 불러 주는 번호 말고 실물을 확인하세요)</p>
            <Input label="차대번호 (프레임·시리얼 번호 전체)" value={last4} maxLength={40} onChange={(e) => setLast4(e.target.value.toUpperCase())} autoComplete="off" autoCapitalize="characters" />
          </>
        )}
        {mode === "none" && (
          <>
            <p className="flex items-start gap-2 rounded-xl bg-orange-50 p-3 text-[14px] leading-relaxed text-orange-900">
              <TriangleAlert aria-hidden className="mt-0.5 h-4 w-4 flex-none" />
              이 기기에는 스티커도 차대번호도 등록돼 있지 않아 앱으로 실물을 대조할 수 없어요. 사진과 실물이 같은지 꼼꼼히 확인해 주세요.
            </p>
            <label className="flex items-center gap-2 text-[15px]">
              <input type="checkbox" className="h-5 w-5 accent-brand-600" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
              사진과 실물이 같은 것을 확인했어요
            </label>
          </>
        )}
      </Card>

      <div className="rounded-2xl bg-slate-100 p-4 text-[13px] leading-relaxed text-ink-soft">
        받으면 정비 기록과 스티커가 내 계정으로 넘어오고, 이전 주인은 이 기기를 더 이상 볼 수 없어요. 받은 뒤 스티커를 새 곳에 숨기고 위치를 적어 두세요.
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
          {error}
        </p>
      )}
      <Button full size="lg" disabled={!ready} loading={loading} loadingText="받는 중..." icon={<ArrowRightLeft aria-hidden className="h-5 w-5" />} onClick={accept}>
        소유권 받기
      </Button>
    </div>
  );
}
