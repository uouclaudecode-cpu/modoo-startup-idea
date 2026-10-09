"use client";

import { LocateFixed, MapPin, Navigation, Printer } from "lucide-react";
import { Button, ButtonLink, Card } from "@/components/ui";
import { useCurrentLocation } from "@/lib/location";
import { distance, formatDistance } from "@/lib/ride/geo";

export type Spot = { id: string; name: string; address: string | null; hours: string | null; note: string | null; lat: number; lng: number };

/** 이만큼 안에 받는 곳이 없으면 '직접 출력'을 먼저 권해요 */
const NEAR_M = 3000;

export function SpotList({ spots, printHref }: { spots: Spot[]; printHref: string }) {
  const loc = useCurrentLocation();
  const me = loc.coords;
  const list = me ? [...spots].map((s) => ({ ...s, d: distance(me, s) })).sort((a, b) => a.d - b.d) : spots.map((s) => ({ ...s, d: null as number | null }));
  const nearest = me && list.length ? list[0].d : null;
  const noneNear = spots.length === 0 || (nearest != null && nearest > NEAR_M);

  const printCard = (
    <Card className="space-y-3 bg-gradient-to-br from-brand-50 to-white">
      <p className="flex items-center gap-2 font-bold">
        <Printer aria-hidden className="h-5 w-5 text-brand-600" />
        {noneNear ? "근처에 받는 곳이 없나요? 직접 출력해도 돼요" : "직접 출력해도 돼요"}
      </p>
      <p className="text-[14px] leading-relaxed text-ink-soft">
        B-LOCK 스티커와 똑같이 쓸 수 있어요. 크기를 1.5cm부터 A4 한 장 가득까지 골라서 집 프린터나 편의점에서 뽑으면 돼요. 라벨지에 뽑으면 바로 붙일 수 있고, 일반 종이는 투명 테이프로 덮어 주세요.
      </p>
      <ButtonLink href={printHref} full icon={<Printer aria-hidden className="h-4 w-4" />}>
        QR 출력하기
      </ButtonLink>
    </Card>
  );

  return (
    <div className="space-y-4">
      {noneNear && printCard}

      <Card className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="font-bold">스티커 받는 곳 {spots.length > 0 && <span className="text-ink-muted">{spots.length}곳</span>}</p>
          {spots.length > 0 && (
            <Button variant="secondary" className="h-10 px-3 text-sm" loading={loc.locating} loadingText="찾는 중..." icon={<LocateFixed aria-hidden className="h-4 w-4" />} onClick={loc.locate}>
              가까운 순
            </Button>
          )}
        </div>
        {loc.error && <p className="text-[13px] text-rose-600">{loc.error}</p>}
        {spots.length === 0 ? (
          <p className="rounded-xl bg-slate-50 p-4 text-[14px] leading-relaxed text-ink-muted">아직 스티커를 놓아 둔 곳이 없어요. 곧 학교·가게에 놓을 예정이에요. 그 전까지는 직접 출력해서 써 주세요.</p>
        ) : (
          <ul className="divide-y divide-line/70">
            {list.map((s) => (
              <li key={s.id} className="flex items-start gap-3 py-3">
                <MapPin aria-hidden className="mt-0.5 h-5 w-5 flex-none text-brand-600" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {s.name}
                    {s.d != null && <span className="ml-1.5 text-[13px] font-medium text-brand-700">{formatDistance(s.d)}</span>}
                  </p>
                  {s.address && <p className="text-[13px] text-ink-muted">{s.address}</p>}
                  {s.hours && <p className="text-[13px] text-ink-muted">🕒 {s.hours}</p>}
                  {s.note && <p className="text-[13px] text-ink-soft">{s.note}</p>}
                </div>
                <a
                  href={`https://map.kakao.com/link/to/${encodeURIComponent(s.name)},${s.lat},${s.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-10 flex-none items-center gap-1 rounded-xl bg-white px-3 text-sm font-semibold ring-1 ring-inset ring-line hover:bg-slate-50"
                >
                  <Navigation aria-hidden className="h-4 w-4" />
                  길찾기
                </a>
              </li>
            ))}
          </ul>
        )}
        <p className="text-[12px] text-ink-muted">스티커는 무료예요. 놓인 수량이 다 떨어졌을 수도 있으니 헛걸음이 걱정되면 직접 출력을 추천해요.</p>
      </Card>

      {!noneNear && printCard}
    </div>
  );
}
