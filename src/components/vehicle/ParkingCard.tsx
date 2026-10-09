import { MapPin, Navigation } from "lucide-react";
import { Card } from "@/components/ui";
import { timeAgo } from "@/lib/format";

export type ParkingSpot = { lat: number; lng: number; note: string | null; parked_at: string };

/** 마지막으로 세운 곳: 라이딩을 마칠 때 저장돼요. 지도 앱으로 바로 찾아가요 */
export function ParkingCard({ spot, vehicleName }: { spot: ParkingSpot | null; vehicleName: string }) {
  if (!spot) return null;
  const label = encodeURIComponent(`${vehicleName} 세운 곳`);
  return (
    <Card className="flex items-center gap-3 p-4">
      <span aria-hidden className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-brand-50 text-brand-600">
        <MapPin className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-bold">마지막으로 세운 곳</p>
        <p className="truncate text-[13px] text-ink-muted">
          {timeAgo(spot.parked_at)}
          {spot.note ? ` · ${spot.note}` : ""}
        </p>
      </div>
      <a
        href={`https://map.kakao.com/link/to/${label},${spot.lat},${spot.lng}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex h-10 flex-none items-center gap-1.5 rounded-xl bg-white px-3 text-sm font-semibold text-ink ring-1 ring-inset ring-line hover:bg-slate-50"
      >
        <Navigation aria-hidden className="h-4 w-4" />
        찾아가기
      </a>
    </Card>
  );
}
