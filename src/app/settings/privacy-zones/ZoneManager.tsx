"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { EyeOff, MapPin, Plus, Sparkles, Trash2 } from "lucide-react";
import { LocationPicker, type PickedLocation } from "@/components/map/LocationPicker";
import { Button, Card, useToast } from "@/components/ui";
import { cn } from "@/lib/cn";
import { friendlyError } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";

export type PrivacyZone = { id: string; label: string; lat: number; lng: number; radius_m: number };
export type ZoneSuggestion = { lat: number; lng: number; count: number };

const RADII = [200, 300, 500, 1000];
const LABELS = ["집", "회사", "학교", "본가"];
const MAX = 3;
const rLabel = (r: number) => (r < 1000 ? `${r}m` : `${r / 1000}km`);

export function ZoneManager({ zones, suggestions }: { zones: PrivacyZone[]; suggestions: ZoneSuggestion[] }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("집");
  const [radius, setRadius] = useState(300);
  const [place, setPlace] = useState<PickedLocation | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const full = zones.length >= MAX;

  async function add(p: { lat: number; lng: number }, name: string, r: number, key: string) {
    if (full) return setError(`가림 장소는 ${MAX}곳까지 정할 수 있어요.`);
    setError("");
    setBusy(key);
    const { error: err } = await createClient().from("privacy_zones").insert({ label: name.trim() || "가림 장소", lat: p.lat, lng: p.lng, radius_m: r });
    setBusy(null);
    if (err) return setError(friendlyError(err, "추가하지 못했어요."));
    toast.success("가림 장소를 정했어요. 이제 공유할 때 이 근처는 빠져요.");
    setOpen(false);
    setPlace(null);
    router.refresh();
  }

  async function remove(z: PrivacyZone) {
    setBusy(z.id);
    const { error: err } = await createClient().from("privacy_zones").delete().eq("id", z.id);
    setBusy(null);
    if (err) return toast.error(friendlyError(err, "지우지 못했어요."));
    router.refresh();
  }

  const chip = (active: boolean) =>
    cn(
      "h-10 rounded-xl px-3 text-[14px] font-semibold ring-1 ring-inset transition-colors",
      active ? "bg-brand-600 text-white ring-brand-600" : "bg-white text-ink ring-line hover:bg-slate-50",
    );

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <p className="font-bold">
          내 가림 장소 <span className="text-ink-muted">{zones.length}/{MAX}</span>
        </p>
        {zones.length === 0 ? (
          <p className="rounded-xl bg-slate-50 p-3 text-[14px] text-ink-muted">아직 없어요. 집이나 회사를 정해 두면 공유할 때 그 근처 길이 빠져요.</p>
        ) : (
          <ul className="divide-y divide-line/70">
            {zones.map((z) => (
              <li key={z.id} className="flex items-center gap-3 py-2.5">
                <span aria-hidden className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-brand-50 text-brand-600">
                  <EyeOff className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{z.label}</p>
                  <p className="text-[13px] text-ink-muted">반경 {rLabel(z.radius_m)} 가림</p>
                </div>
                <Button variant="ghost" className="h-9 flex-none px-2" loading={busy === z.id} aria-label={`${z.label} 지우기`} onClick={() => remove(z)}>
                  <Trash2 aria-hidden className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        {!full &&
          (open ? (
            <div className="space-y-3 border-t border-line pt-3">
              <div>
                <p className="mb-1.5 text-sm font-semibold">이름</p>
                <div className="flex flex-wrap gap-2">
                  {LABELS.map((l) => (
                    <button key={l} type="button" className={chip(label === l)} aria-pressed={label === l} onClick={() => setLabel(l)}>
                      {l}
                    </button>
                  ))}
                </div>
                <input
                  aria-label="이름 직접 입력"
                  placeholder="직접 입력 (예: 헬스장)"
                  value={LABELS.includes(label) ? "" : label}
                  maxLength={30}
                  onChange={(e) => setLabel(e.target.value || "집")}
                  className="mt-2 h-11 w-full rounded-xl px-3 text-[15px] ring-1 ring-inset ring-line focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div>
                <p className="mb-1.5 text-sm font-semibold">가릴 반경</p>
                <div className="grid grid-cols-4 gap-2">
                  {RADII.map((r) => (
                    <button key={r} type="button" className={chip(radius === r)} aria-pressed={radius === r} onClick={() => setRadius(r)}>
                      {rLabel(r)}
                    </button>
                  ))}
                </div>
              </div>
              <LocationPicker label="위치 (지도를 눌러 핀 꽂기)" value={place} onChange={setPlace} />
              {error && <p className="text-sm text-rose-600">{error}</p>}
              <div className="grid grid-cols-2 gap-2">
                <Button variant="ghost" onClick={() => setOpen(false)}>
                  취소
                </Button>
                <Button loading={busy === "add"} loadingText="저장 중..." onClick={() => (place ? add(place, label, radius, "add") : setError("지도에서 위치를 골라 주세요."))}>
                  저장
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="secondary" full icon={<Plus aria-hidden className="h-4 w-4" />} onClick={() => setOpen(true)}>
              가림 장소 추가
            </Button>
          ))}
      </Card>

      {suggestions.length > 0 && !full && (
        <Card className="space-y-3 bg-gradient-to-br from-brand-50 to-white">
          <p className="flex items-center gap-2 font-bold">
            <Sparkles aria-hidden className="h-5 w-5 text-brand-600" />
            자주 출발·도착하는 곳이 있어요
          </p>
          <p className="text-[13px] leading-relaxed text-ink-muted">내 라이딩 기록에서 찾았어요. 집이나 회사라면 가림 장소로 정해 두세요. 이 추천은 나에게만 보여요.</p>
          <ul className="space-y-2">
            {suggestions.map((s, i) => (
              <li key={i} className="flex items-center gap-3 rounded-xl bg-white p-3 ring-1 ring-line">
                <MapPin aria-hidden className="h-5 w-5 flex-none text-brand-600" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">자주 가는 곳 {i + 1}</p>
                  <a
                    href={`https://map.kakao.com/link/map/${encodeURIComponent(`자주 가는 곳 ${i + 1}`)},${s.lat},${s.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[13px] text-brand-700 underline"
                  >
                    {s.count}번 출발·도착 · 지도에서 보기
                  </a>
                </div>
                <Button className="h-9 flex-none px-3 text-sm" loading={busy === `s${i}`} onClick={() => add(s, `자주 가는 곳 ${i + 1}`, 300, `s${i}`)}>
                  가리기
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
