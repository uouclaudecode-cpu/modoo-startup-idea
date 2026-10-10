/**
 * 네이버 지도 JavaScript API v3 불러오기 (Client ID는 NEXT_PUBLIC_NAVER_MAP_CLIENT_ID 환경변수)
 * 스크립트는 처음 한 번만 넣고, 이후에는 같은 Promise를 돌려줘요.
 * 쓰는 기능만 최소한으로 타입을 적었어요.
 */

export type NLatLng = { lat(): number; lng(): number };
export type NLatLngBounds = { extend(p: NLatLng): void };
export type NMap = {
  setCenter(p: NLatLng): void;
  panTo(p: NLatLng): void;
  setZoom(z: number): void;
  getZoom(): number;
  getCenter(): NLatLng;
  fitBounds(b: NLatLngBounds, margin?: { top: number; right: number; bottom: number; left: number }): void;
  destroy(): void;
};
export type NPolyline = { setPath(path: NLatLng[]): void; setMap(map: NMap | null): void };
export type NMarker = { setPosition(p: NLatLng): void; getPosition(): NLatLng; setMap(map: NMap | null): void };
/** 자전거도로 레이어 */
export type NLayer = { setMap(map: NMap | null): void };
export type NInfoWindow = { open(map: NMap, anchor: NMarker): void; close(): void; getMap(): NMap | null };
/** 지도 클릭 이벤트: 누른 곳의 좌표 */
export type NPointerEvent = { coord: NLatLng };

export type NaverMaps = {
  Map: new (el: HTMLElement, opts: Record<string, unknown>) => NMap;
  LatLng: new (lat: number, lng: number) => NLatLng;
  LatLngBounds: new (sw: NLatLng, ne: NLatLng) => NLatLngBounds;
  Polyline: new (opts: Record<string, unknown>) => NPolyline;
  Marker: new (opts: Record<string, unknown>) => NMarker;
  Circle: new (opts: Record<string, unknown>) => NLayer;
  InfoWindow: new (opts: Record<string, unknown>) => NInfoWindow;
  Point: new (x: number, y: number) => unknown;
  BicycleLayer?: new () => NLayer;
  Event: { addListener(target: unknown, name: string, fn: (e: NPointerEvent) => void): unknown; removeListener(listener: unknown): void };
  Position: Record<string, unknown>;
};

declare global {
  interface Window {
    naver?: { maps?: NaverMaps };
    /** 네이버 지도가 인증(Client ID·웹 서비스 URL)에 실패하면 부르는 함수 */
    navermap_authFailure?: () => void;
  }
}

export const NAVER_MAP_CLIENT_ID = process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID ?? "";

export class MapUnavailableError extends Error {
  constructor(public reason: "no-key" | "load" | "auth") {
    super(reason);
  }
}

let loader: Promise<NaverMaps> | null = null;
let authFailed = false;
const authListeners = new Set<() => void>();

/** 인증 실패를 알려 받기 (지도를 그린 뒤에 실패가 오는 경우가 있어요) */
export function onNaverAuthFailure(fn: () => void) {
  if (authFailed) fn();
  authListeners.add(fn);
  return () => authListeners.delete(fn);
}

export function loadNaverMaps(): Promise<NaverMaps> {
  if (!NAVER_MAP_CLIENT_ID) return Promise.reject(new MapUnavailableError("no-key"));
  if (authFailed) return Promise.reject(new MapUnavailableError("auth"));
  if (window.naver?.maps) return Promise.resolve(window.naver.maps);
  if (loader) return loader;

  window.navermap_authFailure = () => {
    authFailed = true;
    console.error("네이버 지도 인증 실패: Client ID와 웹 서비스 URL 등록을 확인하세요.");
    authListeners.forEach((fn) => fn());
  };
  loader = new Promise<NaverMaps>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(NAVER_MAP_CLIENT_ID)}`;
    script.async = true;
    script.onload = () => (window.naver?.maps ? resolve(window.naver.maps) : reject(new MapUnavailableError("load")));
    script.onerror = () => {
      loader = null; // 다음에 다시 시도할 수 있게
      script.remove();
      reject(new MapUnavailableError("load"));
    };
    document.head.append(script);
  });
  return loader;
}
