"use client";

import { useState } from "react";
import { CircleCheck, Siren } from "lucide-react";
import { LocationPicker, type PickedLocation } from "@/components/map/LocationPicker";
import { Button, Card, Input, Spinner, useToast } from "@/components/ui";
import { cn } from "@/lib/cn";
import { friendlyError } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";

const RADII = [500, 1000, 2000, 3000];
const radiusText = (r: number) => (r < 1000 ? `${r}m` : `${r / 1000}km`);

type Props = {
  userId: string;
  optIn: boolean;
  lat: number | null;
  lng: number | null;
  label: string | null;
  radius: number;
  quiet: boolean;
};

/** 서버에 저장된 값 (바꾼 내용이 있는지 비교용) */
type Saved = { on: boolean; lat: number | null; lng: number | null; label: string; radius: number; quiet: boolean };

/**
 * 근처 도난 경보 받기: 관심 동네 한 곳 + 반경 + 조용한 시간.
 * 스위치는 위의 알림 스위치처럼 바로 저장돼요.
 * - 끄기: 바로 저장
 * - 켜기: 고른 동네가 있으면 바로 저장, 없으면 동네를 고르고 '이 동네로 경보 받기'를 눌러야 켜져요
 */
export function AlertSettings(p: Props) {
  const toast = useToast();
  const [saved, setSaved] = useState<Saved>({ on: p.optIn, lat: p.lat, lng: p.lng, label: p.label ?? "", radius: p.radius, quiet: p.quiet });
  const [on, setOn] = useState(p.optIn);
  const [area, setArea] = useState<PickedLocation | null>(p.lat != null && p.lng != null ? { lat: p.lat, lng: p.lng } : null);
  const [label, setLabel] = useState(p.label ?? "");
  const [radius, setRadius] = useState(p.radius);
  const [quiet, setQuiet] = useState(p.quiet);
  const [error, setError] = useState("");
  const [toggling, setToggling] = useState(false);
  const [saving, setSaving] = useState(false);

  const hasSavedArea = saved.lat != null && saved.lng != null;
  // 켜 두었지만 아직 저장 전 (고른 동네가 없어서). 저장된 동네로 바로 켜는 중에는 안내를 띄우지 않아요
  const pending = on && !saved.on && !toggling;
  const dirty = on && saved.on && (area?.lat !== saved.lat || area?.lng !== saved.lng || label.trim() !== saved.label || radius !== saved.radius || quiet !== saved.quiet);

  /** 저장된 값으로 되돌리기 (끌 때 저장하지 않은 변경은 버려요) */
  function resetToSaved(s: Saved) {
    setArea(s.lat != null && s.lng != null ? { lat: s.lat, lng: s.lng } : null);
    setLabel(s.label);
    setRadius(s.radius);
    setQuiet(s.quiet);
  }

  async function saveOptIn(next: boolean) {
    // 저장된 행을 돌려받아 정말 바뀌었는지 확인 (권한이 없으면 오류 없이 0행이라)
    const { error: e } = await createClient().from("profiles").update({ alert_opt_in: next }).eq("id", p.userId).select("id").single();
    if (e) throw e;
  }

  async function toggle() {
    const next = !on;
    setError("");
    if (!next) {
      setOn(false);
      resetToSaved(saved);
      if (!saved.on) return; // 켜다가 저장하기 전에 다시 끈 경우: 저장할 것 없음
    } else {
      setOn(true);
      if (!hasSavedArea) return; // 동네를 고른 뒤 아래 버튼으로 저장해요
    }
    setToggling(true);
    try {
      await saveOptIn(next);
      setSaved((s) => ({ ...s, on: next }));
      toast.success(next ? "도난 경보 알림을 켰어요. 휴대폰 알림도 켜져 있어야 받을 수 있어요." : "도난 경보 알림을 껐어요.");
    } catch (err) {
      console.error(err);
      setOn(!next);
      toast.error(friendlyError(err, "설정을 저장하지 못했어요. 잠시 후 다시 시도해 주세요."));
    } finally {
      setToggling(false);
    }
  }

  async function save() {
    setError("");
    if (!area) return setError("관심 동네를 지도에서 골라 주세요.");
    setSaving(true);
    const supabase = createClient();
    try {
      const trimmed = label.trim();
      if (pending || area.lat !== saved.lat || area.lng !== saved.lng || trimmed !== saved.label) {
        // 동네를 저장하면 경보 받기도 함께 켜져요
        const { error: e1 } = await supabase.rpc("set_alert_area", { p_lat: area.lat, p_lng: area.lng, p_label: trimmed || null });
        if (e1) throw e1;
      }
      const { error: e2 } = await supabase
        .from("profiles")
        .update({ alert_opt_in: true, alert_radius_m: radius, alert_quiet: quiet })
        .eq("id", p.userId)
        .select("id")
        .single();
      if (e2) throw e2;
      setSaved({ on: true, lat: area.lat, lng: area.lng, label: trimmed, radius, quiet });
      toast.success(pending ? "도난 경보 알림을 켰어요. 휴대폰 알림도 켜져 있어야 받을 수 있어요." : "경보 설정을 저장했어요.");
    } catch (err) {
      console.error(err);
      setError(friendlyError(err, "저장하지 못했어요."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section id="alerts" aria-label="근처 도난 경보" className="scroll-mt-20">
      <Card className="space-y-4">
        <div className="flex items-start gap-3">
          <Siren aria-hidden className="mt-0.5 h-5 w-5 flex-none text-rose-600" />
          <div className="min-w-0 flex-1">
            <h2 id="alert-settings-title" className="text-lg font-bold">
              근처 도난 경보
            </h2>
            <p className="mt-0.5 text-[13px] leading-relaxed text-ink-muted">
              관심 동네 근처에서 이동수단 도난 경보가 나오면 알려 드려요. 위치는 약 1km 단위로만 저장하고 실시간으로 추적하지 않아요. 하루 최대 3건이에요.
            </p>
          </div>
          <span className="flex flex-none items-center gap-2">
            {toggling && <Spinner className="h-4 w-4 text-ink-muted" />}
            <button
              type="button"
              role="switch"
              aria-checked={on}
              aria-labelledby="alert-settings-title"
              aria-busy={toggling || undefined}
              disabled={toggling || saving}
              onClick={toggle}
              className={cn(
                "relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 disabled:cursor-wait",
                on ? "bg-brand-600" : "bg-slate-300",
              )}
            >
              <span className={cn("h-6 w-6 rounded-full bg-white shadow transition-transform", on ? "translate-x-[22px]" : "translate-x-0.5")} />
            </button>
          </span>
        </div>

        {pending && (
          <p className="rounded-xl bg-amber-50 px-3 py-2.5 text-sm leading-relaxed text-amber-900 ring-1 ring-amber-200">
            아직 켜지지 않았어요. 관심 동네를 지도에서 고른 뒤 아래 <b>이 동네로 경보 받기</b>를 눌러 주세요.
          </p>
        )}

        {on && (
          <>
            <LocationPicker label="관심 동네 (집·학교·회사 근처)" value={area} onChange={setArea} />
            <Input label="동네 이름 (선택)" placeholder="예) 우리 집 근처" value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} />
            <div>
              <p className="mb-2 text-sm font-semibold">받을 반경</p>
              <div className="grid grid-cols-4 gap-2">
                {RADII.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRadius(r)}
                    aria-pressed={radius === r}
                    className={`h-11 rounded-xl text-[15px] font-semibold ring-1 ring-inset transition-colors ${radius === r ? "bg-brand-600 text-white ring-brand-600" : "bg-white text-ink ring-line hover:bg-slate-50"}`}
                  >
                    {radiusText(r)}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 text-[15px]">
              <input type="checkbox" className="h-5 w-5 flex-none accent-brand-600" checked={quiet} onChange={(e) => setQuiet(e.target.checked)} />
              밤 11시 ~ 아침 7시에는 받지 않기
            </label>
          </>
        )}
        {error && (
          <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
            {error}
          </p>
        )}
        {pending || dirty ? (
          <div className="space-y-2">
            {dirty && <p className="text-center text-[13px] font-semibold text-amber-700">저장하지 않은 변경이 있어요.</p>}
            <Button full loading={saving} loadingText="저장 중..." disabled={toggling || (pending && !area)} onClick={save}>
              {pending ? "이 동네로 경보 받기" : "바꾼 내용 저장"}
            </Button>
          </div>
        ) : (
          on && (
            <p className="flex items-start gap-1.5 text-[13px] font-semibold text-emerald-700">
              <CircleCheck aria-hidden className="mt-0.5 h-4 w-4 flex-none" />
              켜져 있어요 · {saved.label || "고른 동네"} 반경 {radiusText(saved.radius)}
            </p>
          )
        )}
      </Card>
    </section>
  );
}
