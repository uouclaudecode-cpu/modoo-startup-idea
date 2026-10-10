"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, ChevronLeft, MapPin, Navigation, Phone, Plus, RefreshCw, Search, Wind, Wrench, X } from "lucide-react";
import { BikeMap, DEFAULT_CENTER, type BikeMapPin } from "@/components/map/BikeMap";
import { LocationPicker, type PickedLocation } from "@/components/map/LocationPicker";
import { Badge, Button, Card, Input, Modal, Textarea, useToast } from "@/components/ui";
import { cn } from "@/lib/cn";
import { friendlyError } from "@/lib/format";
import { distance, type LatLng } from "@/lib/ride/geo";
import { formatDist, hazardYearsLabel, mergeHazards, pumpState, SPOT_KINDS, type BikeHazard, type BikeSpot, type MergedHazard, type SpotKind } from "@/lib/spots";
import { createClient } from "@/lib/supabase/client";

const RADIUS = 3000;

const PIN = {
  pump: { color: "#059669", mark: "공" },
  broken: { color: "#94a3b8", mark: "공" },
  parking: { color: "#2552e8", mark: "P" },
  repair: { color: "#7c3aed", mark: "수" },
  hazard: { color: "#ea580c", mark: "!" },
};

/** 길 안내 화면으로 가는 주소 */
export function navigateHref(p: LatLng, name: string) {
  return `/navigate?to=${p.lat.toFixed(6)},${p.lng.toFixed(6)}&name=${encodeURIComponent(name.slice(0, 40))}`;
}

export function SpotsExplorer({ loggedIn, initialKind }: { loggedIn: boolean; initialKind: Exclude<SpotKind, "all"> }) {
  const toast = useToast();
  const [kind, setKind] = useState<Exclude<SpotKind, "all">>(initialKind);
  const [showHazards, setShowHazards] = useState(true);
  const [me, setMe] = useState<LatLng | null>(null);
  // 찾은 기준 위치 · 지도의 지금 가운데
  const [origin, setOrigin] = useState<LatLng | null>(null);
  const [mapCenter, setMapCenter] = useState<LatLng | null>(null);
  const [centerKey, setCenterKey] = useState(0);
  const [spots, setSpots] = useState<BikeSpot[] | null>(null);
  const [hazards, setHazards] = useState<MergedHazard[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loadError, setLoadError] = useState("");
  const [adding, setAdding] = useState(false);

  // 처음: 내 위치 (안 되면 기본 위치)
  useEffect(() => {
    if (!navigator.geolocation) return setOrigin(DEFAULT_CENTER);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setMe(p);
        setOrigin(p);
        setCenterKey((k) => k + 1);
      },
      () => setOrigin(DEFAULT_CENTER),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 120000 },
    );
  }, []);

  const load = useCallback(async (at: LatLng, k: SpotKind) => {
    setLoadError("");
    const supabase = createClient();
    const d = 0.04; // 약 4km (사고 잦은 곳은 넓게)
    const [s, h] = await Promise.all([
      supabase.rpc("nearby_bike_spots", { p_lat: at.lat, p_lng: at.lng, p_radius_m: RADIUS, p_kind: k }),
      supabase.rpc("bike_hazards_in_box", { p_min_lat: at.lat - d, p_min_lng: at.lng - d * 1.2, p_max_lat: at.lat + d, p_max_lng: at.lng + d * 1.2 }),
    ]);
    if (s.error) {
      console.error(s.error);
      setLoadError("장소를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
      setSpots([]);
    } else {
      // 공공데이터에 같은 장소가 관리번호만 다르게 두 번 들어 있는 경우가 있어 하나로 합쳐요
      const seen = new Set<string>();
      setSpots(
        ((s.data ?? []) as BikeSpot[]).filter((x) => {
          const k = `${x.name}|${x.lat.toFixed(4)}|${x.lng.toFixed(4)}`;
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        }),
      );
    }
    if (h.error) console.error(h.error);
    // 최근 3년 자료에서 같은 장소는 하나로 묶어요
    setHazards(mergeHazards(((h.data ?? []) as BikeHazard[]).filter(Boolean)));
  }, []);

  useEffect(() => {
    if (origin) load(origin, kind);
  }, [origin, kind, load]);

  const moved = origin && mapCenter && distance(origin, mapCenter) > 600;
  const list = useMemo(() => spots ?? [], [spots]);
  const sel = list.find((s) => s.id === selected) ?? null;
  const selHazard = selected?.startsWith("hz:") ? hazards.find((h) => `hz:${h.id}` === selected) ?? null : null;

  const pins: BikeMapPin[] = useMemo(() => {
    const out: BikeMapPin[] = list.slice(0, 200).map((s) => {
      const style = kind === "pump" ? (pumpState(s) === "broken" ? PIN.broken : PIN.pump) : kind === "repair" ? PIN.repair : PIN.parking;
      return { id: s.id, lat: s.lat, lng: s.lng, ...style, selected: s.id === selected };
    });
    if (showHazards) for (const h of hazards) out.push({ id: `hz:${h.id}`, lat: h.lat, lng: h.lng, ...PIN.hazard, selected: `hz:${h.id}` === selected });
    return out;
  }, [list, hazards, kind, selected, showHazards]);

  const label = SPOT_KINDS.find((k) => k.value === kind)?.label ?? "";

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Link href="/ride" className="-ml-2 inline-flex h-10 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-ink-muted hover:bg-slate-100 hover:text-ink">
        <ChevronLeft aria-hidden className="h-4 w-4" />
        라이딩
      </Link>
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">공기주입기·자전거 보관소</h1>
        <p className="mt-1 text-sm text-ink-muted">내 주변 3km 안을 가까운 순으로 보여 줘요. 장소를 누르면 길 안내를 받을 수 있어요.</p>
      </div>

      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
        {SPOT_KINDS.filter((k) => k.value !== "all").map((k) => (
          <button
            key={k.value}
            type="button"
            onClick={() => {
              setKind(k.value as Exclude<SpotKind, "all">);
              setSelected(null);
            }}
            aria-pressed={kind === k.value}
            className={cn(
              "inline-flex h-10 flex-none items-center gap-1.5 rounded-full px-4 text-sm font-semibold ring-1 ring-inset",
              kind === k.value ? "bg-ink text-white ring-ink" : "bg-white text-ink-soft ring-line",
            )}
          >
            {k.value === "pump" ? <Wind aria-hidden className="h-4 w-4" /> : k.value === "repair" ? <Wrench aria-hidden className="h-4 w-4" /> : <MapPin aria-hidden className="h-4 w-4" />}
            {k.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setShowHazards(!showHazards)}
          aria-pressed={showHazards}
          className={cn(
            "inline-flex h-10 flex-none items-center gap-1.5 rounded-full px-4 text-sm font-semibold ring-1 ring-inset",
            showHazards ? "bg-orange-50 text-orange-700 ring-orange-300" : "bg-white text-ink-soft ring-line",
          )}
        >
          <AlertTriangle aria-hidden className="h-4 w-4" />
          사고 잦은 곳
        </button>
      </div>

      <div className="relative">
        <BikeMap
          className="h-[46vh] min-h-72"
          pins={pins}
          circles={showHazards ? hazards : []}
          current={me}
          center={me ?? origin}
          centerKey={centerKey}
          onPinClick={setSelected}
          onMoved={setMapCenter}
        />
        {moved && (
          <button
            type="button"
            onClick={() => {
              setOrigin(mapCenter);
              setSelected(null);
            }}
            className="absolute left-1/2 top-3 inline-flex h-10 -translate-x-1/2 items-center gap-1.5 rounded-full bg-white px-4 text-sm font-semibold text-brand-700 shadow-lift ring-1 ring-line"
          >
            <Search aria-hidden className="h-4 w-4" />이 지역에서 다시 찾기
          </button>
        )}
      </div>

      {selHazard && <HazardCard h={selHazard} onClose={() => setSelected(null)} />}
      {sel && (
        <SpotCard
          spot={sel}
          from={me}
          loggedIn={loggedIn}
          onClose={() => setSelected(null)}
          onRated={(patch) => setSpots((cur) => (cur ?? []).map((s) => (s.id === sel.id ? { ...s, ...patch } : s)))}
        />
      )}

      <div className="flex items-center justify-between gap-2 px-1">
        <h2 className="text-lg font-bold">
          가까운 {label} {spots && !loadError ? `${list.length}곳` : ""}
        </h2>
        {loggedIn ? (
          <button type="button" onClick={() => setAdding(true)} className="inline-flex h-10 items-center gap-1 rounded-xl bg-brand-50 px-3.5 text-sm font-semibold text-brand-700 hover:bg-brand-100">
            <Plus aria-hidden className="h-4 w-4" />
            공기주입기 알려 주기
          </button>
        ) : (
          <Link href="/login?next=/spots" className="text-sm font-semibold text-brand-700 hover:underline">
            로그인하고 알려 주기
          </Link>
        )}
      </div>

      {loadError && (
        <p className="flex items-center justify-between gap-2 rounded-xl bg-rose-50 p-3 text-[13px] text-rose-700">
          {loadError}
          <button type="button" onClick={() => origin && load(origin, kind)} className="inline-flex items-center gap-1 font-semibold">
            <RefreshCw aria-hidden className="h-4 w-4" />
            다시
          </button>
        </p>
      )}
      {spots === null ? (
        <p className="py-6 text-center text-sm text-ink-muted">내 주변을 찾고 있어요...</p>
      ) : list.length === 0 && !loadError ? (
        <Card className="p-5 text-center text-sm leading-relaxed text-ink-muted">
          이 근처 3km 안에는 등록된 {label}가 없어요.
          <br />
          지도를 옮겨 &lsquo;이 지역에서 다시 찾기&rsquo;를 눌러 보세요.
        </Card>
      ) : (
        <ul className="space-y-2">
          {list.slice(0, 30).map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => {
                  setSelected(s.id);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className={cn("flex w-full items-center gap-3 rounded-2xl bg-white p-3.5 text-left ring-1 ring-line hover:bg-slate-50", s.id === selected && "ring-2 ring-brand-500")}
              >
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-1 font-semibold">{s.name}</span>
                  <span className="mt-0.5 line-clamp-1 text-[13px] text-ink-muted">{s.road_addr || s.lot_addr || s.note || (s.source === "user" ? "회원이 알려 준 곳" : "")}</span>
                  <span className="mt-1.5 flex flex-wrap gap-1.5">
                    <SpotBadges s={s} />
                  </span>
                </span>
                <span className="flex-none text-sm font-bold tabular-nums text-brand-700">{formatDist(s.dist)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="px-1 text-[12px] leading-relaxed text-ink-faint">
        자료: 행정안전부 자전거보관소정보, 도로교통공단 자전거사고 다발지역(공공데이터포털), B-LOCK 회원 제보. 실제와 다를 수 있어요.
      </p>

      <AddPumpModal
        open={adding}
        start={mapCenter ?? me}
        onClose={() => setAdding(false)}
        onAdded={() => {
          setAdding(false);
          toast.success("알려 주셔서 고마워요! 지도에 바로 보여요.");
          if (kind !== "pump") setKind("pump");
          else if (origin) load(origin, "pump");
        }}
      />
    </div>
  );
}

function SpotBadges({ s }: { s: BikeSpot }) {
  const state = pumpState(s);
  return (
    <>
      {s.has_pump &&
        (state === "broken" ? (
          <Badge tone="warning" icon={<AlertTriangle aria-hidden className="h-3.5 w-3.5" />}>
            공기주입기 고장 제보
          </Badge>
        ) : (
          <Badge tone="success" icon={<Wind aria-hidden className="h-3.5 w-3.5" />}>
            공기주입기{s.pump_type ? ` · ${s.pump_type}` : ""}
          </Badge>
        ))}
      {s.has_repair && <Badge icon={<Wrench aria-hidden className="h-3.5 w-3.5" />}>수리대</Badge>}
      {s.is_parking && s.racks != null && s.racks > 0 && <Badge tone="brand">{s.racks}대 보관</Badge>}
      {s.has_shade && <Badge>지붕</Badge>}
      {s.source === "user" && <Badge>회원 제보</Badge>}
    </>
  );
}

function SpotCard({
  spot: s,
  from,
  loggedIn,
  onClose,
  onRated,
}: {
  spot: BikeSpot;
  from: LatLng | null;
  loggedIn: boolean;
  onClose: () => void;
  onRated: (patch: Partial<BikeSpot>) => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const rows: [string, string][] = [
    ["주소", s.road_addr || s.lot_addr || "-"],
    ...(s.road_addr && s.lot_addr ? ([["지번", s.lot_addr]] as [string, string][]) : []),
    ...(s.racks != null ? ([["보관 대수", `${s.racks}대`]] as [string, string][]) : []),
    ...(s.install_shape ? ([["설치 형태", s.install_shape + (s.has_shade ? " · 지붕 있음" : "")]] as [string, string][]) : []),
    ...(s.install_year ? ([["설치 연도", `${s.install_year}년`]] as [string, string][]) : []),
    ...(s.mgr_name ? ([["관리 기관", s.mgr_name]] as [string, string][]) : []),
    ...(s.note ? ([["설명", s.note]] as [string, string][]) : []),
  ];

  async function rate(kind: "ok" | "broken" | "gone") {
    setBusy(kind);
    const { data, error } = await createClient().rpc("rate_bike_spot", { p_spot: s.id, p_kind: kind });
    setBusy(null);
    if (error) return toast.error(friendlyError(error, "저장하지 못했어요."));
    onRated(data as Partial<BikeSpot>);
    toast.success(kind === "ok" ? "확인 고마워요!" : kind === "broken" ? "고장 제보를 남겼어요. 다른 분들이 헛걸음하지 않을 거예요." : "알려 주셔서 고마워요.");
  }

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-lg font-bold">{s.name}</h3>
          <p className="text-sm font-semibold text-brand-700">{from ? `여기서 ${formatDist(distance(from, s))}` : formatDist(s.dist)}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="닫기" className="grid h-10 w-10 flex-none place-items-center rounded-full text-ink-muted hover:bg-slate-100">
          <X aria-hidden className="h-5 w-5" />
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <SpotBadges s={s} />
      </div>
      <dl className="grid grid-cols-[5.5rem_1fr] gap-x-2 gap-y-1.5 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-ink-muted">{k}</dt>
            <dd className="break-keep">{v}</dd>
          </div>
        ))}
      </dl>
      {s.has_pump && (s.ok_count > 0 || s.broken_count > 0) && (
        <p className="text-[13px] text-ink-muted">
          회원 확인: 잘 돼요 {s.ok_count} · 고장 {s.broken_count}
          {s.last_ok_at && ` · 마지막으로 잘 됐던 날 ${new Date(s.last_ok_at).toLocaleDateString("ko-KR")}`}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Link
          href={navigateHref(s, s.name)}
          className="col-span-2 inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-brand-600 font-semibold text-white hover:bg-brand-700"
        >
          <Navigation aria-hidden className="h-5 w-5" />
          자전거 길 안내
        </Link>
        {s.mgr_tel && (
          <a href={`tel:${s.mgr_tel.replace(/[^0-9]/g, "")}`} className="col-span-2 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-white text-sm font-semibold ring-1 ring-inset ring-line hover:bg-slate-50">
            <Phone aria-hidden className="h-4 w-4" />
            관리 기관에 전화 ({s.mgr_tel})
          </a>
        )}
      </div>
      {s.has_pump && (
        <div className="space-y-2 border-t border-line pt-3">
          <p className="text-sm font-semibold text-ink-soft">공기주입기를 써 보셨나요?</p>
          {loggedIn ? (
            <div className="grid grid-cols-3 gap-2">
              <Button variant="secondary" className="h-11 px-2 text-sm" loading={busy === "ok"} disabled={!!busy} onClick={() => rate("ok")} icon={<Check aria-hidden className="h-4 w-4" />}>
                잘 돼요
              </Button>
              <Button variant="secondary" className="h-11 px-2 text-sm" loading={busy === "broken"} disabled={!!busy} onClick={() => rate("broken")}>
                고장 났어요
              </Button>
              <Button variant="secondary" className="h-11 px-2 text-sm" loading={busy === "gone"} disabled={!!busy} onClick={() => rate("gone")}>
                없어요
              </Button>
            </div>
          ) : (
            <Link href="/login?next=/spots" className="text-sm font-semibold text-brand-700 hover:underline">
              로그인하면 고장 여부를 알려 줄 수 있어요
            </Link>
          )}
        </div>
      )}
    </Card>
  );
}

function HazardCard({ h, onClose }: { h: MergedHazard; onClose: () => void }) {
  return (
    <Card className="space-y-2 p-4 ring-orange-200">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-bold text-orange-700">
            <AlertTriangle aria-hidden className="h-4 w-4" />
            자전거 사고가 잦은 곳
          </p>
          <h3 className="mt-1 text-lg font-bold break-keep">{h.name}</h3>
        </div>
        <button type="button" onClick={onClose} aria-label="닫기" className="grid h-10 w-10 flex-none place-items-center rounded-full text-ink-muted hover:bg-slate-100">
          <X aria-hidden className="h-5 w-5" />
        </button>
      </div>
      <p className="text-sm leading-relaxed text-ink-soft">
        {h.years.length > 1 && `최근 3년 중 ${h.years.length}번(${hazardYearsLabel(h.years)}) 사고 다발 지역으로 뽑힌 곳이에요. `}
        {h.year}년 한 해 동안 자전거 사고 {h.accidents}건, 다친 사람 {h.casualties}명
        {h.deaths > 0 && `(사망 ${h.deaths}명)`}
        {h.serious > 0 && `, 크게 다친 사람 ${h.serious}명`}이 있었어요. 지날 때 속도를 줄이고 주변을 살펴 주세요.
      </p>
      <p className="text-[12px] text-ink-faint">자료: 도로교통공단 자전거사고 다발지역 ({hazardYearsLabel(h.years)})</p>
    </Card>
  );
}

function AddPumpModal({ open, start, onClose, onAdded }: { open: boolean; start: LatLng | null; onClose: () => void; onAdded: () => void }) {
  const [where, setWhere] = useState<PickedLocation | null>(null);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [repair, setRepair] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setWhere(start);
      setName("");
      setNote("");
      setRepair(false);
      setError("");
    }
    // 열 때만 처음 위치를 넣어요
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function submit() {
    if (!where) return setError("지도에서 위치를 골라 주세요.");
    if (!name.trim()) return setError("장소 이름을 적어 주세요.");
    setError("");
    setLoading(true);
    const { error: err } = await createClient().rpc("add_bike_spot", {
      p_name: name.trim(),
      p_lat: where.lat,
      p_lng: where.lng,
      p_note: note.trim() || null,
      p_repair: repair,
    });
    setLoading(false);
    if (err) return setError(friendlyError(err, "저장하지 못했어요. 잠시 후 다시 시도해 주세요."));
    onAdded();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="공기주입기 알려 주기"
      footer={
        <Button full loading={loading} loadingText="저장 중..." onClick={submit}>
          지도에 올리기
        </Button>
      }
    >
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-ink-muted">자전거 가게 앞, 공원, 지하철역처럼 누구나 쓸 수 있는 공기주입기를 알려 주세요. 다른 회원에게 바로 보여요.</p>
        <LocationPicker label="위치" value={where} onChange={setWhere} />
        <Input label="장소 이름" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="예: 태화강역 2번 출구 앞" />
        <Textarea label="설명 (선택)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} rows={2} placeholder="예: 프레스타·슈레더 둘 다 돼요, 밤 10시까지" />
        <label className="flex min-h-11 items-center gap-2.5 text-[15px]">
          <input type="checkbox" checked={repair} onChange={(e) => setRepair(e.target.checked)} className="h-5 w-5 rounded accent-brand-600" />
          수리 공구(수리대)도 있어요
        </label>
        {error && <p className="text-[13px] text-rose-600">{error}</p>}
      </div>
    </Modal>
  );
}
