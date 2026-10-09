"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Siren } from "lucide-react";
import { LocationPicker, type PickedLocation } from "@/components/map/LocationPicker";
import { Button, Card, Input, Textarea } from "@/components/ui";
import { friendlyError } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";

const RADII = [500, 1000, 2000, 3000];
const BOUNTIES = [0, 10000, 20000, 30000, 50000];

/** 지금 시각을 datetime-local 값으로 (한국 시간) */
function localNow(offsetMin = 0) {
  const d = new Date(Date.now() - offsetMin * 60000 + 9 * 3600e3);
  return d.toISOString().slice(0, 16);
}

export function AlertForm({
  vehicleId,
  isNew,
  parking = null,
}: {
  vehicleId: string;
  isNew: boolean;
  /** 마지막으로 세운 곳 (라이딩을 마칠 때 저장) */
  parking?: { lat: number; lng: number; note: string | null; parked_at: string } | null;
}) {
  const router = useRouter();
  const [lostAt, setLostAt] = useState(localNow(30));
  const [place, setPlace] = useState<PickedLocation | null>(parking ? { lat: parking.lat, lng: parking.lng } : null);
  const [placeLabel, setPlaceLabel] = useState(parking?.note ?? "");
  const [marks, setMarks] = useState("");
  const [police, setPolice] = useState("");
  const [radius, setRadius] = useState(1000);
  const [bounty, setBounty] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const maxRadius = isNew ? 1000 : police.trim() ? 3000 : 1000;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!place) return setError("잃어버린 곳을 지도에서 골라 주세요.");
    const lost = new Date(`${lostAt}:00+09:00`);
    if (Number.isNaN(lost.getTime())) return setError("잃어버린 시각을 다시 골라 주세요.");
    setLoading(true);
    const { data, error: err } = await createClient().rpc("create_theft_alert", {
      p_vehicle: vehicleId,
      p_lost_at: lost.toISOString(),
      p_lat: place.lat,
      p_lng: place.lng,
      p_place: placeLabel.trim() || null,
      p_radius: Math.min(radius, maxRadius),
      p_marks: marks.trim() || null,
      p_police: police.trim() || null,
      p_bounty: bounty || null,
    });
    setLoading(false);
    if (err) {
      console.error(err);
      return setError(friendlyError(err, "경보를 보내지 못했어요. 잠시 후 다시 시도해 주세요."));
    }
    const d = data as { alert_id: string };
    router.replace(`/alerts/${d.alert_id}?sent=1`);
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Card className="space-y-4">
        <Input label="잃어버린 시각" type="datetime-local" value={lostAt} max={localNow()} onChange={(e) => setLostAt(e.target.value)} />
        <LocationPicker label="잃어버린 곳 (지도를 눌러 핀 꽂기)" value={place} onChange={setPlace} />
        {parking && (
          <p className="-mt-2 rounded-xl bg-brand-50 px-3 py-2 text-[13px] text-brand-800">마지막으로 세운 곳을 미리 넣어 뒀어요. 다른 곳에서 잃어버렸다면 지도에서 옮겨 주세요.</p>
        )}
        <Input label="장소 설명 (선택)" placeholder="예: 학생회관 앞 거치대" value={placeLabel} maxLength={100} onChange={(e) => setPlaceLabel(e.target.value)} />
        <Textarea
          label="눈에 띄는 특징 (선택)"
          placeholder="예: 앞바퀴 흰 림, 안장 오른쪽 찢어짐, 핸들에 빨간 테이프"
          value={marks}
          maxLength={300}
          rows={3}
          onChange={(e) => setMarks(e.target.value)}
        />
      </Card>

      <Card className="space-y-4">
        <Input
          label="경찰 신고 번호 (선택)"
          hint="112에 신고하면 받는 접수 번호예요. 넣으면 '경찰 신고 완료'로 보이고 알림 반경을 3km까지 넓힐 수 있어요."
          value={police}
          maxLength={40}
          onChange={(e) => setPolice(e.target.value)}
        />
        <div>
          <p className="mb-2 text-sm font-semibold">알림 반경</p>
          <div className="grid grid-cols-4 gap-2">
            {RADII.map((r) => (
              <button
                key={r}
                type="button"
                disabled={r > maxRadius}
                onClick={() => setRadius(r)}
                aria-pressed={radius === r}
                className={`h-11 rounded-xl text-[15px] font-semibold ring-1 ring-inset transition-colors disabled:opacity-40 ${radius === r ? "bg-brand-600 text-white ring-brand-600" : "bg-white text-ink ring-line hover:bg-slate-50"}`}
              >
                {r < 1000 ? `${r}m` : `${r / 1000}km`}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[12px] text-ink-muted">
            {isNew ? "등록한 지 하루가 안 된 이동수단은 1km까지만 보낼 수 있어요." : "경찰 신고 번호가 없으면 1km까지 보낼 수 있어요."}
          </p>
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold">찾아 준 분께 사례금 (선택)</p>
          <div className="grid grid-cols-5 gap-2">
            {BOUNTIES.map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => setBounty(b)}
                aria-pressed={bounty === b}
                className={`h-11 rounded-xl text-[14px] font-semibold ring-1 ring-inset transition-colors ${bounty === b ? "bg-brand-600 text-white ring-brand-600" : "bg-white text-ink ring-line hover:bg-slate-50"}`}
              >
                {b === 0 ? "없음" : `${b / 10000}만`}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[12px] leading-relaxed text-ink-muted">
            B-LOCK이 돈을 맡지 않는 &lsquo;약속&rsquo;이에요. 찾으면 도움 된 제보자에게 직접 보내고 앱에서 &lsquo;보냈어요&rsquo;를 눌러 주세요. 약속을 안
            지키면 프로필에 미지급 기록이 남아요.
          </p>
        </div>
      </Card>

      <p className="rounded-xl bg-slate-100 p-3 text-[13px] leading-relaxed text-ink-soft">
        경보는 72시간 동안 진행돼요. 이동수단 상태가 &lsquo;수색 중&rsquo;으로 바뀌고, 안심거래 링크와 양도는 멈춰요. 경보는 30일에 2번까지 보낼 수 있어요.
      </p>
      {error && (
        <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
          {error}
        </p>
      )}
      <Button type="submit" variant="danger" full size="lg" loading={loading} loadingText="보내는 중..." icon={<Siren aria-hidden className="h-5 w-5" />}>
        근처에 도난 경보 보내기
      </Button>
    </form>
  );
}
