import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export function Card({ className, ...rest }: ComponentProps<"div">) {
  return <div className={cn("rounded-2xl bg-white p-5 shadow-card ring-1 ring-line/70", className)} {...rest} />;
}

export function CardTitle({ className, ...rest }: ComponentProps<"h2">) {
  return <h2 className={cn("text-lg font-bold tracking-tight text-ink", className)} {...rest} />;
}
