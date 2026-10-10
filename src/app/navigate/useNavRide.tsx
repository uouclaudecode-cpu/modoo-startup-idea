"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Play } from "lucide-react";
import { Button, Modal, useToast } from "@/components/ui";
import { cn } from "@/lib/cn";
import { friendlyError } from "@/lib/format";
import { formatDistance, formatDuration, toPathJson } from "@/lib/ride/geo";
import { useRideTracker, type RideResult } from "@/lib/ride/useRideTracker";
import { createClient } from "@/lib/supabase/client";
import { typeEmoji } from "@/lib/types";
import type { RideVehicle } from "../ride/RideTracker";

/** 라이딩 화면과 같은 저장소: 지난번에 탄 이동수단 */
const LAST_VEHICLE_KEY = "b-lock:last-ride-vehicle";
/** 이보다 짧으면 저장할 의미가 없어서 버리기만 제안 (라이딩 화면과 같아요) */
const MIN_SAVE_METERS = 10;

export type NavRideCtx = { userId: string; vehicles: RideVehicle[] } | null;

/**
 * 길 안내 중 라이딩 기록 (라이딩 화면과 같은 기록 장치예요).
 * 중간에 다른 화면으로 가도 기록은 남아서, 라이딩 탭에서 이어서 타거나 저장할 수 있어요.
 */
export function useNavRide(ctx: NavRideCtx, { onKeepGoing }: { onKeepGoing: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const t = useRideTracker(ctx?.userId ?? "guest");
  const canRecord = Boolean(ctx && ctx.vehicles.length > 0);
  const [recordOn, setRecordOn] = useState(true);
  const [vehicleId, setVehicleId] = useState(ctx?.vehicles[0]?.id ?? "");
  const [result, setResult] = useState<RideResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // 끝내지 않은 라이딩(라이딩 탭에서 시작한 것 포함)에 이어서 기록할 수 있는지
  const resumeVehicle = t.status === "paused" && t.canResume ? ctx?.vehicles.find((v) => v.id === t.vehicleId) : undefined;

  useEffect(() => {
    try {
      const last = localStorage.getItem(LAST_VEHICLE_KEY);
      if (last && ctx?.vehicles.some((v) => v.id === last)) setVehicleId(last);
    } catch {
      /* 기억 못 해도 첫 번째 이동수단으로 */
    }
  }, [ctx]);

  /** 안내 시작할 때 */
  function begin() {
    if (!canRecord || !recordOn) return;
    if (resumeVehicle) return t.resume();
    if (t.status !== "idle" || !vehicleId) return;
    try {
      localStorage.setItem(LAST_VEHICLE_KEY, vehicleId);
    } catch {
      /* 기억 못 해도 괜찮아요 */
    }
    t.start(vehicleId);
  }

  /** 안내를 끝낼 때: 기록 중이었으면 저장 창 */
  function end() {
    if (t.status !== "riding") return;
    setError("");
    setResult(t.finish());
  }

  async function save() {
    if (!result) return;
    setSaving(true);
    setError("");
    const supabase = createClient();
    const { data, error: err } = await supabase.rpc("complete_ride", {
      p_vehicle: result.vehicleId,
      p_started_at: result.startedAt.toISOString(),
      p_ended_at: result.endedAt.toISOString(),
      p_moving_sec: result.movingSec,
      p_elapsed_sec: result.elapsedSec,
      p_distance_m: Math.round(result.distance * 10) / 10,
      p_max_speed_kmh: Math.round(result.maxSpeed * 10) / 10,
      p_path: toPathJson(result.path),
    });
    if (err) {
      setSaving(false);
      console.error(err);
      // 기록은 브라우저에 남아 있어서 다시 저장하거나 라이딩 탭에서 저장할 수 있어요
      return setError(friendlyError(err, "저장하지 못했어요. 인터넷 연결을 확인하고 다시 눌러 주세요."));
    }
    // 마지막 위치를 주차 위치로 (실패해도 라이딩 저장은 끝났어요)
    const last = result.path[result.path.length - 1];
    if (last) {
      const { error: pErr } = await supabase.rpc("save_parking", { p_vehicle: result.vehicleId, p_lat: last.lat, p_lng: last.lng, p_accuracy: t.accuracy, p_note: null });
      if (pErr) console.error(pErr);
    }
    t.clear();
    setResult(null);
    setSaving(false);
    toast.success("라이딩을 저장했어요! 소모품 거리에도 더했어요.");
    router.push(`/rides/${data}?done=1`);
  }

  function discard() {
    t.clear();
    setResult(null);
    toast.success("기록을 지웠어요.");
  }

  function keepGoing() {
    setResult(null);
    t.resume();
    onKeepGoing();
  }

  /** 준비 화면: 기록도 함께 할지 + 이동수단 고르기 */
  const options = !ctx ? (
    <p className="text-[13px] text-ink-muted">
      <Link href="/login?next=/navigate" className="font-semibold text-brand-700 hover:underline">
        로그인
      </Link>
      하면 길 안내를 받으면서 라이딩 기록도 함께 남길 수 있어요.
    </p>
  ) : !canRecord ? null : (
    <div className="space-y-2 rounded-xl bg-slate-50 p-3">
      <label className="flex min-h-10 items-center gap-2.5 text-[15px] font-semibold">
        <input type="checkbox" checked={recordOn} onChange={(e) => setRecordOn(e.target.checked)} className="h-5 w-5 rounded accent-brand-600" />
        {resumeVehicle ? "끝내지 않은 라이딩에 이어서 기록하기" : "라이딩 기록도 함께 하기"}
      </label>
      {recordOn && !resumeVehicle && t.status === "idle" && ctx.vehicles.length > 1 && (
        <div role="radiogroup" aria-label="탈 이동수단" className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5">
          {ctx.vehicles.map((v) => (
            <button
              key={v.id}
              type="button"
              role="radio"
              aria-checked={vehicleId === v.id}
              onClick={() => setVehicleId(v.id)}
              className={cn(
                "flex h-10 flex-none items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold ring-1 ring-inset",
                vehicleId === v.id ? "bg-brand-600 text-white ring-brand-600" : "bg-white text-ink-soft ring-line",
              )}
            >
              <span aria-hidden>{typeEmoji(v.type)}</span>
              {v.name}
            </button>
          ))}
        </div>
      )}
      {recordOn && resumeVehicle && (
        <p className="text-[13px] text-ink-muted">
          {typeEmoji(resumeVehicle.type)} {resumeVehicle.name} · 지금까지 {formatDistance(t.distance)}
        </p>
      )}
      <p className="text-[12px] text-ink-muted">도착해서 저장하면 내 기록에 남고, 탄 거리가 소모품 수명에 더해져요.</p>
    </div>
  );

  /** 안내 중 아래 막대에 붙는 '기록 중' 표시 */
  const badge =
    t.status === "riding" ? (
      <p className="mt-0.5 flex items-center gap-1.5 text-[13px] font-semibold text-rose-600">
        <span className="h-2 w-2 animate-pulse rounded-full bg-rose-600" aria-hidden />
        기록 중 · {formatDistance(t.distance)} · {formatDuration(t.elapsedSec)}
      </p>
    ) : null;

  const modal = (
    <Modal
      open={Boolean(result)}
      onClose={() => !saving && keepGoing()}
      title="라이딩을 저장할까요?"
      footer={
        <div className="grid gap-2">
          {result && result.distance >= MIN_SAVE_METERS ? (
            <Button full loading={saving} loadingText="저장 중..." onClick={save}>
              저장하기
            </Button>
          ) : (
            <p className="text-center text-[13px] text-ink-muted">10m보다 짧게 달려서 저장할 기록이 없어요.</p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={keepGoing} disabled={saving} icon={<Play aria-hidden className="h-4 w-4" />}>
              계속 타기
            </Button>
            <Button variant="ghost" onClick={discard} disabled={saving}>
              버리기
            </Button>
          </div>
        </div>
      }
    >
      {result && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              ["거리", formatDistance(result.distance)],
              ["시간", formatDuration(result.elapsedSec)],
              ["최고 속도", `${result.maxSpeed.toFixed(1)} km/h`],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-slate-50 p-3">
                <p className="text-[12px] text-ink-muted">{k}</p>
                <p className="text-[17px] font-extrabold tabular-nums">{v}</p>
              </div>
            ))}
          </div>
          <p className="text-[13px] leading-relaxed text-ink-muted">저장하면 내 기록에 남고, 탄 거리가 소모품 수명에 더해져요. 마지막 위치는 주차 위치로 저장돼요.</p>
          {error && <p className="text-[13px] text-rose-600">{error}</p>}
        </div>
      )}
    </Modal>
  );

  return { begin, end, options, badge, modal };
}
