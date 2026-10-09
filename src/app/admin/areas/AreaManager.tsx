"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Bike, MapPin, Plus, Route, Siren, Tag, Trash2, Undo2, Users } from "lucide-react";
import { LocationPicker, type PickedLocation } from "@/components/map/LocationPicker";
import { Button, Card, Input, useToast } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatDate, friendlyError } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";

export type AreaStat = {
  id: string;
  name: string;
  note: string | null;
  lat: number;
  lng: number;
  radius_m: number;
  created_at: string;
  active_vehicles: number;
  rides_30d: number;
  alerts_total: number;
  alerts_30d: number;
  alerts_resolved: number;
  lost_posts: number;
  lost_resolved: number;
  finder_reports: number;
  finder_reports_30d: number;
  sticker_spots: number;
  /** 되찾은 이동수단 (경보·분실 글 중복 없이, 030) */
  recovered?: number;
};

const RADII = [300, 500, 1000, 1500, 3000, 5000];
const rLabel = (r: number) => (r < 1000 ? `${r}m` : `${r / 1000}km`);
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "-");

/** 관리자: 관심 구역 추가·삭제 + 구역별 숫자 (제휴 제안 자료용) */
export function AreaManager({ areas, today }: { areas: AreaStat[]; today: string }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(areas.length === 0);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [radius, setRadius] = useState(1000);
  const [place, setPlace] = useState<PickedLocation | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function add() {
    if (!name.trim()) return setError("구역 이름을 적어 주세요.");
    if (!place) return setError("지도에서 가운데 위치를 골라 주세요.");
    setError("");
    setBusy("add");
    const { error: err } = await createClient().from("admin_areas").insert({ name: name.trim(), note: note.trim() || null, lat: place.lat, lng: place.lng, radius_m: radius });
    setBusy(null);
    if (err) return setError(friendlyError(err, "추가하지 못했어요."));
    toast.success("구역을 만들었어요.");
    setName("");
    setNote("");
    setPlace(null);
    setOpen(false);
    router.refresh();
  }

  async function remove(a: AreaStat) {
    if (!confirm(`'${a.name}' 구역을 지울까요? (통계 숫자는 다시 만들면 그대로 계산돼요)`)) return;
    setBusy(a.id);
    const { error: err } = await createClient().from("admin_areas").delete().eq("id", a.id);
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
      {areas.map((a) => (
        <Card key={a.id} className="space-y-4">
          {/* 캡처해서 제안서에 쓰기 좋은 요약 */}
          <div className="rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 p-5 text-white">
            <p className="text-[12px] font-semibold text-brand-100">B-LOCK · {today} 기준</p>
            <p className="mt-1 text-xl font-extrabold tracking-tight">{a.name}</p>
            <p className="text-[13px] text-brand-100">반경 {rLabel(a.radius_m)}</p>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <Big label="활동 이동수단" value={a.active_vehicles} unit="대" />
              <Big label="되찾음" value={a.recovered ?? a.alerts_resolved + a.lost_resolved} unit="대" />
              <Big label="발견 제보" value={a.finder_reports} unit="건" />
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-2 text-[14px]">
            <Row icon={Bike} label="활동 이동수단" value={`${a.active_vehicles}대`} hint="세운 곳·라이딩 출발이 이 구역" />
            <Row icon={Route} label="최근 30일 라이딩" value={`${a.rides_30d}회`} />
            <Row icon={Siren} label="도난 경보" value={`${a.alerts_total}건`} hint={`최근 30일 ${a.alerts_30d}건`} />
            <Row icon={Undo2} label="경보 회수율" value={pct(a.alerts_resolved, a.alerts_total)} hint={`되찾음 ${a.alerts_resolved}건`} />
            <Row icon={Users} label="분실 글" value={`${a.lost_posts}건`} hint={`찾음 ${a.lost_resolved}건 · ${pct(a.lost_resolved, a.lost_posts)}`} />
            <Row icon={MapPin} label="발견 제보" value={`${a.finder_reports}건`} hint={`최근 30일 ${a.finder_reports_30d}건`} />
            <Row icon={Tag} label="스티커 받는 곳" value={`${a.sticker_spots}곳`} />
          </dl>
          <div className="flex items-center justify-between gap-2 text-[12px] text-ink-muted">
            <span>{a.note ? a.note : `${formatDate(a.created_at)} 만듦`}</span>
            <Button variant="ghost" className="h-9 px-2" loading={busy === a.id} aria-label={`${a.name} 지우기`} onClick={() => remove(a)}>
              <Trash2 aria-hidden className="h-4 w-4" />
            </Button>
          </div>
        </Card>
      ))}

      <Card className="space-y-3">
        {open ? (
          <>
            <p className="font-bold">관심 구역 만들기</p>
            <Input label="구역 이름" placeholder="예) 울산대 주변 · 무거동 · ○○자전거 가게" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
            <Input label="메모 (선택)" placeholder="예) 총학생회 제안용" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
            <div>
              <p className="mb-1.5 text-sm font-semibold">반경</p>
              <div className="flex flex-wrap gap-2">
                {RADII.map((r) => (
                  <button key={r} type="button" className={chip(radius === r)} aria-pressed={radius === r} onClick={() => setRadius(r)}>
                    {rLabel(r)}
                  </button>
                ))}
              </div>
            </div>
            <LocationPicker label="가운데 위치 (지도를 눌러 핀 꽂기)" value={place} onChange={setPlace} />
            {error && <p className="text-sm text-rose-600">{error}</p>}
            <div className="grid grid-cols-2 gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                취소
              </Button>
              <Button loading={busy === "add"} loadingText="만드는 중..." onClick={add}>
                만들기
              </Button>
            </div>
          </>
        ) : (
          <Button variant="secondary" full icon={<Plus aria-hidden className="h-4 w-4" />} onClick={() => setOpen(true)}>
            관심 구역 추가
          </Button>
        )}
      </Card>
    </div>
  );
}

function Big({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <div className="rounded-xl bg-white/10 px-2 py-3">
      <p className="text-2xl font-extrabold tabular-nums">
        {value}
        <span className="text-sm font-bold">{unit}</span>
      </p>
      <p className="text-[11px] text-brand-100">{label}</p>
    </div>
  );
}

function Row({ icon: Icon, label, value, hint }: { icon: typeof Bike; label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <dt className="flex items-center gap-1.5 text-[12px] text-ink-muted">
        <Icon aria-hidden className="h-3.5 w-3.5" />
        {label}
      </dt>
      <dd className="mt-0.5 font-bold tabular-nums">{value}</dd>
      {hint && <p className="text-[11px] text-ink-muted">{hint}</p>}
    </div>
  );
}
