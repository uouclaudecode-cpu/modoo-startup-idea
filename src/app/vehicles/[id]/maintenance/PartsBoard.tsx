"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CircleCheckBig, Info, RotateCcw, Settings2 } from "lucide-react";
import { Button, Card, Input, Modal, Textarea, useToast } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatDate, friendlyError } from "@/lib/format";
import {
  intervalText,
  PART_META,
  PART_ORDER,
  PART_STATUS_META,
  partStatus,
  remainingText,
  wearRatio,
  type PartKind,
  type VehiclePart,
} from "@/lib/parts";
import { createClient } from "@/lib/supabase/client";

/** 처음 정해 둔 기본 주기 (DB seed_vehicle_parts 와 같은 값) */
const DEFAULTS: Record<PartKind, { km: number | null; days: number | null }> = {
  tire_pressure: { km: null, days: 14 },
  chain_lube: { km: 250, days: null },
  brake_pad: { km: 2000, days: null },
  chain: { km: 3500, days: null },
  tire: { km: 3500, days: null },
};

const todayKst = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

export function PartsBoard({ parts, now }: { parts: VehiclePart[]; now: number }) {
  const [servicing, setServicing] = useState<VehiclePart | null>(null);
  const [editing, setEditing] = useState<VehiclePart | null>(null);
  const sorted = [...parts].sort((a, b) => PART_ORDER.indexOf(a.kind) - PART_ORDER.indexOf(b.kind));
  const active = sorted.filter((p) => p.enabled);
  const off = sorted.filter((p) => !p.enabled);

  if (parts.length === 0) {
    return <p className="rounded-2xl bg-white p-5 text-sm text-ink-muted ring-1 ring-line">소모품 정보가 아직 없어요. 새로고침해 주세요.</p>;
  }

  return (
    <section aria-labelledby="parts-title" className="space-y-3">
      <h2 id="parts-title" className="text-lg font-bold">
        소모품 상태
      </h2>
      <ul className="space-y-2">
        {active.map((p) => (
          <li key={p.id}>
            <PartCard part={p} now={now} onService={() => setServicing(p)} onEdit={() => setEditing(p)} />
          </li>
        ))}
      </ul>
      {off.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[13px] font-semibold text-ink-muted">사용 안 하는 항목</p>
          {off.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setEditing(p)}
              className="flex w-full items-center gap-2 rounded-xl bg-slate-100 px-3 py-2.5 text-left text-sm text-ink-muted hover:bg-slate-200"
            >
              <span aria-hidden>{PART_META[p.kind].emoji}</span>
              {PART_META[p.kind].label}
              <span className="ml-auto text-[12px]">켜기</span>
            </button>
          ))}
        </div>
      )}
      <p className="flex items-start gap-1.5 text-[12px] leading-relaxed text-ink-muted">
        <Info aria-hidden className="mt-0.5 h-3.5 w-3.5 flex-none" />
        주기의 80%가 되면 &lsquo;점검 필요&rsquo;, 100%가 되면 &lsquo;교체 권장&rsquo;으로 알려드려요. 기본값은 일반 라이더 기준이라, 타는 환경에 맞게 바꿔도
        돼요.
      </p>

      <ServiceModal part={servicing} onClose={() => setServicing(null)} />
      <IntervalModal part={editing} onClose={() => setEditing(null)} />
    </section>
  );
}

function PartCard({ part, now, onService, onEdit }: { part: VehiclePart; now: number; onService: () => void; onEdit: () => void }) {
  const meta = PART_META[part.kind];
  const ratio = wearRatio(part, now);
  const status = partStatus(ratio);
  const st = PART_STATUS_META[status];
  const pct = Math.round(ratio * 100);
  return (
    <Card className={cn("space-y-3 p-4", status === "replace" && "ring-2 ring-rose-300", status === "check" && "ring-2 ring-amber-300")}>
      <div className="flex items-start gap-3">
        <span aria-hidden className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-slate-50 text-xl">
          {meta.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-bold">{meta.label}</p>
            <span className={cn("rounded-full px-2 py-0.5 text-[12px] font-semibold ring-1 ring-inset", st.badge)}>{st.label}</span>
          </div>
          <p className="text-[13px] text-ink-muted">
            {intervalText(part)} · 마지막 정비 {formatDate(part.last_serviced_at)}
          </p>
        </div>
        <button type="button" onClick={onEdit} className="-m-1 grid h-9 w-9 place-items-center rounded-full text-ink-muted hover:bg-slate-100" aria-label={`${meta.label} 주기 설정`}>
          <Settings2 className="h-4 w-4" />
        </button>
      </div>
      <div>
        <div
          className="h-2.5 overflow-hidden rounded-full bg-slate-100"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.min(pct, 100)}
          aria-label={`${meta.label} 마모율 ${pct}%`}
        >
          <div className={cn("h-full rounded-full transition-[width]", st.bar)} style={{ width: `${Math.min(100, Math.max(3, pct))}%` }} />
        </div>
        <div className="mt-1.5 flex justify-between text-[12px]">
          <span className={cn("font-semibold", st.text)}>{remainingText(part, now)}</span>
          <span className="tabular-nums text-ink-muted">
            {part.interval_km ? `${(part.distance_m / 1000).toFixed(1)}km / ${part.interval_km.toLocaleString("ko-KR")}km · ` : ""}
            {pct}%
          </span>
        </div>
      </div>
      {status !== "good" && <p className="text-[13px] leading-relaxed text-ink-soft">{meta.tip}</p>}
      <Button variant={status === "good" ? "secondary" : "primary"} full icon={<CircleCheckBig aria-hidden className="h-4 w-4" />} onClick={onService}>
        정비 완료 ({meta.doneLabel})
      </Button>
    </Card>
  );
}

/** 정비 완료: 날짜·비용·정비소·메모를 남기고 거리를 0으로 */
function ServiceModal({ part, onClose }: { part: VehiclePart | null; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [date, setDate] = useState(todayKst);
  const [cost, setCost] = useState("");
  const [shop, setShop] = useState("");
  const [memo, setMemo] = useState("");
  const [errors, setErrors] = useState<{ date?: string; cost?: string; form?: string }>({});
  const [loading, setLoading] = useState(false);

  function close() {
    if (loading) return;
    setDate(todayKst());
    setCost("");
    setShop("");
    setMemo("");
    setErrors({});
    onClose();
  }

  async function submit() {
    if (!part) return;
    const errs: typeof errors = {};
    if (!date) errs.date = "정비한 날짜를 골라 주세요.";
    else if (date > todayKst()) errs.date = "오늘 이후 날짜는 고를 수 없어요.";
    const costNum = cost.trim() === "" ? null : Number(cost.replace(/[,\s원]/g, ""));
    if (costNum != null && (!Number.isInteger(costNum) || costNum < 0 || costNum > 100000000)) errs.cost = "비용은 숫자(원)로 적어 주세요.";
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setLoading(true);
    const { error } = await createClient().rpc("service_part", {
      p_part: part.id,
      p_serviced_on: date,
      p_cost: costNum,
      p_shop: shop.trim() || null,
      p_memo: memo.trim() || null,
    });
    setLoading(false);
    if (error) {
      console.error(error);
      setErrors({ form: friendlyError(error, "저장하지 못했어요. 다시 시도해 주세요.") });
      return;
    }
    toast.success(`${PART_META[part.kind].label} 정비를 기록했어요. 거리를 0km부터 다시 셀게요.`);
    setLoading(false);
    close();
    router.refresh();
  }

  const meta = part ? PART_META[part.kind] : null;
  return (
    <Modal
      open={Boolean(part)}
      onClose={close}
      title={meta ? `${meta.emoji} ${meta.label} 정비 완료` : ""}
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={loading}>
            취소
          </Button>
          <Button loading={loading} loadingText="저장 중..." onClick={submit}>
            정비 완료 기록
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-[14px]">
          지금까지 달린 거리 <b>{part ? (part.distance_m / 1000).toFixed(1) : 0}km</b>가 이력에 남고, 0km부터 다시 셉니다.
        </p>
        <Input label="정비한 날" type="date" max={todayKst()} value={date} onChange={(e) => setDate(e.target.value)} error={errors.date} required />
        <div className="grid grid-cols-2 gap-3">
          <Input label="비용 (원, 선택)" inputMode="numeric" placeholder="예) 15000" value={cost} onChange={(e) => setCost(e.target.value)} error={errors.cost} />
          <Input label="정비소 (선택)" placeholder="예) 직접 / OO자전거" value={shop} onChange={(e) => setShop(e.target.value)} maxLength={60} />
        </div>
        <Textarea label="메모 (선택)" placeholder="예) 시마노 105 체인으로 교체" value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={500} rows={2} />
        {errors.form && (
          <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
            {errors.form}
          </p>
        )}
      </div>
    </Modal>
  );
}

/** 주기 바꾸기 · 사용 안 함 · 기본값으로 */
function IntervalModal({ part, onClose }: { part: VehiclePart | null; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [km, setKm] = useState("");
  const [days, setDays] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [openedFor, setOpenedFor] = useState<string | null>(null);

  // 모달을 열 때 현재 값으로 채우기
  if (part && openedFor !== part.id) {
    setOpenedFor(part.id);
    setKm(part.interval_km != null ? String(part.interval_km) : "");
    setDays(part.interval_days != null ? String(part.interval_days) : "");
    setEnabled(part.enabled);
    setError("");
  }

  function close() {
    if (loading) return;
    setOpenedFor(null);
    onClose();
  }

  async function save() {
    if (!part) return;
    const kmNum = km.trim() === "" ? null : Number(km);
    const daysNum = days.trim() === "" ? null : Number(days);
    if (kmNum == null && daysNum == null) return setError("거리나 기간 중 하나는 정해 주세요.");
    if (kmNum != null && (!Number.isFinite(kmNum) || kmNum < 1 || kmNum > 100000)) return setError("거리는 1~100,000km 사이로 적어 주세요.");
    if (daysNum != null && (!Number.isInteger(daysNum) || daysNum < 1 || daysNum > 3650)) return setError("기간은 1~3650일 사이 정수로 적어 주세요.");
    setError("");
    setLoading(true);
    const { error: err } = await createClient().from("vehicle_parts").update({ interval_km: kmNum, interval_days: daysNum, enabled }).eq("id", part.id);
    setLoading(false);
    if (err) {
      console.error(err);
      return setError(friendlyError(err, "저장하지 못했어요. 다시 시도해 주세요."));
    }
    toast.success("주기를 바꿨어요.");
    setOpenedFor(null);
    onClose();
    router.refresh();
  }

  const meta = part ? PART_META[part.kind] : null;
  const def = part ? DEFAULTS[part.kind] : null;
  return (
    <Modal
      open={Boolean(part)}
      onClose={close}
      title={meta ? `${meta.emoji} ${meta.label} 주기 설정` : ""}
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={loading}>
            취소
          </Button>
          <Button loading={loading} loadingText="저장 중..." onClick={save}>
            저장
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Input label="거리 주기 (km)" inputMode="decimal" placeholder="비우면 거리 무관" value={km} onChange={(e) => setKm(e.target.value)} />
          <Input label="기간 주기 (일)" inputMode="numeric" placeholder="비우면 기간 무관" value={days} onChange={(e) => setDays(e.target.value)} />
        </div>
        {def && (
          <button
            type="button"
            onClick={() => {
              setKm(def.km != null ? String(def.km) : "");
              setDays(def.days != null ? String(def.days) : "");
            }}
            className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand-700 hover:underline"
          >
            <RotateCcw aria-hidden className="h-3.5 w-3.5" />
            기본값으로 ({def.km ? `${def.km.toLocaleString("ko-KR")}km` : `${def.days}일`})
          </button>
        )}
        <label className="flex cursor-pointer items-center gap-2.5 rounded-xl bg-slate-50 p-3 text-sm">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-4 w-4 accent-brand-600" />
          이 항목 관리하기 (끄면 알림을 보내지 않아요)
        </label>
        {error && (
          <p role="alert" className="text-sm text-rose-600">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
