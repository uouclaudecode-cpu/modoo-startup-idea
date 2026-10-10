"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BatteryMedium, ChevronRight, History, MapPin, Navigation, Pause, Play, Satellite, ShieldCheck, Square, SunMedium, Trash2, Wind, Wrench } from "lucide-react";
import { Button, Card, Modal, useToast } from "@/components/ui";
import { RideMap } from "@/components/ride/RideMap";
import { cn } from "@/lib/cn";
import { formatDateTime, friendlyError } from "@/lib/format";
import { averageSpeed, formatDistance, formatDuration, toPathJson } from "@/lib/ride/geo";
import { useRideTracker, type GpsState, type RideResult } from "@/lib/ride/useRideTracker";
import { createClient } from "@/lib/supabase/client";
import { typeEmoji, type VehicleType } from "@/lib/types";
import { Input } from "@/components/ui";
import { usesBattery } from "@/lib/subtypes";

/** 라이딩 화면 아래에 보여 줄 최근 기록 */
export type RecentRide = { id: string; started_at: string; elapsed_sec: number; distance_m: number; vehicle_type: string | null; vehicle_name: string | null };

/** 라이딩 탭 위쪽 정비 알림: 가장 급한 소모품 하나 */
export type CareTip = { vehicleName: string; label: string; emoji: string; urgent: boolean; more: number };

export type RideVehicle = { id: string; name: string; type: VehicleType; subtype?: string | null; odometer_m: number };

const LAST_VEHICLE_KEY = "b-lock:last-ride-vehicle";
/** 이보다 짧으면 저장할 의미가 없어서 버리기만 제안 */
const MIN_SAVE_METERS = 10;

export function RideTracker({ vehicles, userId, recent = [], careTip = null }: { vehicles: RideVehicle[]; userId: string; recent?: RecentRide[]; careTip?: CareTip | null }) {
  const router = useRouter();
  const toast = useToast();
  const t = useRideTracker(userId);
  /** 종료를 누르기 전에 달리던 중이었는지 (계속 타기 하면 다시 기록) */
  const wasRidingRef = useRef(false);
  const [vehicleId, setVehicleId] = useState(vehicles[0].id);
  const [result, setResult] = useState<RideResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  // 마칠 때: 주차 위치 저장 · 배터리 (전기자전거·킥보드)
  const [savePark, setSavePark] = useState(true);
  const [parkNote, setParkNote] = useState("");
  const [batStart, setBatStart] = useState("");
  const [batEnd, setBatEnd] = useState("");
  // 킥보드 출발 전 안전 확인
  const [safetyOpen, setSafetyOpen] = useState(false);

  const activeVehicleId = t.vehicleId ?? vehicleId;
  const vehicle = vehicles.find((v) => v.id === activeVehicleId);
  // 기록 중인 이동수단을 그사이 삭제했다면, 저장할 이동수단을 다시 골라야 해요.
  const vehicleMissing = Boolean(t.vehicleId) && !vehicle;

  // 지난번에 탄 이동수단을 기본으로 고르기
  useEffect(() => {
    try {
      const last = localStorage.getItem(LAST_VEHICLE_KEY);
      if (last && vehicles.some((v) => v.id === last)) setVehicleId(last);
    } catch {
      // 저장소를 못 쓰면 첫 번째 이동수단으로
    }
  }, [vehicles]);

  // 이미 위치 권한을 줬다면 바로 내 위치를 보여주고, 아니면 '시작'을 누를 때 권한을 물어봐요.
  const { startGps } = t;
  useEffect(() => {
    navigator.permissions
      ?.query({ name: "geolocation" as PermissionName })
      .then((p) => p.state === "granted" && startGps())
      .catch(() => {});
  }, [startGps]);

  // 기록 중에 화면을 닫거나 앱 안 다른 화면으로 가려 하면 한 번 더 확인
  const { pause } = t;
  useEffect(() => {
    if (t.status !== "riding") return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    // 메뉴·링크를 누르면(앱 안 이동) 기록이 멈추니 먼저 물어봐요. 이동하면 일시정지해 둬요.
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank") return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname === location.pathname) return;
      if (window.confirm("라이딩을 기록하는 중이에요. 다른 화면으로 가면 기록이 일시정지돼요. 이동할까요?")) {
        pause();
      } else {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", onClick, true);
    };
  }, [t.status, pause]);

  /** 시작 버튼: 전동킥보드는 출발 전 안전 확인을 먼저 보여 줘요 */
  function requestStart() {
    const v = vehicles.find((x) => x.id === vehicleId);
    if (v?.type === "kickboard") return setSafetyOpen(true);
    start();
  }

  function start() {
    setSafetyOpen(false);
    try {
      localStorage.setItem(LAST_VEHICLE_KEY, vehicleId);
    } catch {
      // 기억 못 해도 괜찮아요
    }
    t.start(vehicleId);
  }

  function end() {
    setSaveError("");
    wasRidingRef.current = t.status === "riding";
    setResult(t.finish());
  }

  /** 종료 창에서 '계속 타기': 달리던 중이었다면 바로 다시 기록 */
  function keepRiding() {
    setResult(null);
    if (wasRidingRef.current) t.resume();
    wasRidingRef.current = false;
  }

  async function saveRide() {
    if (!result) return;
    setSaving(true);
    setSaveError("");
    const { data, error } = await createClient().rpc("complete_ride", {
      p_vehicle: result.vehicleId,
      p_started_at: result.startedAt.toISOString(),
      p_ended_at: result.endedAt.toISOString(),
      p_moving_sec: result.movingSec,
      p_elapsed_sec: result.elapsedSec,
      p_distance_m: Math.round(result.distance * 10) / 10,
      p_max_speed_kmh: Math.round(result.maxSpeed * 10) / 10,
      p_path: toPathJson(result.path),
    });
    setSaving(false);
    if (error) {
      console.error(error);
      // 기록은 브라우저에 그대로 남아 있어서 다시 저장할 수 있어요. (같은 라이딩을 두 번 저장해도 서버가 한 번만 반영)
      setSaveError(friendlyError(error, "저장하지 못했어요. 인터넷 연결을 확인하고 다시 눌러 주세요."));
      return;
    }
    // 이어서 배터리·주차 위치 (실패해도 라이딩 저장은 이미 끝났어요)
    const supabase = createClient();
    const bs = batStart.trim() === "" ? null : Number(batStart);
    const be = batEnd.trim() === "" ? null : Number(batEnd);
    if ((bs != null || be != null) && vehicle && usesBattery(vehicle.type, vehicle.subtype)) {
      const { error: bErr } = await supabase.rpc("set_ride_battery", { p_ride: data, p_start: bs, p_end: be });
      if (bErr) toast.error(friendlyError(bErr, "배터리 기록은 저장하지 못했어요."));
    }
    const last = result.path[result.path.length - 1];
    if (savePark && last) {
      const { error: pErr } = await supabase.rpc("save_parking", {
        p_vehicle: result.vehicleId,
        p_lat: last.lat,
        p_lng: last.lng,
        p_accuracy: t.accuracy,
        p_note: parkNote.trim() || null,
      });
      if (pErr) console.error(pErr);
    }
    t.clear();
    setResult(null);
    setBatStart("");
    setBatEnd("");
    setParkNote("");
    toast.success("라이딩을 저장했어요! 소모품 거리에도 더했어요.");
    router.push(`/rides/${data}?done=1`);
  }

  function discard() {
    t.clear();
    setResult(null);
    setConfirmDiscard(false);
    toast.success("기록을 지웠어요.");
  }

  const avg = averageSpeed(t.distance, t.movingSec);

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight">라이딩</h1>
        <Link
          href="/rides"
          className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-white px-3.5 text-sm font-semibold text-brand-700 ring-1 ring-inset ring-line hover:bg-slate-50"
        >
          <History aria-hidden className="h-4 w-4" />
          내 기록
        </Link>
      </div>

      {t.restored && t.status === "paused" && (
        <div className="rounded-2xl bg-amber-50 p-4 text-[14px] leading-relaxed text-amber-900 ring-1 ring-amber-200">
          <b>끝내지 않은 라이딩이 있어요.</b> {formatDistance(t.restored.distance)} · {formatDuration(t.elapsedSec)} 기록돼 있어요.{" "}
          {t.canResume ? "이어서 타거나 종료해서 저장할 수 있어요." : "시작한 지 오래돼서 이어 탈 수 없어요. 종료해서 저장하거나 버릴 수 있어요."}
        </div>
      )}

      {vehicleMissing && (
        <div className="space-y-2 rounded-2xl bg-rose-50 p-4 text-[14px] text-rose-800 ring-1 ring-rose-200">
          <p>
            <b>기록하던 이동수단을 찾을 수 없어요.</b> 삭제됐을 수 있어요. 이 기록을 어느 이동수단에 저장할지 골라 주세요.
          </p>
          <div className="flex flex-wrap gap-2">
            {vehicles.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => t.reassign(v.id)}
                className="rounded-full bg-white inline-flex h-11 items-center px-4 text-sm font-semibold text-ink-soft ring-1 ring-inset ring-line hover:bg-slate-50"
              >
                {typeEmoji(v.type)} {v.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 어떤 이동수단으로 탈지 (기록 중에는 바꿀 수 없음) */}
      {t.status === "idle" ? (
        <div role="radiogroup" aria-label="탈 이동수단" className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {vehicles.map((v) => (
            <button
              key={v.id}
              type="button"
              role="radio"
              aria-checked={vehicleId === v.id}
              onClick={() => setVehicleId(v.id)}
              className={cn(
                "flex flex-none items-center gap-2 h-11 rounded-full px-4 text-sm font-semibold ring-1 ring-inset transition-colors",
                vehicleId === v.id ? "bg-brand-600 text-white ring-brand-600" : "bg-white text-ink-soft ring-line hover:bg-slate-50",
              )}
            >
              <span aria-hidden>{typeEmoji(v.type)}</span>
              {v.name}
            </button>
          ))}
        </div>
      ) : (
        <p className="text-sm text-ink-muted">
          기록 중인 이동수단: <span aria-hidden>{vehicle ? typeEmoji(vehicle.type) : ""}</span> <b className="text-ink">{vehicle?.name ?? "이동수단"}</b>
        </p>
      )}

      {/* 쉬는 중: 라이딩과 함께 쓰는 것들 (길 안내 · 보관소·공기주입기 · 소모품·정비) */}
      {t.status === "idle" && (
        <div className="grid grid-cols-3 gap-2">
          {[
            { href: "/navigate", label: "길 안내", Icon: Navigation, color: "text-brand-600" },
            { href: "/spots", label: "보관소·공기주입기", Icon: Wind, color: "text-emerald-600" },
            { href: "/maintenance", label: "소모품·정비", Icon: Wrench, color: "text-amber-600" },
          ].map(({ href, label, Icon, color }) => (
            <Link
              key={href}
              href={href}
              className="flex min-h-[76px] flex-col items-center justify-center gap-1.5 rounded-2xl bg-white px-1.5 py-2.5 text-center text-[13px] font-semibold leading-tight ring-1 ring-inset ring-line hover:bg-slate-50"
            >
              <Icon aria-hidden className={cn("h-6 w-6", color)} />
              <span className="break-keep">{label}</span>
            </Link>
          ))}
        </div>
      )}
      {/* 쉬는 중: 교체·점검할 때가 된 소모품 */}
      {t.status === "idle" && careTip && (
        <Link
          href="/maintenance"
          className={cn(
            "flex items-center gap-3 rounded-2xl px-4 py-3 ring-1",
            careTip.urgent ? "bg-rose-50 text-rose-900 ring-rose-200" : "bg-amber-50 text-amber-900 ring-amber-200",
          )}
        >
          <span aria-hidden className="text-2xl">
            {careTip.emoji}
          </span>
          <span className="min-w-0 flex-1 text-[14px] leading-snug">
            <b>
              {careTip.vehicleName} · {careTip.label} {careTip.urgent ? "지금 챙겨 주세요" : "곧 챙길 때예요"}
            </b>
            {careTip.more > 0 && <span className="block text-[12px] opacity-80">그 밖에 {careTip.more}건 더 있어요</span>}
          </span>
          <ChevronRight aria-hidden className="h-5 w-5 flex-none opacity-60" />
        </Link>
      )}

      <div className="relative">
        <RideMap path={t.points} current={t.current} follow className={t.status === "idle" ? "h-[44vh] min-h-[260px]" : "h-[34vh] min-h-[210px]"} />
        <GpsBadge gps={t.gps} accuracy={t.accuracy} />
      </div>

      {t.gps === "denied" && (
        <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2.5 text-sm leading-relaxed text-rose-700">
          위치 권한이 꺼져 있어요. 브라우저 주소창 왼쪽 자물쇠(또는 설정 → 사이트 권한)에서 <b>위치</b>를 허용한 뒤 새로고침해 주세요.
        </p>
      )}
      {t.gps === "unsupported" && (
        <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
          이 브라우저는 위치 기능을 지원하지 않아요. 크롬이나 사파리로 열어 주세요.
        </p>
      )}

      {/* 주행 정보 */}
      <Card className="p-4">
        <div className="text-center">
          <p className="text-[13px] font-semibold text-ink-muted">주행 거리</p>
          <p className="mt-0.5 text-5xl font-extrabold tabular-nums tracking-tight">{formatDistance(t.distance)}</p>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
          <Stat label="시간" value={formatDuration(t.elapsedSec)} />
          <Stat label="현재 속도" value={`${t.speed.toFixed(1)} km/h`} />
          <Stat label="평균 속도" value={`${avg.toFixed(1)} km/h`} />
          <Stat label="최고 속도" value={`${t.maxSpeed.toFixed(1)} km/h`} />
        </dl>
        {t.status === "riding" && !t.wakeLocked && (
          <p className="mt-3 flex items-start gap-1.5 text-[12px] leading-relaxed text-ink-muted">
            <SunMedium aria-hidden className="mt-0.5 h-3.5 w-3.5 flex-none" />
            화면이 꺼지면 위치 기록이 멈출 수 있어요. 기록하는 동안 화면을 켜 두세요.
          </p>
        )}
      </Card>

      {/* 시작 / 일시정지 / 종료 */}
      <div className="sticky bottom-[calc(6rem+env(safe-area-inset-bottom))] z-10 sm:bottom-4">
        {t.status === "idle" && (
          <Button size="lg" full className="h-16 text-lg shadow-lift" icon={<Play aria-hidden className="h-6 w-6" />} onClick={requestStart}>
            라이딩 시작
          </Button>
        )}
        {t.status === "riding" && (
          <div className="grid grid-cols-2 gap-2">
            <Button size="lg" variant="secondary" className="h-16 text-lg shadow-lift" icon={<Pause aria-hidden className="h-6 w-6" />} onClick={t.pause}>
              일시정지
            </Button>
            <Button size="lg" variant="danger" className="h-16 text-lg shadow-lift" icon={<Square aria-hidden className="h-5 w-5" />} onClick={end}>
              종료
            </Button>
          </div>
        )}
        {t.status === "paused" && (
          <div className={cn("grid gap-2", t.canResume && !vehicleMissing ? "grid-cols-2" : "grid-cols-1")}>
            {t.canResume && !vehicleMissing && (
              <Button size="lg" className="h-16 text-lg shadow-lift" icon={<Play aria-hidden className="h-6 w-6" />} onClick={t.resume}>
                이어서 타기
              </Button>
            )}
            <Button size="lg" variant="danger" className="h-16 text-lg shadow-lift" icon={<Square aria-hidden className="h-5 w-5" />} onClick={end} disabled={vehicleMissing} title={vehicleMissing ? "저장할 이동수단을 먼저 골라 주세요" : undefined}>
              종료
            </Button>
          </div>
        )}
      </div>

      {/* 쉬는 중일 때만: 최근 기록 (눌러서 지도·공유 카드·경로 파일) */}
      {t.status === "idle" && !result && (
        <section aria-labelledby="recent-rides" className="space-y-2 pt-2">
          <div className="flex items-center justify-between px-1">
            <h2 id="recent-rides" className="text-lg font-bold tracking-tight">
              최근 라이딩
            </h2>
          </div>
          {recent.length === 0 ? (
            <p className="rounded-2xl bg-slate-50 p-4 text-[14px] leading-relaxed text-ink-muted">
              아직 기록이 없어요. 라이딩을 마치면 여기에 쌓이고, 눌러서 지도를 보거나 사진으로 공유할 수 있어요.
            </p>
          ) : (
            <ul className="space-y-2">
              {recent.map((r) => (
                <li key={r.id}>
                  <Link href={`/rides/${r.id}`} className="block">
                    <Card className="flex items-center gap-3 p-4 hover:shadow-lift">
                      <span aria-hidden className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-brand-50 text-xl">
                        {r.vehicle_type ? typeEmoji(r.vehicle_type as VehicleType) : "🚲"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-bold tabular-nums">
                          {formatDistance(r.distance_m)} <span className="text-sm font-medium text-ink-muted">· {formatDuration(r.elapsed_sec)}</span>
                        </p>
                        <p className="truncate text-[13px] text-ink-muted">
                          {formatDateTime(r.started_at)} · {r.vehicle_name ?? "삭제한 이동수단"}
                        </p>
                      </div>
                      <span className="flex-none text-[12px] font-semibold text-ink-muted">자세히</span>
                      <ChevronRight aria-hidden className="h-5 w-5 flex-none text-ink-faint" />
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* 종료 확인: 저장 / 계속 타기 / 버리기 */}
      <Modal
        open={Boolean(result) && !confirmDiscard}
        onClose={() => !saving && keepRiding()}
        title="라이딩을 마칠까요?"
        footer={
          result && result.distance >= MIN_SAVE_METERS ? (
            <>
              <Button variant="ghost" onClick={keepRiding} disabled={saving}>
                계속 타기
              </Button>
              <Button loading={saving} loadingText="저장 중..." onClick={saveRide}>
                저장하고 마치기
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={keepRiding}>
                계속 타기
              </Button>
              <Button variant="danger" onClick={discard}>
                기록 버리기
              </Button>
            </>
          )
        }
      >
        {result && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              <Stat label="거리" value={formatDistance(result.distance)} />
              <Stat label="시간" value={formatDuration(result.elapsedSec)} />
              <Stat label="평균" value={`${averageSpeed(result.distance, result.movingSec).toFixed(1)} km/h`} />
            </div>
            {result.distance >= MIN_SAVE_METERS ? (
              <p className="text-[14px]">
                저장하면 <b>{vehicle?.name}</b>의 누적 거리와 소모품 거리에 {formatDistance(result.distance)}가 더해져요.
              </p>
            ) : (
              <p className="text-[14px]">움직인 거리가 너무 짧아서 저장할 기록이 없어요.</p>
            )}
            {result.distance >= MIN_SAVE_METERS && (
              <div className="space-y-2 rounded-xl bg-slate-50 p-3">
                <label className="flex items-center gap-2 text-[14px] font-semibold">
                  <input type="checkbox" className="h-5 w-5 accent-brand-600" checked={savePark} onChange={(e) => setSavePark(e.target.checked)} />
                  <MapPin aria-hidden className="h-4 w-4 text-brand-600" />
                  여기 세웠어요 (주차 위치 저장)
                </label>
                {savePark && (
                  <Input label="세운 곳 메모 (선택)" placeholder="예) 아파트 정문 거치대 맨 왼쪽" value={parkNote} maxLength={100} onChange={(e) => setParkNote(e.target.value)} />
                )}
              </div>
            )}
            {result.distance >= MIN_SAVE_METERS && vehicle && usesBattery(vehicle.type, vehicle.subtype) && (
              <div className="space-y-2 rounded-xl bg-slate-50 p-3">
                <p className="flex items-center gap-2 text-[14px] font-semibold">
                  <BatteryMedium aria-hidden className="h-4 w-4 text-brand-600" />
                  배터리 (선택) · 1회 충전 주행거리를 계산해요
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <Input label="출발 %" inputMode="numeric" placeholder="예) 90" value={batStart} onChange={(e) => setBatStart(e.target.value.replace(/\D/g, "").slice(0, 3))} />
                  <Input label="도착 %" inputMode="numeric" placeholder="예) 65" value={batEnd} onChange={(e) => setBatEnd(e.target.value.replace(/\D/g, "").slice(0, 3))} />
                </div>
              </div>
            )}
            {saveError && (
              <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
                {saveError}
              </p>
            )}
            {result.distance >= MIN_SAVE_METERS && (
              <button
                type="button"
                onClick={() => setConfirmDiscard(true)}
                disabled={saving}
                className="inline-flex items-center gap-1 text-[13px] text-ink-faint hover:text-rose-600"
              >
                <Trash2 aria-hidden className="h-3.5 w-3.5" />
                저장하지 않고 버리기
              </button>
            )}
          </div>
        )}
      </Modal>

      {/* 전동킥보드 출발 전 안전 확인 (법으로 정해진 것들) */}
      <Modal
        open={safetyOpen}
        onClose={() => setSafetyOpen(false)}
        title="출발 전 안전 확인"
        footer={
          <>
            <Button variant="ghost" onClick={() => setSafetyOpen(false)}>
              취소
            </Button>
            <Button icon={<ShieldCheck aria-hidden className="h-4 w-4" />} onClick={start}>
              모두 확인했어요
            </Button>
          </>
        }
      >
        <ul className="space-y-2 text-[15px] leading-relaxed">
          <li>🪖 헬멧을 썼어요</li>
          <li>🧍 혼자 타요 (2명 이상 탑승 금지)</li>
          <li>🪪 원동기장치자전거 면허 이상이 있어요</li>
          <li>🚫 보도(인도)가 아닌 자전거도로·차도 가장자리로 다녀요</li>
        </ul>
        <p className="mt-3 text-[13px] text-ink-muted">개인형 이동장치는 도로교통법에 따라 위 내용을 지켜야 해요. 어기면 범칙금이 있어요.</p>
      </Modal>

      <Modal
        open={confirmDiscard}
        onClose={() => setConfirmDiscard(false)}
        title="기록을 버릴까요?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDiscard(false)}>
              취소
            </Button>
            <Button variant="danger" onClick={discard}>
              버리기
            </Button>
          </>
        }
      >
        이번 라이딩 기록이 사라지고 되돌릴 수 없어요.
      </Modal>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-2 py-2.5">
      <dt className="text-[12px] text-ink-muted">{label}</dt>
      <dd className="mt-0.5 font-bold tabular-nums">{value}</dd>
    </div>
  );
}

function GpsBadge({ gps, accuracy }: { gps: GpsState; accuracy: number | null }) {
  if (gps === "off") return null;
  const meta: Record<Exclude<GpsState, "off">, { text: string; cls: string }> = {
    searching: { text: "위치 찾는 중", cls: "bg-white text-ink-soft" },
    good: { text: `위치 정확함 ±${accuracy ?? "?"}m`, cls: "bg-emerald-600 text-white" },
    weak: { text: accuracy ? `위치 약함 ±${accuracy}m` : "위치 약함", cls: "bg-amber-500 text-white" },
    denied: { text: "위치 권한 꺼짐", cls: "bg-rose-600 text-white" },
    unsupported: { text: "위치 기능 없음", cls: "bg-rose-600 text-white" },
  };
  const m = meta[gps];
  return (
    <span className={cn("absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold shadow-card", m.cls)}>
      <Satellite aria-hidden className="h-3.5 w-3.5" />
      {m.text}
    </span>
  );
}
