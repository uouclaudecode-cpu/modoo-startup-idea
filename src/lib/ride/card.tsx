import { ImageResponse } from "next/og";
import { ogFonts, BrandLogo } from "@/lib/ogImage";
import { shareSegments, type Zone } from "@/lib/ride/export";
import { averageSpeed, formatDistance, formatDuration, type LatLng } from "@/lib/ride/geo";

export type RideCardData = {
  started_at: string;
  moving_sec: number;
  distance_m: number;
  max_speed_kmh: number | null;
  path: LatLng[];
  vehicleName: string | null;
  /** 공유에서 뺄 가림 장소 */
  zones?: Zone[];
  /** 출발·도착 근처를 가리는 거리 (m, 기본 300) */
  trimM?: number;
};

const SIZE = 1080;

/** 경로를 SVG path 문자열로 (북쪽이 위, 가로세로 비율 유지) */
function toSvgPath(segs: LatLng[][], w: number, h: number) {
  const pts = segs.flat();
  if (pts.length < 2) return "";
  const k = Math.cos((pts[0].lat * Math.PI) / 180);
  const xs = pts.map((p) => p.lng * k), ys = pts.map((p) => p.lat);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const span = Math.max(maxX - minX, maxY - minY, 0.0005);
  const s = Math.min(w, h) / span;
  const ox = (w - (maxX - minX) * s) / 2, oy = (h - (maxY - minY) * s) / 2;
  const pt = (p: LatLng) => `${(ox + (p.lng * k - minX) * s).toFixed(1)} ${(oy + (maxY - p.lat) * s).toFixed(1)}`;
  return segs.map((seg) => seg.map((p, i) => `${i ? "L" : "M"}${pt(p)}`).join(" ")).join(" ");
}

/** 라이딩 공유 카드 (정사각형 PNG). 집 근처가 드러나지 않게 앞뒤 300m와 가림 장소는 그리지 않아요 */
export async function renderRideCard(ride: RideCardData) {
  const vehicle = ride.vehicleName ? { name: ride.vehicleName } : null;
  const d = toSvgPath(shareSegments(ride.path, ride.zones ?? [], ride.trimM ?? 300), 840, 520);
  const day = new Date(new Date(ride.started_at).getTime() + 9 * 3600e3).toISOString().slice(0, 10).replace(/-/g, ".");
  const stats: [string, string][] = [
    ["이동 시간", formatDuration(ride.moving_sec)],
    ["평균 속도", `${averageSpeed(ride.distance_m, ride.moving_sec).toFixed(1)} km/h`],
    ["최고 속도", `${(ride.max_speed_kmh ?? 0).toFixed(1)} km/h`],
  ];

  return new ImageResponse(
    (
      <div style={{ width: SIZE, height: SIZE, display: "flex", flexDirection: "column", background: "#0f1b3d", color: "#fff", padding: 64, fontFamily: "Pretendard" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 34 }}>
          <BrandLogo size={44} color="#ffffff" hole="#0f1b3d" />
          <span>B-LOCK 라이딩</span>
          <span style={{ marginLeft: "auto", color: "#a9b8e8", fontSize: 30 }}>{day}</span>
        </div>
        <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center", marginTop: 24 }}>
          {d ? (
            <svg width={840} height={520} viewBox="0 0 840 520">
              <path d={d} fill="none" stroke="#5b8cff" strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <span style={{ color: "#a9b8e8", fontSize: 32 }}>짧은 라이딩이라 경로는 숨겼어요</span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 20 }}>
          <span style={{ fontSize: 120, letterSpacing: -4 }}>{formatDistance(ride.distance_m)}</span>
          {vehicle && <span style={{ fontSize: 34, color: "#a9b8e8" }}>{vehicle.name}</span>}
        </div>
        <div style={{ display: "flex", gap: 20, marginTop: 24 }}>
          {stats.map(([k, v]) => (
            <div key={k} style={{ display: "flex", flexDirection: "column", flex: 1, background: "rgba(255,255,255,.08)", borderRadius: 24, padding: "20px 24px" }}>
              <span style={{ fontSize: 26, color: "#a9b8e8" }}>{k}</span>
              <span style={{ fontSize: 40, marginTop: 6 }}>{v}</span>
            </div>
          ))}
        </div>
      </div>
    ),
    { width: SIZE, height: SIZE, fonts: await ogFonts(), headers: { "cache-control": "private, no-store" } },
  );
}
