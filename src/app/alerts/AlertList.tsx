"use client";

import Link from "next/link";
import { useState } from "react";
import { Gift, LocateFixed, MapPin, Siren } from "lucide-react";
import { Button, Card, EmptyState, useToast } from "@/components/ui";
import { VehicleImage } from "@/components/vehicle/VehicleImage";
import { distanceLabel, vehicleTitle, wonLabel, type NearbyAlert } from "@/lib/alerts";
import { timeAgo } from "@/lib/format";
import { vehicleImageUrl } from "@/lib/images";
import { createClient } from "@/lib/supabase/client";

export function AlertList({ initial, areaLabel }: { initial: NearbyAlert[]; areaLabel: string | null }) {
  const toast = useToast();
  const [list, setList] = useState(initial);
  const [where, setWhere] = useState(areaLabel ? `${areaLabel} 기준 10km` : "전국");
  const [locating, setLocating] = useState(false);

  function nearMe() {
    if (!navigator.geolocation) return toast.error("이 브라우저에서는 위치를 쓸 수 없어요.");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        // 위치는 저장하지 않고 이번 검색에만 써요
        const { data, error } = await createClient().rpc("nearby_alerts", { p_lat: pos.coords.latitude, p_lng: pos.coords.longitude, p_km: 10 });
        setLocating(false);
        if (error) {
          console.error(error);
          return toast.error("경보를 불러오지 못했어요.");
        }
        setList((data ?? []) as NearbyAlert[]);
        setWhere("지금 위치 기준 10km");
      },
      () => {
        setLocating(false);
        toast.error("위치 권한을 쓸 수 없어요.");
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-ink-muted">{where}</p>
        <Button variant="secondary" className="h-9 px-3 text-sm" loading={locating} loadingText="찾는 중..." icon={<LocateFixed aria-hidden className="h-4 w-4" />} onClick={nearMe}>
          내 위치로 보기
        </Button>
      </div>
      {list.length === 0 ? (
        <EmptyState icon={<Siren className="h-7 w-7" />} title="지금 진행 중인 경보가 없어요" description="다행이에요! 경보가 생기면 여기에 보여요." />
      ) : (
        <ul className="space-y-3">
          {list.map((a) => {
            // 전국 목록은 거리 기준이 없어서 장소만 (빈 '·'가 남지 않게 있는 것만 이어요)
            const place = [a.place_label, where === "전국" ? null : distanceLabel(a.distance_m)].filter(Boolean).join(" · ");
            return (
              <li key={a.id}>
                <Link href={`/alerts/${a.id}`}>
                  <Card className="flex gap-4 p-3 transition-shadow hover:shadow-lift">
                    <VehicleImage src={vehicleImageUrl(a.image_path)} type={a.type} alt={vehicleTitle(a)} className="h-24 w-24 flex-none rounded-xl" />
                    <div className="min-w-0 flex-1 py-0.5">
                      <p className="flex items-center gap-1.5 text-[12px] font-bold text-rose-600">
                        <Siren aria-hidden className="h-3.5 w-3.5" />
                        도난 · {timeAgo(a.lost_at)}
                        {a.police_reported && <span className="text-ink-muted">· 경찰 신고</span>}
                      </p>
                      <p className="mt-0.5 line-clamp-1 font-bold">{vehicleTitle(a)}</p>
                      {place && (
                        <p className="mt-1 flex items-center gap-1 text-[13px] text-ink-muted">
                          <MapPin aria-hidden className="h-3.5 w-3.5 flex-none" />
                          <span className="truncate">{place}</span>
                        </p>
                      )}
                      {a.marks && <p className="mt-0.5 line-clamp-1 text-[13px] text-ink-soft">{a.marks}</p>}
                      {a.bounty_amount && (
                        <p className="mt-0.5 flex items-center gap-1 text-[13px] font-semibold text-brand-700">
                          <Gift aria-hidden className="h-3.5 w-3.5" />
                          사례금 {wonLabel(a.bounty_amount)}
                        </p>
                      )}
                    </div>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
