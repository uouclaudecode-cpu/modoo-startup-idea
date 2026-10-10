"use client";

import { useEffect, useRef, useState } from "react";
import { Bike, LocateFixed, MapPinOff } from "lucide-react";
import { Skeleton } from "@/components/ui";
import { cn } from "@/lib/cn";
import { loadNaverMaps, MapUnavailableError, onNaverAuthFailure, type NaverMaps, type NLayer, type NMap, type NMarker, type NPolyline } from "@/lib/naverMap";
import type { LatLng } from "@/lib/ride/geo";

/** 첫 화면 기본 위치: 울산대학교 */
export const DEFAULT_CENTER: LatLng = { lat: 35.5437, lng: 129.2563 };

export type BikeMapPin = LatLng & {
  id: string;
  /** 핀 안 짧은 글자·기호 */
  mark: string;
  color: string;
  selected?: boolean;
};

/** 주황 원 (자전거 사고 잦은 곳) */
export type BikeMapCircle = LatLng & { radius_m: number };

type Props = {
  pins?: BikeMapPin[];
  circles?: BikeMapCircle[];
  onPinClick?: (id: string) => void;
  /** 길 안내 경로 */
  route?: LatLng[] | null;
  /** 지나온 부분 (흐리게) */
  passedIndex?: number;
  destination?: LatLng | null;
  current?: LatLng | null;
  /** 내 위치 따라가기 (길 안내 중) */
  follow?: boolean;
  /** 지도를 누르면 그 자리 */
  onMapClick?: (p: LatLng) => void;
  /** 지도를 옮긴 뒤 멈추면 가운데 위치 */
  onMoved?: (center: LatLng) => void;
  /** 이 값이 바뀌면 경로(없으면 핀) 전체가 보이게 맞춰요 */
  fitKey?: string | number;
  /** 처음 가운데 */
  center?: LatLng | null;
  /** 이 값이 바뀌면 center로 옮겨요 */
  centerKey?: string | number;
  className?: string;
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * 공기주입기·보관소 지도와 자전거 길 안내에 함께 쓰는 네이버 지도.
 * 지도를 쓸 수 없으면 안내 문구만 보여 주고, 목록·길 안내 글자는 그대로 쓸 수 있어요.
 */
export function BikeMap({ pins = [], circles = [], onPinClick, route, passedIndex = 0, destination, current, follow, onMapClick, onMoved, fitKey, center, centerKey, className }: Props) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapsRef = useRef<NaverMaps | null>(null);
  const mapRef = useRef<NMap | null>(null);
  const routeRef = useRef<NPolyline | null>(null);
  const passedRef = useRef<NPolyline | null>(null);
  const meRef = useRef<NMarker | null>(null);
  const destRef = useRef<NMarker | null>(null);
  const pinRefs = useRef<NMarker[]>([]);
  const circleRefs = useRef<NLayer[]>([]);
  const bikeRef = useRef<NLayer | null>(null);
  const cb = useRef({ onPinClick, onMapClick, onMoved });
  cb.current = { onPinClick, onMapClick, onMoved };
  const [mode, setMode] = useState<"loading" | "naver" | "fallback">("loading");
  const [tracking, setTracking] = useState(true);
  const [bikeOn, setBikeOn] = useState(false);

  // 1) 지도 만들기 (한 번)
  useEffect(() => {
    let cancelled = false;
    const offAuth = onNaverAuthFailure(() => setMode("fallback"));
    loadNaverMaps()
      .then((maps) => {
        if (cancelled || !elRef.current) return;
        mapsRef.current = maps;
        const start = center ?? current ?? DEFAULT_CENTER;
        const map = new maps.Map(elRef.current, {
          center: new maps.LatLng(start.lat, start.lng),
          zoom: 15,
          minZoom: 7,
          scaleControl: true,
          mapDataControl: false,
          zoomControl: true,
          zoomControlOptions: { position: maps.Position.TOP_RIGHT },
        });
        mapRef.current = map;
        passedRef.current = new maps.Polyline({ map, path: [], strokeColor: "#94a3b8", strokeWeight: 7, strokeOpacity: 0.8, strokeLineCap: "round", strokeLineJoin: "round" });
        routeRef.current = new maps.Polyline({ map, path: [], strokeColor: "#2552e8", strokeWeight: 7, strokeOpacity: 0.9, strokeLineCap: "round", strokeLineJoin: "round" });
        maps.Event.addListener(map, "click", (e) => cb.current.onMapClick?.({ lat: e.coord.lat(), lng: e.coord.lng() }));
        maps.Event.addListener(map, "dragstart", () => setTracking(false));
        maps.Event.addListener(map, "idle", () => {
          const c = map.getCenter();
          cb.current.onMoved?.({ lat: c.lat(), lng: c.lng() });
        });
        setMode("naver");
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        if (!(e instanceof MapUnavailableError) || e.reason !== "no-key") console.error(e);
        setMode("fallback");
      });
    return () => {
      cancelled = true;
      offAuth();
      mapRef.current?.destroy();
      mapRef.current = null;
    };
    // 지도는 한 번만 만들어요
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2) 핀
  const pinsKey = JSON.stringify(pins);
  useEffect(() => {
    const maps = mapsRef.current, map = mapRef.current;
    if (mode !== "naver" || !maps || !map) return;
    pinRefs.current.forEach((m) => m.setMap(null));
    pinRefs.current = (JSON.parse(pinsKey) as BikeMapPin[]).map((p) => {
      const size = p.selected ? 38 : 30;
      const marker = new maps.Marker({
        map,
        position: new maps.LatLng(p.lat, p.lng),
        zIndex: p.selected ? 50 : 10,
        icon: {
          content: `<div style="transform:translate(-50%,-100%);display:flex;flex-direction:column;align-items:center;cursor:pointer"><div style="width:${size}px;height:${size}px;border-radius:9999px;background:${p.color};color:#fff;font:700 ${p.selected ? 15 : 13}px sans-serif;display:grid;place-items:center;border:${p.selected ? 3 : 2}px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35)">${esc(p.mark)}</div><div style="width:2px;height:7px;background:${p.color}"></div></div>`,
        },
      });
      maps.Event.addListener(marker, "click", () => cb.current.onPinClick?.(p.id));
      return marker;
    });
  }, [pinsKey, mode]);

  // 2-1) 사고 잦은 곳 원
  const circlesKey = JSON.stringify(circles);
  useEffect(() => {
    const maps = mapsRef.current, map = mapRef.current;
    if (mode !== "naver" || !maps || !map) return;
    circleRefs.current.forEach((c) => c.setMap(null));
    circleRefs.current = (JSON.parse(circlesKey) as BikeMapCircle[]).map(
      (c) =>
        new maps.Circle({
          map,
          center: new maps.LatLng(c.lat, c.lng),
          radius: c.radius_m,
          fillColor: "#f97316",
          fillOpacity: 0.18,
          strokeColor: "#ea580c",
          strokeOpacity: 0.7,
          strokeWeight: 2,
          clickable: false,
        }),
    );
  }, [circlesKey, mode]);

  // 3) 경로·목적지
  const routeKey = route ? `${route.length}:${route[0]?.lat}:${route[route.length - 1]?.lng}` : "";
  useEffect(() => {
    const maps = mapsRef.current;
    if (mode !== "naver" || !maps || !routeRef.current || !passedRef.current) return;
    const pts = route ?? [];
    const k = Math.min(Math.max(passedIndex, 0), Math.max(pts.length - 1, 0));
    passedRef.current.setPath(pts.slice(0, k + 1).map((p) => new maps.LatLng(p.lat, p.lng)));
    routeRef.current.setPath(pts.slice(k).map((p) => new maps.LatLng(p.lat, p.lng)));
    // 경로 모양이 같으면 지나온 위치만 바뀌어요
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey, passedIndex, mode]);

  useEffect(() => {
    const maps = mapsRef.current, map = mapRef.current;
    if (mode !== "naver" || !maps || !map) return;
    if (!destination) {
      destRef.current?.setMap(null);
      destRef.current = null;
      return;
    }
    const pos = new maps.LatLng(destination.lat, destination.lng);
    if (!destRef.current) {
      destRef.current = new maps.Marker({
        map,
        position: pos,
        zIndex: 80,
        icon: {
          content:
            '<div style="transform:translate(-50%,-100%);display:flex;flex-direction:column;align-items:center"><div style="padding:0 10px;height:30px;border-radius:9999px;background:#e11d48;color:#fff;font:700 13px sans-serif;display:grid;place-items:center;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35)">도착</div><div style="width:2px;height:8px;background:#e11d48"></div></div>',
        },
      });
    } else destRef.current.setPosition(pos);
  }, [destination?.lat, destination?.lng, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // 4) 전체 보기 맞추기
  useEffect(() => {
    const maps = mapsRef.current, map = mapRef.current;
    if (mode !== "naver" || !maps || !map || fitKey === undefined) return;
    const pts: LatLng[] = route?.length ? route : pins;
    if (pts.length === 0) return;
    if (pts.length === 1) return map.setCenter(new maps.LatLng(pts[0].lat, pts[0].lng));
    let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
    for (const p of pts) {
      a = Math.min(a, p.lat); b = Math.min(b, p.lng); c = Math.max(c, p.lat); d = Math.max(d, p.lng);
    }
    map.fitBounds(new maps.LatLngBounds(new maps.LatLng(a, b), new maps.LatLng(c, d)), { top: 60, right: 40, bottom: 40, left: 40 });
  }, [fitKey, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const maps = mapsRef.current, map = mapRef.current;
    if (mode !== "naver" || !maps || !map || !center || centerKey === undefined) return;
    map.setCenter(new maps.LatLng(center.lat, center.lng));
  }, [centerKey, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // 5) 내 위치
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
    } else meRef.current.setPosition(pos);
    if (follow && tracking) {
      map.panTo(pos);
      if (map.getZoom() < 16) map.setZoom(17);
    }
  }, [current?.lat, current?.lng, follow, tracking, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleBike() {
    const maps = mapsRef.current, map = mapRef.current;
    if (!maps?.BicycleLayer || !map) return;
    if (!bikeRef.current) bikeRef.current = new maps.BicycleLayer();
    bikeRef.current.setMap(bikeOn ? null : map);
    setBikeOn(!bikeOn);
  }

  function recenter() {
    const maps = mapsRef.current, map = mapRef.current;
    if (!maps || !map || !current) return;
    setTracking(true);
    map.panTo(new maps.LatLng(current.lat, current.lng));
  }

  return (
    <div className={cn("relative isolate overflow-hidden rounded-2xl bg-slate-100 ring-1 ring-line", className)}>
      <div className={cn("absolute inset-0", mode !== "naver" && "invisible")}>
        <div ref={elRef} className="h-full w-full" role="application" aria-label="지도" />
      </div>
      {mode === "loading" && (
        <div className="absolute inset-0">
          <Skeleton className="h-full w-full rounded-none" />
        </div>
      )}
      {mode === "fallback" && (
        <div className="absolute inset-0 grid place-items-center p-6 text-center">
          <p className="flex items-center gap-1.5 text-[13px] text-ink-muted">
            <MapPinOff aria-hidden className="h-4 w-4 flex-none" />
            지금은 지도를 불러올 수 없어요. 아래 목록과 안내 글자는 그대로 쓸 수 있어요.
          </p>
        </div>
      )}
      {mode === "naver" && mapsRef.current?.BicycleLayer && (
        <button
          type="button"
          onClick={toggleBike}
          aria-pressed={bikeOn}
          className={cn(
            "absolute bottom-3 left-3 inline-flex h-10 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold shadow-lift ring-1",
            bikeOn ? "bg-brand-600 text-white ring-brand-600" : "bg-white text-ink ring-line",
          )}
        >
          <Bike aria-hidden className="h-4 w-4" />
          자전거도로
        </button>
      )}
      {mode === "naver" && current && (!follow || !tracking) && (
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
