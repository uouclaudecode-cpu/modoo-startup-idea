import type { ReactNode } from "react";
import { AlertTriangle, Inbox } from "lucide-react";

type StateProps = {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
};

/** 보여줄 데이터가 없을 때 */
export function EmptyState({ title, description, action, icon }: StateProps) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-line bg-white px-6 py-12 text-center">
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-brand-600">
        {icon ?? <Inbox aria-hidden className="h-7 w-7" />}
      </div>
      <p className="text-base font-bold text-ink">{title}</p>
      {description && <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-ink-muted">{description}</p>}
      {action && <div className="mt-6 w-full max-w-xs">{action}</div>}
    </div>
  );
}

/** 오류가 났을 때 (무엇이 잘못됐고 무엇을 하면 되는지 함께 보여줌) */
export function ErrorState({ title, description, action, icon }: StateProps) {
  return (
    <div role="alert" className="flex flex-col items-center rounded-2xl bg-rose-50/60 px-6 py-12 text-center ring-1 ring-rose-200">
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-white text-rose-600 ring-1 ring-rose-200">
        {icon ?? <AlertTriangle aria-hidden className="h-7 w-7" />}
      </div>
      <p className="text-base font-bold text-ink">{title}</p>
      {description && <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-ink-soft">{description}</p>}
      {action && <div className="mt-6 w-full max-w-xs">{action}</div>}
    </div>
  );
}
