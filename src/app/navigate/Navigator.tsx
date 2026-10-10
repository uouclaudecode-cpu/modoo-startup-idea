"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowUp,
  ArrowUpLeft,
  ArrowUpRight,
  ChevronLeft,
  CornerUpLeft,
  CornerUpRight,
  Flag,
  LoaderCircle,
  MapPin,
  Navigation,
  RotateCw,
  Search,
  Undo2,
  Wind,
  X,
} from "lucide-react";
import { BikeMap, DEFAULT_CENTER } from "@/components/map/BikeMap";
import { Button, Card } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  cumulative,
  formatDuration,
  formatMeters,
  isQuiet,
  progressOn,
  stepArrow,
  stepPositions,
  stepText,
  type NavRoute,
  type Progress,
} from "@/lib/nav";
import { distance, type LatLng } from "@/lib/ride/geo";
import { mergeHazards, type BikeHazard } from "@/lib/spots";
import { createClient } from "@/lib/supabase/client";
import type { PlaceResult } from "../api/geo/search/route";
import { useNavRide, type NavRideCtx } from "./useNavRide";

type Dest = LatLng & { name: string };
type RouteHazard = BikeHazard & { along: number };

/** 경로에서 이만큼 벗어나면 (두 번 연속) 길을 다시 찾아요 */
const OFF_ROUTE_M = 45;
const REROUTE_GAP_MS = 15000;
/** 도착으로 보는 거리 */
const ARRIVE_M = 25;
/** 사고 잦은 곳을 미리 알려 주는 거리 */
const HAZARD_WARN_M = 200;

type WakeLockLike = { release(): Promise<void> };

const ARROWS = {
  left: CornerUpLeft,
  right: CornerUpRight,
  "slight-left": ArrowUpLeft,
  "slight-right": ArrowUpRight,
  straight: ArrowUp,
  uturn: Undo2,
  roundabout: RotateCw,
  arrive: Flag,
} as const;

function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* 진동이 없는 기기 */
  }
}

export function Navigator({ initialDest, ride }: { initialDest: Dest | null; ride: NavRideCtx }) {
  const [me, setMe] = useState<LatLng | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [locError, setLocError] = useState("");
  const [dest, setDest] = useState<Dest | null>(initialDest);

  // 검색
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  // 경로
  const [route, setRoute] = useState<NavRoute | null>(null);
  const [routeError, setRouteError] = useState("");
  const [routing, setRouting] = useState(false);
  const [hazards, setHazards] = useState<RouteHazard[]>([]);
  const [fitKey, setFitKey] = useState(0);

  // 안내 중
  const [navigating, setNavigating] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [arrived, setArrived] = useState(false);
  const [rerouting, setRerouting] = useState(false);
  const offCount = useRef(0);
  const lastReroute = useRef(0);
  const hintRef = useRef(0);
  const buzzedSteps = useRef(new Set<number>());
  const warnedHazards = useRef(new Set<string>());
  const wakeRef = useRef<WakeLockLike | null>(null);
  // 라이딩 기록 (저장 창의 '계속 타기'를 누르면 안내 화면으로 돌아가요)
  const rec = useNavRide(ride, { onKeepGoing: () => setNavigating(true) });

  const cum = useMemo(() => (route ? cumulative(route.path) : []), [route]);
  const stepAt = useMemo(() => (route ? stepPositions(route.path, cum, route.steps) : []), [route, cum]);

  // 1) 내 위치: 처음 한 번, 안내 중에는 계속
  useEffect(() => {
    if (!navigator.geolocation) {
      setLocError("이 기기에서는 위치를 쓸 수 없어요.");
      return;
    }
    const onPos = (pos: GeolocationPosition) => {
      setMe({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      setAccuracy(Math.round(pos.coords.accuracy));
      setLocError("");
    };
    const onErr = (e: GeolocationPositionError) => {
      if (e.code === e.PERMISSION_DENIED) setLocError("위치 권한이 꺼져 있어요. 브라우저 설정에서 위치를 허용해 주세요.");
    };
    const id = navigator.geolocation.watchPosition(onPos, onErr, { enableHighAccuracy: true, maximumAge: navigating ? 1000 : 30000, timeout: 20000 });
    return () => navigator.geolocation.clearWatch(id);
  }, [navigating]);

  // 2) 경로 찾기
  const findRoute = useCallback(async (from: LatLng, to: LatLng, quiet = false) => {
    if (!quiet) {
      setRouting(true);
      setRouteError("");
    }
    try {
      const r = await fetch(`/api/route?from=${from.lat.toFixed(6)},${from.lng.toFixed(6)}&to=${to.lat.toFixed(6)},${to.lng.toFixed(6)}`);
      const j = (await r.json()) as NavRoute & { error?: string };
      if (!r.ok || j.error) throw new Error(j.error ?? "길을 찾지 못했어요.");
      setRoute(j);
      hintRef.current = 0;
      buzzedSteps.current.clear();
      if (!quiet) setFitKey((k) => k + 1);
      return j;
    } catch (e) {
      if (!quiet) {
        setRoute(null);
        setRouteError(e instanceof Error ? e.message : "길을 찾지 못했어요.");
      }
      return null;
    } finally {
      if (!quiet) setRouting(false);
    }
  }, []);

  // 도착지가 정해지고 내 위치를 알면 경로 찾기 (안내 중이 아닐 때)
  const haveMe = Boolean(me);
  useEffect(() => {
    if (!dest || !me || navigating) return;
    findRoute(me, dest);
    // 내 위치가 조금씩 바뀔 때마다 다시 찾지 않아요 (도착지가 바뀔 때만)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dest?.lat, dest?.lng, haveMe, findRoute]);

  // 3) 경로 위 사고 잦은 곳
  useEffect(() => {
    if (!route || route.path.length < 2) return setHazards([]);
    let cancelled = false;
    const lats = route.path.map((p) => p.lat), lngs = route.path.map((p) => p.lng);
    const pad = 0.003;
    createClient()
      .rpc("bike_hazards_in_box", {
        p_min_lat: Math.min(...lats) - pad,
        p_min_lng: Math.min(...lngs) - pad,
        p_max_lat: Math.max(...lats) + pad,
        p_max_lng: Math.max(...lngs) + pad,
      })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error(error);
          return setHazards([]);
        }
        const c = cumulative(route.path);
        const on: RouteHazard[] = [];
        // 최근 3년 자료에서 같은 장소는 하나로 묶어요
        for (const h of mergeHazards((data ?? []) as BikeHazard[])) {
          const pr = progressOn(route.path, c, h);
          if (pr.offRoute <= h.radius_m + 30) on.push({ ...h, along: pr.along });
        }
        setHazards(on.sort((a, b) => a.along - b.along));
      });
    return () => {
      cancelled = true;
    };
  }, [route]);

  // 4) 안내 중: 위치가 바뀔 때마다 진행 계산·다시 찾기·도착·진동
  useEffect(() => {
    if (!navigating || !route || !me || !dest) return;
    const pr = progressOn(route.path, cum, me, hintRef.current);
    hintRef.current = pr.index;
    setProgress(pr);

    if (distance(me, dest) <= ARRIVE_M || pr.remaining <= ARRIVE_M) {
      if (!arrived) {
        setArrived(true);
        vibrate([200, 100, 200, 100, 400]);
      }
      return;
    }

    // 경로에서 벗어남: 위치가 정확할 때 두 번 연속이면 다시 찾기
    if (pr.offRoute > OFF_ROUTE_M && (accuracy ?? 99) <= 35) offCount.current += 1;
    else offCount.current = 0;
    if (offCount.current >= 2 && Date.now() - lastReroute.current > REROUTE_GAP_MS) {
      lastReroute.current = Date.now();
      offCount.current = 0;
      setRerouting(true);
      vibrate(80);
      findRoute(me, dest, true).finally(() => setRerouting(false));
      return;
    }

    // 꺾는 곳 60m 전에 한 번 진동
    const next = stepAt.findIndex((a, i) => a > pr.along + 3 && !isQuiet(route.steps[i]));
    if (next >= 0 && stepAt[next] - pr.along < 60 && !buzzedSteps.current.has(next)) {
      buzzedSteps.current.add(next);
      vibrate([120, 80, 120]);
    }
    // 사고 잦은 곳 가까워지면 한 번 진동
    for (const h of hazards) {
      const ahead = h.along - pr.along;
      if (ahead > -h.radius_m && ahead < HAZARD_WARN_M && !warnedHazards.current.has(h.id)) {
        warnedHazards.current.add(h.id);
        vibrate([300, 120, 300]);
      }
    }
    // 위치가 바뀔 때만 계산해요
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.lat, me?.lng, navigating, route]);

  // 화면 꺼짐 막기 (안내 중)
  useEffect(() => {
    if (!navigating) return;
    let released = false;
    const request = async () => {
      try {
        const nav = navigator as Navigator & { wakeLock?: { request(type: "screen"): Promise<WakeLockLike> } };
        const lock = (await nav.wakeLock?.request("screen")) ?? null;
        if (released) lock?.release().catch(() => {});
        else wakeRef.current = lock;
      } catch {
        /* 지원하지 않는 브라우저 */
      }
    };
    request();
    // 다른 앱에 다녀오면 다시 걸어요
    const onVisible = () => document.visibilityState === "visible" && request();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      released = true;
      document.removeEventListener("visibilitychange", onVisible);
      wakeRef.current?.release().catch(() => {});
      wakeRef.current = null;
    };
  }, [navigating]);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (q.length < 2) return;
    setSearching(true);
    setSearchError("");
    try {
      const at = me ?? DEFAULT_CENTER;
      const r = await fetch(`/api/geo/search?q=${encodeURIComponent(q)}&lat=${at.lat.toFixed(4)}&lng=${at.lng.toFixed(4)}`);
      const j = (await r.json()) as { results?: PlaceResult[]; error?: string };
      if (!r.ok || j.error) throw new Error(j.error ?? "검색하지 못했어요.");
      // 서버가 이미 정확도·거리 순으로 정렬해서 보내요
      const list = j.results ?? [];
      setResults(list);
    } catch (err) {
      setResults(null);
      setSearchError(err instanceof Error ? err.message : "검색하지 못했어요.");
    } finally {
      setSearching(false);
    }
  }

  function choose(d: Dest) {
    setDest(d);
    setResults(null);
    setQuery("");
    setArrived(false);
  }

  function start() {
    if (!route || !me) return;
    setArrived(false);
    setProgress(null);
    hintRef.current = 0;
    offCount.current = 0;
    buzzedSteps.current.clear();
    warnedHazards.current.clear();
    rec.begin();
    setNavigating(true);
  }

  function stop() {
    setNavigating(false);
    setProgress(null);
    setFitKey((k) => k + 1);
    // 기록 중이었으면 저장 창이 떠요
    rec.end();
  }

  // --- 안내 중 화면 -------------------------------------------------------
  if (navigating && route && dest) {
    const along = progress?.along ?? 0;
    const nextIdx = stepAt.findIndex((a, i) => a > along + 3 && !isQuiet(route.steps[i]));
    const next = nextIdx >= 0 ? route.steps[nextIdx] : null;
    const toNext = nextIdx >= 0 ? stepAt[nextIdx] - along : 0;
    const Arrow = next ? ARROWS[stepArrow(next)] : Flag;
    const remaining = progress?.remaining ?? route.distance;
    const speed = route.duration > 0 ? route.distance / route.duration : 4.2;
    const eta = new Date(Date.now() + (remaining / speed) * 1000);
    const hazardAhead = hazards.find((h) => h.along - along > -h.radius_m && h.along - along < HAZARD_WARN_M);

    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-slate-100">
        {/* 다음 안내 */}
        <div className="z-10 flex-none bg-brand-700 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-white shadow-lift">
          {arrived ? (
            <div className="flex items-center gap-3 py-2">
              <Flag aria-hidden className="h-10 w-10 flex-none" />
              <div>
                <p className="text-2xl font-extrabold">도착했어요!</p>
                <p className="text-sm text-white/85">{dest.name}</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3" aria-live="polite">
              <Arrow aria-hidden className="h-12 w-12 flex-none" strokeWidth={2.6} />
              <div className="min-w-0">
                <p className="text-3xl font-extrabold tabular-nums">{next ? formatMeters(toNext) : formatMeters(remaining)}</p>
                <p className="text-[17px] font-semibold leading-snug">{next ? stepText(next) : "목적지까지 길을 따라가세요"}</p>
              </div>
            </div>
          )}
          {rerouting && (
            <p className="mt-2 flex items-center gap-1.5 text-sm text-white/90">
              <LoaderCircle aria-hidden className="h-4 w-4 animate-spin" />
              길을 벗어나서 다시 찾고 있어요...
            </p>
          )}
        </div>
        {hazardAhead && !arrived && (
          <div className="z-10 flex flex-none items-center gap-2 bg-orange-500 px-4 py-2.5 text-white" role="alert">
            <AlertTriangle aria-hidden className="h-6 w-6 flex-none" />
            <p className="text-[15px] font-bold leading-snug">
              {hazardAhead.along - along > 30 ? `${formatMeters(hazardAhead.along - along)} 앞` : "지금"} 자전거 사고가 잦은 곳이에요. 속도를 줄이세요.
            </p>
          </div>
        )}

        <BikeMap
          className="min-h-0 flex-1 rounded-none ring-0"
          route={route.path}
          passedIndex={progress?.index ?? 0}
          destination={dest}
          current={me}
          follow
          circles={hazards}
        />

        {/* 남은 거리·도착 예정 */}
        <div className="z-10 flex flex-none items-center gap-3 bg-white px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-4px_12px_rgba(15,23,42,.08)]">
          <div className="min-w-0 flex-1">
            <p className="text-xl font-extrabold tabular-nums">
              {formatMeters(remaining)} · {formatDuration(remaining / speed)}
            </p>
            <p className="text-[13px] text-ink-muted">
              {eta.toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" })} 도착 예정
              {accuracy != null && accuracy > 35 && " · 위치가 약해요"}
            </p>
            {rec.badge}
          </div>
          <Button variant={arrived ? "primary" : "secondary"} onClick={stop} className="h-12 px-5">
            {arrived ? "끝내기" : "안내 끝"}
          </Button>
        </div>
      </div>
    );
  }

  // --- 준비 화면 ----------------------------------------------------------
  const nextHazards = hazards.length;
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Link href="/ride" className="-ml-2 inline-flex h-10 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-ink-muted hover:bg-slate-100 hover:text-ink">
        <ChevronLeft aria-hidden className="h-4 w-4" />
        라이딩
      </Link>
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">자전거 길 안내</h1>
        <p className="mt-1 text-sm text-ink-muted">자전거로 가기 좋은 길을 찾고, 꺾는 곳과 사고가 잦은 곳을 진동으로 미리 알려 줘요.</p>
      </div>

      <form onSubmit={search} className="flex gap-2">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">도착지 검색</span>
          <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="어디로 갈까요? (장소·주소)"
            enterKeyHint="search"
            className="h-12 w-full rounded-xl border border-line bg-white pl-11 pr-3 text-[16px] focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          />
        </label>
        <Button type="submit" loading={searching} className="h-12" disabled={query.trim().length < 2}>
          검색
        </Button>
      </form>
      {searchError && <p className="text-[13px] text-rose-600">{searchError}</p>}
      {results && (
        <Card className="divide-y divide-line/70 p-0">
          {results.length === 0 ? (
            <p className="p-4 text-sm leading-relaxed text-ink-muted">찾는 곳이 없어요. 다른 이름이나 주소로 찾거나, 아래 지도를 눌러 도착지를 골라 주세요.</p>
          ) : (
            results.map((r, i) => (
              <button key={i} type="button" onClick={() => choose({ lat: r.lat, lng: r.lng, name: r.name })} className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-slate-50">
                <MapPin aria-hidden className="mt-0.5 h-5 w-5 flex-none text-ink-faint" />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">
                    {r.name}
                    {r.category && <span className="ml-1.5 text-[12px] font-normal text-ink-faint">{r.category}</span>}
                  </span>
                  <span className="block truncate text-[13px] text-ink-muted">{r.address}</span>
                </span>
                {me && <span className="flex-none text-[13px] font-semibold text-ink-muted">{formatMeters(distance(me, r))}</span>}
              </button>
            ))
          )}
        </Card>
      )}

      <div className="relative">
        <BikeMap
          className="h-[44vh] min-h-72"
          route={route?.path ?? null}
          destination={dest}
          current={me}
          center={dest ?? me}
          circles={hazards}
          fitKey={fitKey}
          onMapClick={(p) => choose({ ...p, name: "지도에서 고른 곳" })}
        />
        {!dest && (
          <p className="pointer-events-none absolute inset-x-3 top-3 rounded-lg bg-white/90 px-3 py-2 text-center text-[13px] font-semibold text-ink-soft shadow-card">
            지도를 눌러 도착지를 고를 수도 있어요
          </p>
        )}
      </div>

      {locError && <p className="rounded-xl bg-amber-50 p-3 text-[13px] text-amber-900 ring-1 ring-amber-200">{locError}</p>}
      {!me && !locError && <p className="text-center text-sm text-ink-muted">내 위치를 확인하고 있어요...</p>}

      {dest && (
        <Card className="space-y-3 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-ink-muted">도착지</p>
              <p className="text-lg font-bold break-keep">{dest.name}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setDest(null);
                setRoute(null);
                setRouteError("");
              }}
              aria-label="도착지 지우기"
              className="grid h-10 w-10 flex-none place-items-center rounded-full text-ink-muted hover:bg-slate-100"
            >
              <X aria-hidden className="h-5 w-5" />
            </button>
          </div>
          {routing && (
            <p className="flex items-center gap-1.5 text-sm text-ink-muted">
              <LoaderCircle aria-hidden className="h-4 w-4 animate-spin" />
              자전거 길을 찾고 있어요...
            </p>
          )}
          {routeError && <p className="text-sm text-rose-600">{routeError}</p>}
          {route && !routing && (
            <>
              <div className="flex items-baseline gap-3">
                <p className="text-2xl font-extrabold tabular-nums">{formatDuration(route.duration)}</p>
                <p className="text-ink-soft">{formatMeters(route.distance)}</p>
              </div>
              <p className={cn("flex items-center gap-1.5 text-sm", nextHazards ? "font-semibold text-orange-700" : "text-ink-muted")}>
                <AlertTriangle aria-hidden className="h-4 w-4" />
                {nextHazards ? `가는 길에 자전거 사고가 잦은 곳이 ${nextHazards}곳 있어요. 가까워지면 알려 드려요.` : "가는 길에 알려진 자전거 사고 다발 지역은 없어요."}
              </p>
              {rec.options}
              <Button full size="lg" onClick={start} disabled={!me} icon={<Navigation aria-hidden className="h-5 w-5" />}>
                안내 시작
              </Button>
              <p className="text-[12px] leading-relaxed text-ink-faint">
                예상 시간은 자전거 평균 속도로 계산해요. 길 정보: © OpenStreetMap 기여자. 실제 도로 상황과 다를 수 있으니 신호와 표지판을 먼저 따라 주세요.
              </p>
            </>
          )}
        </Card>
      )}

      {!dest && (
        <Link href="/spots?kind=pump" className="flex min-h-14 items-center gap-3 rounded-2xl bg-white px-4 py-3 ring-1 ring-line hover:bg-slate-50">
          <Wind aria-hidden className="h-5 w-5 flex-none text-emerald-600" />
          <span className="flex-1 text-[15px] font-semibold">가까운 공기주입기로 길 안내 받기</span>
          <ChevronLeft aria-hidden className="h-4 w-4 flex-none rotate-180 text-ink-faint" />
        </Link>
      )}
      {rec.modal}
    </div>
  );
}
