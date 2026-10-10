import type { ReactNode } from "react";
import { LockLogo } from "@/lib/logo";
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
        <span className="mx-auto mb-3 flex justify-center">
          <LockLogo size={52} />
        </span>
        <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>
      </div>
      <Card className="space-y-4 p-6">{children}</Card>
      <p className="mt-5 text-center text-sm text-ink-muted">{footer}</p>
    </div>
  );
}
