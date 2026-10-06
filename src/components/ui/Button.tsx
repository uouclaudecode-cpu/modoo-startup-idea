import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Spinner } from "./Spinner";

// light·glass: 진한 색 배경(첫 화면 배너 등) 위에서 쓰는 버튼
type Variant = "primary" | "secondary" | "ghost" | "danger" | "light" | "glass";
type Size = "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 whitespace-nowrap";

const variants: Record<Variant, string> = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800",
  secondary: "bg-white text-ink ring-1 ring-inset ring-line hover:bg-slate-50 active:bg-slate-100",
  ghost: "text-ink-soft hover:bg-slate-100 active:bg-slate-200",
  danger: "bg-rose-600 text-white hover:bg-rose-700 active:bg-rose-800",
  light: "bg-white text-brand-700 hover:bg-brand-50 active:bg-brand-100",
  glass: "bg-white/10 text-white ring-1 ring-inset ring-white/40 hover:bg-white/20 active:bg-white/25",
};

// 모바일에서 한 손으로 누르기 쉽도록 최소 높이 44px 이상
const sizes: Record<Size, string> = {
  md: "h-11 px-4 text-[15px]",
  lg: "h-14 px-6 text-base",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", full = false) {
  return cn(base, variants[variant], sizes[size], full && "w-full");
}

type ButtonProps = ComponentProps<"button"> & {
  variant?: Variant;
  size?: Size;
  full?: boolean;
  loading?: boolean;
  /** 로딩 중에 보여줄 글자 (예: "등록 중...") */
  loadingText?: string;
  icon?: ReactNode;
};

export function Button({
  variant,
  size,
  full,
  loading,
  loadingText,
  icon,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(buttonClass(variant, size, full), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner className="h-4 w-4" /> : icon}
      {loading && loadingText ? loadingText : children}
    </button>
  );
}

type ButtonLinkProps = ComponentProps<typeof Link> & {
  variant?: Variant;
  size?: Size;
  full?: boolean;
  icon?: ReactNode;
};

export function ButtonLink({ variant, size, full, icon, className, children, ...rest }: ButtonLinkProps) {
  return (
    <Link className={cn(buttonClass(variant, size, full), className)} {...rest}>
      {icon}
      {children}
    </Link>
  );
}
