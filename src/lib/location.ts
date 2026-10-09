"use client";

import { useState } from "react";

export type Coords = { lat: number; lng: number; accuracy: number };

const DENIED = "위치 권한을 쓸 수 없어요. 위치를 직접 입력해 주세요.";

/** 브라우저 위치 권한으로 현재 위치를 한 번만 가져옵니다. (실시간 추적 아님) */
export function useCurrentLocation() {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");

  function locate() {
    setError("");
    if (!navigator.geolocation) {
      setError(DENIED);
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy) });
        setLocating(false);
      },
      () => {
        setLocating(false);
        setError(DENIED);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  }

  return { coords, locating, error, locate, clear: () => setCoords(null) };
}
