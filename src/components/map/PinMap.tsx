"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, MapPinOff } from "lucide-react";
import { Skeleton } from "@/components/ui";
import { cn } from "@/lib/cn";
import { kakaoMapLink } from "@/lib/map";
import { loadNaverMaps, MapUnavailableError, onNaverAuthFailure, type NInfoWindow, type NMap, type NMarker } from "@/lib/naverMap";

export type MapPin = {
  lat: number;
  lng: number;
  /** 핀 안에 쓰는 짧은 글자 (예: '분실', '1') */
  mark: string;
  /** 누르면 보이는 설명 */
  label: string;
  color?: "rose" | "orange" | "brand" | "emerald";
};

const COLORS: Record<NonNullable<MapPin["color"]>, string> = {
  rose: "#e11d48",
  orange: "#ea580c",
  brand: "#2552e8",
  emerald: "#059669",
};

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * 여러 위치를 네이버 지도 위에 핀으로 보여줘요. (분실 장소, 발견 제보, 본 위치 댓글)
 * 핀을 누르면 설명이 뜨고, 지도를 쓸 수 없으면 카카오맵 링크 목록으로 대신 보여줘요.
 */
export function PinMap({ pins, className }: { pins: MapPin[]; className?: string }) {
  const elRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<"loading" | "naver" | "fallback">("loading");
  // 핀 목록이 바뀔 때만 다시 그리도록 내용으로 비교
  const pinsKey = JSON.stringify(pins);

  useEffect(() => {
    let cancelled = false;
    let map: NMap | null = null;
    const markers: NMarker[] = [];
    const windows: NInfoWindow[] = [];
    const offAuth = onNaverAuthFailure(() => setMode("fallback"));
    const list: MapPin[] = JSON.parse(pinsKey);

    loadNaverMaps()
      .then((maps) => {
        if (cancelled || !elRef.current || list.length === 0) return;
        map = new maps.Map(elRef.current, {
          center: new maps.LatLng(list[0].lat, list[0].lng),
          zoom: 16,
          scaleControl: false,
          mapDataControl: false,
          // 화면을 스크롤하다가 지도가 확대·축소되지 않게 (확대 버튼·두 손가락 확대는 그대로)
          scrollWheel: false,
          zoomControl: true,
          zoomControlOptions: { position: maps.Position.TOP_RIGHT },
        });
        list.forEach((p) => {
          const color = COLORS[p.color ?? "brand"];
          const marker = new maps.Marker({
            map,
            position: new maps.LatLng(p.lat, p.lng),
            title: p.label,
            icon: {
              content: `<div style="transform:translate(-50%,-100%);display:flex;flex-direction:column;align-items:center"><div style="min-width:30px;height:30px;padding:0 8px;border-radius:9999px;background:${color};color:#fff;font:700 12px sans-serif;display:grid;place-items:center;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3);white-space:nowrap">${escapeHtml(p.mark)}</div><div style="width:2px;height:8px;background:${color}"></div></div>`,
            },
          });
          const info = new maps.InfoWindow({
            content: `<div style="padding:8px 10px;max-width:220px;font:13px/1.45 sans-serif;color:#0f172a">${escapeHtml(p.label)}</div>`,
            borderWidth: 0,
            backgroundColor: "#fff",
            anchorSize: { width: 10, height: 8 },
            pixelOffset: { x: 0, y: -40 },
          });
          maps.Event.addListener(marker, "click", () => {
            windows.forEach((w) => w.close());
            if (map) info.open(map, marker);
          });
          markers.push(marker);
          windows.push(info);
        });
        if (list.length > 1) {
          const lats = list.map((p) => p.lat), lngs = list.map((p) => p.lng);
          map.fitBounds(
            new maps.LatLngBounds(new maps.LatLng(Math.min(...lats), Math.min(...lngs)), new maps.LatLng(Math.max(...lats), Math.max(...lngs))),
            { top: 50, right: 40, bottom: 30, left: 40 },
          );
        }
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
      windows.forEach((w) => w.close());
      markers.forEach((m) => m.setMap(null));
      (map as NMap | null)?.destroy();
    };
  }, [pinsKey]);

  if (pins.length === 0) return null;

  if (mode === "fallback") {
    return (
      <div className="space-y-2 rounded-2xl bg-slate-50 p-4 ring-1 ring-line">
        <p className="flex items-center gap-1.5 text-[13px] text-ink-muted">
          <MapPinOff aria-hidden className="h-4 w-4" />
          지도를 불러오지 못했어요. 위치를 지도 앱에서 열 수 있어요.
        </p>
        <ul className="space-y-1">
          {pins.map((p, i) => (
            <li key={i}>
              <a
                href={kakaoMapLink(p.lat, p.lng, p.label.slice(0, 20))}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline"
              >
                {p.mark} · {p.label.slice(0, 40)} <ExternalLink aria-hidden className="h-3.5 w-3.5" />
              </a>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    // isolate: 지도 안 버튼의 z-index가 바깥 창·메뉴 위로 올라오지 않게
    <div className={cn("relative isolate overflow-hidden rounded-2xl bg-slate-100 ring-1 ring-line", className)}>
      {/* 네이버 지도가 이 요소의 position을 바꾸므로 바깥 틀로 크기를 잡아요 */}
      <div className="absolute inset-0">
        <div ref={elRef} className="h-full w-full" role="img" aria-label={`지도: ${pins.map((p) => p.label).join(", ").slice(0, 200)}`} />
      </div>
      {mode === "loading" && (
        <div className="absolute inset-0">
          <Skeleton className="h-full w-full rounded-none" />
        </div>
      )}
    </div>
  );
}
