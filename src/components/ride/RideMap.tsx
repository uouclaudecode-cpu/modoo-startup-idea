"use client";

import { useEffect, useId, useRef, useState } from "react";
import { LocateFixed, MapPinOff } from "lucide-react";
import { Skeleton } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  loadNaverMaps,
  MapUnavailableError,
  onNaverAuthFailure,
  type NaverMaps,
  type NMap,
  type NMarker,
  type NPolyline,
} from "@/lib/naverMap";
import type { LatLng } from "@/lib/ride/geo";

/** 첫 화면 기본 위치: 울산대학교 */
const DEFAULT_CENTER: LatLng = { lat: 35.5437, lng: 129.2563 };
const ROUTE_COLOR = "#2552e8";

type Props = {
  path: LatLng[];
  /** 지금 내 위치 (라이딩 중) */
  current?: LatLng | null;
  /** 라이딩 중: 내 위치를 따라가기 */
  follow?: boolean;
  /** 기록 보기: 경로 전체가 보이게 맞추고 출발·도착 표시 */
  fit?: boolean;
  className?: string;
};

type Mode = "loading" | "naver" | "fallback";

/**
 * 네이버 지도 위에 이동 경로(Polyline)와 내 위치를 그립니다.
 * 지도 키가 없거나 인증에 실패하면 지도 없이 경로 모양만 그려서, 기능은 계속 쓸 수 있어요.
 */
export function RideMap({ path, current = null, follow = false, fit = false, className }: Props) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapsRef = useRef<NaverMaps | null>(null);
  const mapRef = useRef<NMap | null>(null);
  const lineRef = useRef<NPolyline | null>(null);
  const meRef = useRef<NMarker | null>(null);
  const endsRef = useRef<NMarker[]>([]);
  const [mode, setMode] = useState<Mode>("loading");
  const [why, setWhy] = useState<MapUnavailableError["reason"] | null>(null);
  // 사용자가 지도를 끌어서 옮기면 따라가기를 잠시 멈춤
  const [tracking, setTracking] = useState(true);

  // 1) 지도 만들기 (한 번)
  useEffect(() => {
    let cancelled = false;
    const offAuth = onNaverAuthFailure(() => {
      setWhy("auth");
      setMode("fallback");
    });
    loadNaverMaps()
      .then((maps) => {
        if (cancelled || !elRef.current) return;
        mapsRef.current = maps;
        const start = current ?? path[path.length - 1] ?? DEFAULT_CENTER;
        const map = new maps.Map(elRef.current, {
          center: new maps.LatLng(start.lat, start.lng),
          zoom: 16,
          minZoom: 7,
          scaleControl: true,
          mapDataControl: false,
          zoomControl: true,
          zoomControlOptions: { position: maps.Position.TOP_RIGHT },
        });
        mapRef.current = map;
        lineRef.current = new maps.Polyline({
          map,
          path: [],
          strokeColor: ROUTE_COLOR,
          strokeWeight: 6,
          strokeOpacity: 0.9,
          strokeLineCap: "round",
          strokeLineJoin: "round",
        });
        maps.Event.addListener(map, "dragstart", () => setTracking(false));
        setMode("naver");
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        if (!(e instanceof MapUnavailableError) || e.reason !== "no-key") console.error(e);
        setWhy(e instanceof MapUnavailableError ? e.reason : "load");
        setMode("fallback");
      });
    return () => {
      cancelled = true;
      offAuth();
      mapRef.current?.destroy();
      mapRef.current = null;
    };
    // 지도는 처음 한 번만 만들고, 경로·위치는 아래에서 갱신해요.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2) 경로 그리기
  useEffect(() => {
    const maps = mapsRef.current, map = mapRef.current;
    if (mode !== "naver" || !maps || !map || !lineRef.current) return;
    lineRef.current.setPath(path.map((p) => new maps.LatLng(p.lat, p.lng)));

    endsRef.current.forEach((m) => m.setMap(null));
    endsRef.current = [];
    if (fit && path.length > 0) {
      const dot = (bg: string, label: string) => ({
        content: `<div style="transform:translate(-50%,-50%);display:grid;place-items:center;width:28px;height:28px;border-radius:9999px;background:${bg};color:#fff;font:700 12px sans-serif;box-shadow:0 2px 6px rgba(0,0,0,.3);border:2px solid #fff">${label}</div>`,
      });
      const s = path[0], e = path[path.length - 1];
      endsRef.current.push(new maps.Marker({ map, position: new maps.LatLng(s.lat, s.lng), icon: dot("#059669", "출") }));
      if (path.length > 1) endsRef.current.push(new maps.Marker({ map, position: new maps.LatLng(e.lat, e.lng), icon: dot("#e11d48", "도") }));
      if (path.length > 1) {
        let minLat = Infinity, minLng = Infinity, maxLat = -Infinity, maxLng = -Infinity;
        for (const p of path) {
          minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat);
          minLng = Math.min(minLng, p.lng); maxLng = Math.max(maxLng, p.lng);
        }
        map.fitBounds(new maps.LatLngBounds(new maps.LatLng(minLat, minLng), new maps.LatLng(maxLat, maxLng)), { top: 40, right: 40, bottom: 40, left: 40 });
      } else {
        map.setCenter(new maps.LatLng(s.lat, s.lng));
      }
    }
  }, [path, fit, mode]);

  // 3) 내 위치 표시·따라가기
  useEffect(() => {
    const maps = mapsRef.current, map = mapRef.current;
    if (mode !== "naver" || !maps || !map) return;
    if (!current) {
      meRef.current?.setMap(null);
      meRef.current = null;
      return;
    }
    const pos = new maps.LatLng(current.lat, current.lng);
    if (!meRef.current) {
      meRef.current = new maps.Marker({
        map,
        position: pos,
        zIndex: 100,
        icon: {
          content:
            '<div style="transform:translate(-50%,-50%);width:20px;height:20px;border-radius:9999px;background:#2552e8;border:3px solid #fff;box-shadow:0 0 0 6px rgba(37,82,232,.25),0 2px 6px rgba(0,0,0,.3)"></div>',
        },
      });
    } else {
      meRef.current.setPosition(pos);
    }
    if (follow && tracking) map.panTo(pos);
  }, [current, follow, tracking, mode]);

  function recenter() {
    const maps = mapsRef.current, map = mapRef.current;
    if (!maps || !map || !current) return;
    setTracking(true);
    map.panTo(new maps.LatLng(current.lat, current.lng));
  }

  return (
    <div className={cn("relative overflow-hidden rounded-2xl bg-slate-100 ring-1 ring-line", className)}>
      {/* 네이버 지도가 그려지는 자리 (대체 화면일 때는 숨김).
          네이버 지도가 이 요소의 position을 relative로 바꿔서, 바깥 틀로 크기를 잡고 안쪽은 100%로 채워요. */}
      <div className={cn("absolute inset-0", mode !== "naver" && "invisible")}>
        <div ref={elRef} className="h-full w-full" aria-label="라이딩 경로 지도" role="img" />
      </div>
      {mode === "loading" && <Skeleton className="absolute inset-0 rounded-none" />}
      {mode === "fallback" && <PathSketch path={path} current={current} reason={why} />}
      {mode === "naver" && follow && current && !tracking && (
        <button
          type="button"
          onClick={recenter}
          className="absolute bottom-3 right-3 inline-flex h-10 items-center gap-1.5 rounded-full bg-white px-3.5 text-sm font-semibold text-brand-700 shadow-lift ring-1 ring-line"
        >
          <LocateFixed aria-hidden className="h-4 w-4" />내 위치로
        </button>
      )}
    </div>
  );
}

/** 지도를 쓸 수 없을 때: 경로 모양만 그리기 (북쪽이 위) */
function PathSketch({ path, current, reason }: { path: LatLng[]; current: LatLng | null; reason: MapUnavailableError["reason"] | null }) {
  const gridId = `grid${useId().replace(/[^a-zA-Z0-9]/g, "")}`; // url(#...)에 특수문자가 들어가지 않게
  const pts = current ? [...path, current] : path;
  const W = 320, H = 200, pad = 16;
  let d = "", cx: number | null = null, cy: number | null = null, start: [number, number] | null = null;
  if (pts.length > 0) {
    const k = Math.cos((pts[0].lat * Math.PI) / 180);
    const xs = pts.map((p) => p.lng * k), ys = pts.map((p) => p.lat);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const span = Math.max(maxX - minX, maxY - minY, 0.0005);
    const scale = Math.min(W - pad * 2, H - pad * 2) / span;
    const ox = (W - (maxX - minX) * scale) / 2, oy = (H - (maxY - minY) * scale) / 2;
    const proj = (p: LatLng): [number, number] => [ox + (p.lng * k - minX) * scale, H - (oy + (p.lat - minY) * scale)];
    d = path.map((p, i) => `${i ? "L" : "M"}${proj(p).map((v) => v.toFixed(1)).join(" ")}`).join(" ");
    if (path.length) start = proj(path[0]);
    if (current) [cx, cy] = proj(current);
  }
  const message =
    reason === "no-key"
      ? "지도 키를 설정하면 네이버 지도 위에 보여요."
      : reason === "auth"
        ? "네이버 지도 인증에 실패했어요. 웹 서비스 URL 등록을 확인해 주세요."
        : "지도를 불러오지 못했어요. 경로 모양만 보여드려요.";
  return (
    <div className="absolute inset-0 flex flex-col">
      <svg viewBox={`0 0 ${W} ${H}`} className="min-h-0 w-full flex-1" role="img" aria-label="이동 경로 모양">
        <defs>
          <pattern id={gridId} width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M20 0H0V20" fill="none" stroke="#e2e8f0" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width={W} height={H} fill={`url(#${gridId})`} />
        {d && <path d={d} fill="none" stroke={ROUTE_COLOR} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />}
        {start && <circle cx={start[0]} cy={start[1]} r="5" fill="#059669" stroke="#fff" strokeWidth="2" />}
        {cx != null && cy != null && <circle cx={cx} cy={cy} r="7" fill={ROUTE_COLOR} stroke="#fff" strokeWidth="3" />}
      </svg>
      <p className="flex items-center gap-1.5 bg-white/90 px-3 py-2 text-[12px] text-ink-muted">
        <MapPinOff aria-hidden className="h-3.5 w-3.5 flex-none" />
        {message}
      </p>
    </div>
  );
}
