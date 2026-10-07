"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { evaluateFix, FILTER, simplify, windowSpeedKmh, type Fix, type LatLng, type SpeedSample } from "./geo";

export type RideStatus = "idle" | "riding" | "paused";
export type GpsState = "off" | "searching" | "good" | "weak" | "denied" | "unsupported";

export type RideSnapshot = {
  vehicleId: string;
  startedAt: number;
  /** 일시정지 전까지 쌓인 진행 시간 (ms) */
  activeMs: number;
  /** 지금 진행 중이면 시작 시각, 일시정지면 null */
  activeSince: number | null;
  distance: number;
  movingSec: number;
  maxSpeed: number;
  points: LatLng[];
  /** 마지막으로 저장한 시각 (앱이 닫혔다 다시 열릴 때 진행 시간 계산용) */
  savedAt?: number;
};

export type RideResult = {
  vehicleId: string;
  startedAt: Date;
  endedAt: Date;
  elapsedSec: number;
  movingSec: number;
  distance: number;
  maxSpeed: number;
  path: LatLng[];
};

const STORAGE_KEY = "b-lock:ride-in-progress";
/** 이 시간이 지난 미완료 기록은 이어가지 않아요 */
const RESUME_LIMIT_MS = 12 * 3600e3;
/** 원본 경로가 너무 길어지면 한 번 줄여서 메모리·저장 공간을 아낌 */
const MAX_RAW_POINTS = 20000;

function loadSaved(): RideSnapshot | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as RideSnapshot;
    if (!s.vehicleId || !s.startedAt || Date.now() - s.startedAt > RESUME_LIMIT_MS) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return s;
  } catch {
    return null; // 저장소를 못 쓰는 환경(사생활 보호 모드 등)이면 이어가기 없이 진행
  }
}

function save(s: RideSnapshot | null) {
  try {
    if (s) localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...s, savedAt: Date.now() }));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 저장 실패해도 기록 자체는 화면에서 계속돼요.
  }
}

/** 화면 꺼짐 방지 (지원하는 브라우저만) */
type WakeLockLike = { release(): Promise<void> };
async function requestWakeLock(): Promise<WakeLockLike | null> {
  try {
    const nav = navigator as Navigator & { wakeLock?: { request(type: "screen"): Promise<WakeLockLike> } };
    return (await nav.wakeLock?.request("screen")) ?? null;
  } catch {
    return null;
  }
}

/**
 * 라이딩 기록: 시작 / 일시정지 / 다시 시작 / 종료.
 * - GPS 위치를 받아 걸러낸 뒤(정확도·튐·정차 떨림) 거리와 이동 시간을 계산
 * - 진행 상황을 브라우저에 저장해서, 새로고침하거나 앱이 닫혀도 이어서 기록 가능
 * - 기록 중에는 화면이 꺼지지 않게 요청
 */
export function useRideTracker() {
  const [status, setStatus] = useState<RideStatus>("idle");
  const [gps, setGps] = useState<GpsState>("off");
  const [current, setCurrent] = useState<LatLng | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [snap, setSnap] = useState<RideSnapshot | null>(null);
  const [speed, setSpeed] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [restored, setRestored] = useState<RideSnapshot | null>(null);
  const [wakeLocked, setWakeLocked] = useState(false);

  const snapRef = useRef<RideSnapshot | null>(null);
  const statusRef = useRef<RideStatus>("idle");
  const lastFixRef = useRef<Fix | null>(null);
  const lastMoveAtRef = useRef(0);
  const watchRef = useRef<number | null>(null);
  const wakeRef = useRef<WakeLockLike | null>(null);
  const lastSaveRef = useRef(0);
  /** 최고 속도 계산용 최근 30초 기록 */
  const speedHistRef = useRef<SpeedSample[]>([]);

  const commit = useCallback((next: RideSnapshot | null, persist: "now" | "throttle" = "now") => {
    snapRef.current = next;
    setSnap(next);
    if (persist === "now" || Date.now() - lastSaveRef.current > 5000) {
      save(next);
      lastSaveRef.current = Date.now();
    }
  }, []);

  const setStatusBoth = (s: RideStatus) => {
    statusRef.current = s;
    setStatus(s);
  };

  // 미완료 기록이 있으면 '이어서 기록하기'를 제안 (자동으로 다시 시작하지는 않음)
  useEffect(() => {
    const saved = loadSaved();
    if (saved) {
      // 앱이 닫혀 있던 동안은 기록되지 않았으니, 마지막 저장 시점까지만 진행 시간으로 셉니다.
      const until = saved.savedAt ?? saved.activeSince ?? saved.startedAt;
      const paused: RideSnapshot = {
        ...saved,
        activeMs: saved.activeMs + (saved.activeSince ? Math.max(0, until - saved.activeSince) : 0),
        activeSince: null,
      };
      setRestored(paused);
      commit(paused);
      setStatusBoth("paused");
    }
  }, [commit]);

  const onFix = useCallback(
    (pos: GeolocationPosition) => {
      const fix: Fix = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        t: pos.timestamp || Date.now(),
        speed: pos.coords.speed,
      };
      setAccuracy(Math.round(fix.accuracy));
      setGps(fix.accuracy <= FILTER.maxAccuracy ? "good" : "weak");
      if (fix.accuracy <= 100) setCurrent({ lat: fix.lat, lng: fix.lng });

      const s = snapRef.current;
      if (statusRef.current !== "riding" || !s) return;

      const r = evaluateFix(lastFixRef.current, fix);
      if (r.kind === "reject") return;
      if (r.kind === "first") {
        lastFixRef.current = fix;
        speedHistRef.current.push({ t: fix.t, d: s.distance });
        commit({ ...s, points: [...s.points, { lat: fix.lat, lng: fix.lng }] });
        return;
      }
      if (r.kind === "hold") {
        // 멈춰 있는 동안은 시각만 앞으로 → 다시 출발할 때 정차 시간이 이동 시간에 섞이지 않아요.
        if (r.stopped && lastFixRef.current) lastFixRef.current = { ...lastFixRef.current, t: fix.t };
        return;
      }
      lastFixRef.current = fix;
      lastMoveAtRef.current = Date.now();
      const deviceKmh = fix.speed != null && fix.speed >= 0 ? fix.speed * 3.6 : null;
      const shown = deviceKmh != null && deviceKmh <= FILTER.maxSpeedKmh ? deviceKmh : r.speedKmh;
      setSpeed((prev) => (prev === 0 ? shown : prev * 0.4 + shown * 0.6));
      // 최고 속도: 최근 8초 평균으로 (순간 튐 무시)
      const newDistance = s.distance + r.meters;
      const hist = speedHistRef.current;
      const windowKmh = r.moving ? windowSpeedKmh(hist, fix.t, newDistance) : null;
      hist.push({ t: fix.t, d: newDistance });
      while (hist.length > 2 && fix.t - hist[0].t > 30000) hist.shift();
      let points = [...s.points, { lat: fix.lat, lng: fix.lng }];
      if (points.length > MAX_RAW_POINTS) points = simplify(points, 3, MAX_RAW_POINTS / 2);
      commit(
        {
          ...s,
          distance: newDistance,
          movingSec: s.movingSec + (r.moving ? r.seconds : 0),
          maxSpeed: windowKmh != null && windowKmh <= FILTER.maxSpeedKmh ? Math.max(s.maxSpeed, windowKmh) : s.maxSpeed,
          points,
        },
        "throttle",
      );
    },
    [commit],
  );

  const onError = useCallback((err: GeolocationPositionError) => {
    if (err.code === err.PERMISSION_DENIED) setGps("denied");
    else setGps("weak"); // 시간 초과·일시적 실패: 계속 기다려요
  }, []);

  /** GPS 켜기 (라이딩 전에도 내 위치를 보여주려고 먼저 켬) */
  const startGps = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setGps("unsupported");
      return;
    }
    if (watchRef.current != null) return;
    setGps("searching");
    watchRef.current = navigator.geolocation.watchPosition(onFix, onError, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
  }, [onFix, onError]);

  const stopGps = useCallback(() => {
    if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current);
    watchRef.current = null;
  }, []);

  const lockScreen = useCallback(async () => {
    wakeRef.current = await requestWakeLock();
    setWakeLocked(Boolean(wakeRef.current));
  }, []);
  const unlockScreen = useCallback(() => {
    wakeRef.current?.release().catch(() => {});
    wakeRef.current = null;
    setWakeLocked(false);
  }, []);

  // 화면을 다시 켜면 화면 꺼짐 방지를 다시 요청 (브라우저가 자동으로 풀어요)
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && statusRef.current === "riding") lockScreen();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [lockScreen]);

  // 1초마다 시간 갱신 + 한동안 움직임이 없으면 현재 속도 0
  useEffect(() => {
    if (status !== "riding") return;
    const id = setInterval(() => {
      setNow(Date.now());
      if (Date.now() - lastMoveAtRef.current > 6000) setSpeed(0);
    }, 1000);
    return () => clearInterval(id);
  }, [status]);

  // 화면을 떠날 때 GPS·화면 꺼짐 방지 정리
  useEffect(() => () => {
    if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current);
    wakeRef.current?.release().catch(() => {});
  }, []);

  const start = useCallback(
    (vehicleId: string) => {
      const t = Date.now();
      lastFixRef.current = null;
      lastMoveAtRef.current = 0;
      speedHistRef.current = [];
      setSpeed(0);
      setRestored(null);
      commit({ vehicleId, startedAt: t, activeMs: 0, activeSince: t, distance: 0, movingSec: 0, maxSpeed: 0, points: [] });
      setStatusBoth("riding");
      startGps();
      lockScreen();
    },
    [commit, startGps, lockScreen],
  );

  const pause = useCallback(() => {
    const s = snapRef.current;
    if (!s || statusRef.current !== "riding") return;
    const t = Date.now();
    commit({ ...s, activeMs: s.activeMs + (s.activeSince ? t - s.activeSince : 0), activeSince: null });
    setStatusBoth("paused");
    setSpeed(0);
    unlockScreen();
  }, [commit, unlockScreen]);

  const resume = useCallback(() => {
    const s = snapRef.current;
    if (!s || statusRef.current !== "paused") return;
    // 쉬는 동안 이동한 거리는 넣지 않아요: 다시 시작한 곳부터 새로 셉니다.
    lastFixRef.current = null;
    speedHistRef.current = [];
    setRestored(null);
    commit({ ...s, activeSince: Date.now() });
    setStatusBoth("riding");
    startGps();
    lockScreen();
  }, [commit, startGps, lockScreen]);

  /** 종료: 결과를 돌려주고 진행 상태는 그대로 둠 (저장 성공 후 clear 호출) */
  const finish = useCallback((): RideResult | null => {
    const s = snapRef.current;
    if (!s) return null;
    const t = Date.now();
    const activeMs = s.activeMs + (s.activeSince ? t - s.activeSince : 0);
    const paused = { ...s, activeMs, activeSince: null };
    commit(paused);
    setStatusBoth("paused");
    setSpeed(0);
    unlockScreen();
    return {
      vehicleId: s.vehicleId,
      startedAt: new Date(s.startedAt),
      endedAt: new Date(Math.max(t, s.startedAt + 1000)),
      elapsedSec: Math.round(activeMs / 1000),
      movingSec: Math.round(Math.min(s.movingSec, activeMs / 1000)),
      distance: s.distance,
      maxSpeed: s.maxSpeed,
      path: simplify(s.points),
    };
  }, [commit, unlockScreen]);

  /** 저장했거나 버린 뒤: 처음 상태로 */
  const clear = useCallback(() => {
    commit(null);
    lastFixRef.current = null;
    setRestored(null);
    setStatusBoth("idle");
    setSpeed(0);
  }, [commit]);

  const elapsedSec = snap ? Math.round((snap.activeMs + (snap.activeSince ? now - snap.activeSince : 0)) / 1000) : 0;

  return {
    status,
    gps,
    accuracy,
    current,
    speed: status === "riding" ? speed : 0,
    distance: snap?.distance ?? 0,
    movingSec: snap?.movingSec ?? 0,
    maxSpeed: snap?.maxSpeed ?? 0,
    elapsedSec,
    points: snap?.points ?? [],
    vehicleId: snap?.vehicleId ?? null,
    restored,
    wakeLocked,
    startGps,
    stopGps,
    start,
    pause,
    resume,
    finish,
    clear,
  };
}
