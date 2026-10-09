"use client";

import { useId, useState, type ComponentProps, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
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

type InputProps = ComponentProps<"input"> & {
  label: string;
  hint?: ReactNode;
  error?: string;
  /** 비밀번호 칸 오른쪽의 보기/숨기기 버튼 (type="password"일 때 기본으로 보여요) */
  reveal?: boolean;
};

export function Input({ label, hint, error, required, className, type, reveal = true, ...rest }: InputProps) {
  const [shown, setShown] = useState(false);
  const canReveal = type === "password" && reveal;
  return (
    <Field label={label} hint={hint} error={error} required={required}>
      {(id, describedBy) => {
        const input = (
          <input
            id={id}
            type={canReveal && shown ? "text" : type}
            aria-describedby={describedBy}
            aria-invalid={error ? true : undefined}
            required={required}
            // 글자를 보이게 바꿔도 휴대폰 키보드가 첫 글자를 대문자로 바꾸거나 고치지 않게
            {...(canReveal ? { autoCapitalize: "none", autoCorrect: "off", spellCheck: false } : {})}
            className={cn(fieldClass, "h-12", canReveal && "pr-14", error && "border-rose-400", className)}
            {...rest}
          />
        );
        if (!canReveal) return input;
        return (
          <div className="relative">
            {input}
            <button
              type="button"
              onClick={() => setShown((v) => !v)}
              // 누를 때 입력칸 포커스를 뺏지 않아서 휴대폰 키보드가 내려가지 않아요
              onMouseDown={(e) => e.preventDefault()}
              disabled={rest.disabled}
              aria-label={shown ? "비밀번호 숨기기" : "비밀번호 보기"}
              aria-controls={id}
              className="absolute inset-y-0 right-0 grid w-12 place-items-center rounded-r-xl text-ink-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500/40 disabled:opacity-50"
            >
              {shown ? <EyeOff aria-hidden className="h-5 w-5" /> : <Eye aria-hidden className="h-5 w-5" />}
            </button>
          </div>
        );
      }}
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
