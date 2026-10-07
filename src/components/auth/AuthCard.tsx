import type { ReactNode } from "react";
import { ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui";

export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-md">
      <div className="mb-6 text-center">
        <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-brand-600 text-white">
          <ShieldCheck aria-hidden className="h-6 w-6" />
        </span>
        <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>
      </div>
      <Card className="space-y-4 p-6">{children}</Card>
      <p className="mt-5 text-center text-sm text-ink-muted">{footer}</p>
    </div>
  );
}
