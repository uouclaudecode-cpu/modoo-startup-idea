import type { ReactNode } from "react";
import { Card } from "@/components/ui";
import { cn } from "@/lib/cn";

/** 설정 화면의 한 묶음 (제목 + 설명 + 내용) */
export function SettingsSection({ title, description, danger, children }: { title: string; description?: string; danger?: boolean; children: ReactNode }) {
  return (
    <section aria-label={title}>
      <Card className={cn("space-y-4", danger && "ring-rose-200")}>
        <div>
          <h2 className={cn("text-lg font-bold", danger && "text-rose-700")}>{title}</h2>
          {description && <p className="mt-0.5 text-[13px] leading-relaxed text-ink-muted">{description}</p>}
        </div>
        {children}
      </Card>
    </section>
  );
}
