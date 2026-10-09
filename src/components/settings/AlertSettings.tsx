"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Siren } from "lucide-react";
import { LocationPicker, type PickedLocation } from "@/components/map/LocationPicker";
import { Button, Card, Input, useToast } from "@/components/ui";
import { friendlyError } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";

const RADII = [500, 1000, 2000, 3000];

type Props = {
  userId: string;
  optIn: boolean;
  lat: number | null;
  lng: number | null;
  label: string | null;
  radius: number;
  quiet: boolean;
};

/** 근처 도난 경보 받기: 관심 동네 한 곳 + 반경 + 조용한 시간 */
export function AlertSettings(p: Props) {
  const router = useRouter();
  const toast = useToast();
  const [on, setOn] = useState(p.optIn);
  const [area, setArea] = useState<PickedLocation | null>(p.lat != null && p.lng != null ? { lat: p.lat, lng: p.lng } : null);
  const [label, setLabel] = useState(p.label ?? "");
  const [radius, setRadius] = useState(p.radius);
  const [quiet, setQuiet] = useState(p.quiet);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setError("");
    if (on && !area) return setError("관심 동네를 지도에서 골라 주세요.");
    setSaving(true);
    const supabase = createClient();
    try {
      if (on && area) {
        const { error: e1 } = await supabase.rpc("set_alert_area", { p_lat: area.lat, p_lng: area.lng, p_label: label.trim() || null });
        if (e1) throw e1;
      }
      const { error: e2 } = await supabase
        .from("profiles")
        .update({ alert_opt_in: on, alert_radius_m: radius, alert_quiet: quiet })
        .eq("id", p.userId)
        .select("id")
        .single();
      if (e2) throw e2;
      toast.success(on ? "도난 경보 알림을 켰어요. 휴대폰 알림도 켜져 있어야 받을 수 있어요." : "도난 경보 알림을 껐어요.");
      router.refresh();
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
            <h2 className="text-lg font-bold">근처 도난 경보</h2>
            <p className="mt-0.5 text-[13px] leading-relaxed text-ink-muted">
              관심 동네 근처에서 자전거·킥보드 도난 경보가 나오면 알려 드려요. 위치는 약 1km 단위로만 저장하고 실시간으로 추적하지 않아요. 하루 최대 3건이에요.
            </p>
          </div>
          <label className="relative inline-flex flex-none cursor-pointer items-center">
            <input type="checkbox" className="peer sr-only" checked={on} onChange={(e) => setOn(e.target.checked)} aria-label="도난 경보 받기" />
            <span className="h-7 w-12 rounded-full bg-slate-300 transition-colors peer-checked:bg-brand-600" />
            <span className="absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
          </label>
        </div>

        {on && (
          <>
            <LocationPicker label="관심 동네 (집·학교·회사 근처)" value={area} onChange={setArea} />
            <Input label="동네 이름 (선택)" placeholder="예: 울산대 근처" value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} />
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
                    {r < 1000 ? `${r}m` : `${r / 1000}km`}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 text-[15px]">
              <input type="checkbox" className="h-5 w-5 accent-brand-600" checked={quiet} onChange={(e) => setQuiet(e.target.checked)} />
              밤 11시 ~ 아침 7시에는 받지 않기
            </label>
          </>
        )}
        {error && (
          <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
            {error}
          </p>
        )}
        <Button full loading={saving} loadingText="저장 중..." onClick={save}>
          저장
        </Button>
      </Card>
    </section>
  );
}
