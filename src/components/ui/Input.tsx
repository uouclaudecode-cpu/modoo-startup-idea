"use client";

import { useId, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/cn";

const fieldClass =
  "w-full rounded-xl border border-line bg-white px-4 text-[16px] text-ink placeholder:text-ink-faint transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:bg-slate-50 disabled:text-ink-muted";
// 글자 크기 16px: 아이폰에서 입력칸을 누를 때 화면이 확대되지 않도록

type FieldProps = {
  label: string;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  children: (id: string, describedBy?: string) => ReactNode;
};

/** 라벨 + 입력칸 + 도움말/오류를 묶는 틀 */
export function Field({ label, hint, error, required, children }: FieldProps) {
  const id = useId();
  const descId = hint || error ? `${id}-desc` : undefined;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-semibold text-ink-soft">
        {label}
        {required && <span className="ml-0.5 text-rose-600">*</span>}
      </label>
      {children(id, descId)}
      {(error || hint) && (
        <p id={descId} className={cn("text-[13px]", error ? "text-rose-600" : "text-ink-muted")}>
          {error || hint}
        </p>
      )}
    </div>
  );
}

type InputProps = ComponentProps<"input"> & { label: string; hint?: ReactNode; error?: string };

export function Input({ label, hint, error, required, className, ...rest }: InputProps) {
  return (
    <Field label={label} hint={hint} error={error} required={required}>
      {(id, describedBy) => (
        <input
          id={id}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          required={required}
          className={cn(fieldClass, "h-12", error && "border-rose-400", className)}
          {...rest}
        />
      )}
    </Field>
  );
}

type TextareaProps = ComponentProps<"textarea"> & { label: string; hint?: ReactNode; error?: string };

export function Textarea({ label, hint, error, required, className, rows = 3, ...rest }: TextareaProps) {
  return (
    <Field label={label} hint={hint} error={error} required={required}>
      {(id, describedBy) => (
        <textarea
          id={id}
          rows={rows}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          required={required}
          className={cn(fieldClass, "py-3 leading-relaxed", error && "border-rose-400", className)}
          {...rest}
        />
      )}
    </Field>
  );
}
