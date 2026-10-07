"use client";

/* eslint-disable @next/next/no-img-element -- 미리보기는 브라우저 안의 임시 주소라 기본 img 사용 */
import { useEffect, useId, useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import { cn } from "@/lib/cn";

type Props = {
  label: string;
  hint?: string;
  value: File | null;
  onChange: (file: File | null) => void;
  error?: string;
};

/** 사진 고르기 (휴대폰에서는 카메라로 바로 찍기도 가능) + 미리보기 */
export function PhotoPicker({ label, hint, value, onChange, error }: Props) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!value) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(value);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-semibold text-ink-soft">
        {label}
      </label>
      {preview ? (
        <div className="relative overflow-hidden rounded-xl ring-1 ring-line">
          <img src={preview} alt="고른 사진 미리보기" className="aspect-[4/3] w-full object-cover" />
          <button
            type="button"
            onClick={() => {
              onChange(null);
              if (inputRef.current) inputRef.current.value = "";
            }}
            className="absolute right-2 top-2 grid h-10 w-10 place-items-center rounded-full bg-slate-900/70 text-white"
            aria-label="사진 지우기"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className={cn(
            "flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed bg-slate-50 text-ink-muted transition-colors hover:border-brand-400 hover:text-brand-700",
            error ? "border-rose-300" : "border-line",
          )}
        >
          <Camera aria-hidden className="h-8 w-8" />
          <span className="text-sm font-semibold">사진 찍기 또는 고르기</span>
        </button>
      )}
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
      {(error || hint) && <p className={cn("text-[13px]", error ? "text-rose-600" : "text-ink-muted")}>{error || hint}</p>}
    </div>
  );
}
