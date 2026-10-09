"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

const mLabel = (m: number) => (m < 1000 ? `${m}m` : `${m / 1000}km`);

/** 거리 고르기: 자주 쓰는 값 버튼 + 직접 입력(m) */
export function MeterPicker({
  value,
  onChange,
  options,
  min,
  max,
  zeroLabel,
  disabled,
}: {
  value: number;
  onChange: (m: number) => void;
  options: number[];
  min: number;
  max: number;
  /** 0일 때 보일 이름 (예: 안 가림) */
  zeroLabel?: string;
  disabled?: boolean;
}) {
  const [custom, setCustom] = useState(options.includes(value) ? "" : String(value));
  const [err, setErr] = useState("");
  const label = (m: number) => (m === 0 && zeroLabel ? zeroLabel : mLabel(m));
  const isCustom = !options.includes(value);

  function apply() {
    const n = Math.round(Number(custom));
    if (!custom || !Number.isFinite(n) || n < min || n > max) return setErr(`${label(min)}~${mLabel(max)} 사이로 적어 주세요.`);
    setErr("");
    onChange(n);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {options.map((m) => (
          <button
            key={m}
            type="button"
            disabled={disabled}
            aria-pressed={value === m}
            onClick={() => {
              setCustom("");
              setErr("");
              onChange(m);
            }}
            className={cn(
              "h-10 rounded-xl px-3 text-[14px] font-semibold ring-1 ring-inset transition-colors disabled:opacity-50",
              value === m ? "bg-brand-600 text-white ring-brand-600" : "bg-white text-ink ring-line hover:bg-slate-50",
            )}
          >
            {label(m)}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          inputMode="numeric"
          aria-label="직접 입력 (미터)"
          placeholder="직접 입력"
          value={custom}
          onChange={(e) => setCustom(e.target.value.replace(/\D/g, "").slice(0, 4))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              apply();
            }
          }}
          className={cn("h-10 w-28 rounded-xl px-3 text-[15px] ring-1 ring-inset focus:ring-2 focus:ring-brand-500", isCustom ? "ring-brand-500" : "ring-line")}
        />
        <span className="text-[14px] text-ink-muted">m</span>
        <button
          type="button"
          disabled={disabled || !custom}
          onClick={apply}
          className="h-10 rounded-xl bg-slate-100 px-3 text-[14px] font-semibold hover:bg-slate-200 disabled:opacity-50"
        >
          적용
        </button>
        {isCustom && <span className="text-[13px] font-semibold text-brand-700">지금 {label(value)}</span>}
      </div>
      {err && <p className="text-[13px] text-rose-600">{err}</p>}
    </div>
  );
}
