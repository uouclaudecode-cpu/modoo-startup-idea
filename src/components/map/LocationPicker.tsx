"use client";

import { useEffect, useRef, useState } from "react";
import { Crosshair, MapPin, X } from "lucide-react";
import { Button, Skeleton } from "@/components/ui";
import { useCurrentLocation } from "@/lib/location";
import { loadNaverMaps, MapUnavailableError, onNaverAuthFailure, type NaverMaps, type NMap, type NMarker } from "@/lib/naverMap";

export type PickedLocation = { lat: number; lng: number };

const DEFAULT_CENTER: PickedLocation = { lat: 35.5437, lng: 129.2563 }; // 울산대학교

/**
 * 지도에서 위치 고르기: 지도를 누르면 그 자리에 핀이 꽂히고, 핀을 끌어서 옮길 수도 있어요.
 * '현재 위치'로 바로 고를 수도 있어요. 지도를 쓸 수 없으면 현재 위치 버튼만 보여줘요.
 */
export function LocationPicker({ value, onChange, label }: { value: PickedLocation | null; onChange: (v: PickedLocation | null) => void; label: string }) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapsRef = useRef<NaverMaps | null>(null);
  const mapRef = useRef<NMap | null>(null);
  const markerRef = useRef<NMarker | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [mode, setMode] = useState<"loading" | "naver" | "fallback">("loading");
  const loc = useCurrentLocation();

  // 지도 만들기 (한 번)
  useEffect(() => {
    let cancelled = false;
    const offAuth = onNaverAuthFailure(() => setMode("fallback"));
    loadNaverMaps()
      .then((maps) => {
        if (cancelled || !elRef.current) return;
        mapsRef.current = maps;
        const start = value ?? DEFAULT_CENTER;
        const map = new maps.Map(elRef.current, {
          center: new maps.LatLng(start.lat, start.lng),
          zoom: value ? 17 : 15,
          scaleControl: false,
          mapDataControl: false,
          zoomControl: true,
          zoomControlOptions: { position: maps.Position.TOP_RIGHT },
        });
        mapRef.current = map;
        maps.Event.addListener(map, "click", (e) => onChangeRef.current({ lat: e.coord.lat(), lng: e.coord.lng() }));
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
      markerRef.current = null;
    };
    // 지도는 처음 한 번만 만들어요. 핀은 아래에서 따로 갱신해요.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 고른 위치에 핀 표시 (끌어서 옮기기 가능)
  useEffect(() => {
    const maps = mapsRef.current, map = mapRef.current;
    if (mode !== "naver" || !maps || !map) return;
    if (!value) {
      markerRef.current?.setMap(null);
      markerRef.current = null;
      return;
    }
    const pos = new maps.LatLng(value.lat, value.lng);
    if (!markerRef.current) {
      const marker = new maps.Marker({
        map,
        position: pos,
        draggable: true,
        icon: {
          content:
            '<div style="transform:translate(-50%,-100%);display:flex;flex-direction:column;align-items:center"><div style="width:30px;height:30px;border-radius:9999px;background:#e11d48;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35)"></div><div style="width:3px;height:10px;background:#e11d48"></div></div>',
        },
      });
      maps.Event.addListener(marker, "dragend", () => {
        const p = marker.getPosition();
        onChangeRef.current({ lat: p.lat(), lng: p.lng() });
      });
      markerRef.current = marker;
    } else {
      markerRef.current.setPosition(pos);
    }
    map.panTo(pos);
  }, [value, mode]);

  // 현재 위치를 가져오면 그 자리로
  useEffect(() => {
    if (loc.coords) onChangeRef.current({ lat: loc.coords.lat, lng: loc.coords.lng });
  }, [loc.coords]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink-soft">{label}</p>
        {value && (
          <button type="button" onClick={() => onChange(null)} className="inline-flex items-center gap-1 text-[13px] text-ink-muted hover:text-rose-600">
            <X aria-hidden className="h-3.5 w-3.5" />
            핀 지우기
          </button>
        )}
      </div>
      {mode !== "fallback" && (
        <div className="relative isolate h-56 overflow-hidden rounded-xl bg-slate-100 ring-1 ring-line">
          <div className="absolute inset-0">
            <div ref={elRef} className="h-full w-full" role="application" aria-label="지도를 눌러 위치 고르기" />
          </div>
          {mode === "loading" && (
            <div className="absolute inset-0">
              <Skeleton className="h-full w-full rounded-none" />
            </div>
          )}
          {mode === "naver" && !value && (
            <p className="pointer-events-none absolute inset-x-3 bottom-3 rounded-lg bg-white/90 px-3 py-2 text-center text-[13px] font-semibold text-ink-soft shadow-card">
              <MapPin aria-hidden className="mr-1 inline h-4 w-4 align-[-3px] text-rose-600" />
              지도를 눌러 잃어버린 곳에 핀을 꽂아 주세요
            </p>
          )}
        </div>
      )}
      <Button variant="secondary" full loading={loc.locating} loadingText="위치 확인 중..." icon={<Crosshair aria-hidden className="h-4 w-4" />} onClick={loc.locate}>
        지금 있는 곳으로
      </Button>
      {loc.error && <p className="text-[13px] text-orange-700">{loc.error}</p>}
      {mode === "fallback" && value && (
        <p className="text-[13px] text-emerald-700">
          위치를 골랐어요 (위도 {value.lat.toFixed(5)}, 경도 {value.lng.toFixed(5)})
        </p>
      )}
    </div>
  );
}
