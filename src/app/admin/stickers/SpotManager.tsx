"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MapPin, Plus, Trash2 } from "lucide-react";
import { LocationPicker, type PickedLocation } from "@/components/map/LocationPicker";
import { Button, Card, Input, useToast } from "@/components/ui";
import { friendlyError } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";

export type AdminSpot = { id: string; name: string; address: string | null; hours: string | null; note: string | null; lat: number; lng: number; active: boolean };

/** 관리자: 스티커 받는 곳 추가·끄기·지우기 (/get-sticker 에 보여요) */
export function SpotManager({ spots }: { spots: AdminSpot[] }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [hours, setHours] = useState("");
  const [note, setNote] = useState("");
  const [place, setPlace] = useState<PickedLocation | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function add() {
    if (!name.trim()) return setError("장소 이름을 적어 주세요.");
    if (!place) return setError("지도에서 위치를 골라 주세요.");
    setError("");
    setBusy("add");
    const { error: err } = await createClient()
      .from("sticker_spots")
      .insert({ name: name.trim(), address: address.trim() || null, hours: hours.trim() || null, note: note.trim() || null, lat: place.lat, lng: place.lng });
    setBusy(null);
    if (err) return setError(friendlyError(err, "추가하지 못했어요."));
    toast.success("받는 곳을 추가했어요.");
    setName("");
    setAddress("");
    setHours("");
    setNote("");
    setPlace(null);
    setOpen(false);
    router.refresh();
  }

  async function toggle(s: AdminSpot) {
    setBusy(s.id);
    const { error: err } = await createClient().from("sticker_spots").update({ active: !s.active }).eq("id", s.id);
    setBusy(null);
    if (err) return toast.error(friendlyError(err, "바꾸지 못했어요."));
    router.refresh();
  }

  async function remove(s: AdminSpot) {
    if (!confirm(`'${s.name}'을(를) 지울까요?`)) return;
    setBusy(s.id);
    const { error: err } = await createClient().from("sticker_spots").delete().eq("id", s.id);
    setBusy(null);
    if (err) return toast.error(friendlyError(err, "지우지 못했어요."));
    router.refresh();
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="font-bold">스티커 받는 곳</h2>
        <a href="/get-sticker" target="_blank" className="text-sm font-semibold text-brand-700 hover:underline">
          사용자 화면 보기
        </a>
      </div>
      <Card className="space-y-3">
        {spots.length === 0 ? (
          <p className="text-[14px] text-ink-muted">아직 없어요. 스티커를 놓아 둔 곳을 추가하면 사용자가 지도로 찾아가요.</p>
        ) : (
          <ul className="divide-y divide-line/70">
            {spots.map((s) => (
              <li key={s.id} className="flex items-center gap-2 py-2.5">
                <MapPin aria-hidden className={`h-4 w-4 flex-none ${s.active ? "text-brand-600" : "text-ink-faint"}`} />
                <div className="min-w-0 flex-1">
                  <p className={`truncate font-semibold ${s.active ? "" : "text-ink-muted line-through"}`}>{s.name}</p>
                  <p className="truncate text-[12px] text-ink-muted">{[s.address, s.hours].filter(Boolean).join(" · ") || "주소 없음"}</p>
                </div>
                <Button variant="secondary" className="h-9 flex-none px-3 text-sm" loading={busy === s.id} onClick={() => toggle(s)}>
                  {s.active ? "끄기" : "켜기"}
                </Button>
                <Button variant="ghost" className="h-9 flex-none px-2" aria-label={`${s.name} 지우기`} onClick={() => remove(s)}>
                  <Trash2 aria-hidden className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
        {open ? (
          <div className="space-y-3 border-t border-line pt-3">
            <Input label="장소 이름" placeholder="예) 울산대 학생회관 1층 안내데스크" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
            <Input label="주소 (선택)" placeholder="예) 울산 남구 대학로 93" value={address} maxLength={120} onChange={(e) => setAddress(e.target.value)} />
            <Input label="받을 수 있는 시간 (선택)" placeholder="예) 평일 9시~18시" value={hours} maxLength={60} onChange={(e) => setHours(e.target.value)} />
            <Input label="안내 (선택)" placeholder="예) 안내데스크에 'B-LOCK 스티커'라고 말해 주세요" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
            <LocationPicker label="위치 (지도를 눌러 핀 꽂기)" value={place} onChange={setPlace} />
            {error && <p className="text-sm text-rose-600">{error}</p>}
            <div className="grid grid-cols-2 gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                취소
              </Button>
              <Button loading={busy === "add"} loadingText="추가 중..." onClick={add}>
                추가하기
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="secondary" full icon={<Plus aria-hidden className="h-4 w-4" />} onClick={() => setOpen(true)}>
            받는 곳 추가
          </Button>
        )}
      </Card>
    </section>
  );
}
