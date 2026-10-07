"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** 아래쪽 버튼 영역 */
  footer?: ReactNode;
};

/**
 * 확인 창. 모바일에서는 아래에서 올라오는 시트, 넓은 화면에서는 가운데 창으로 보입니다.
 * ESC 키와 바깥 영역 클릭으로 닫을 수 있습니다.
 */
export function Modal({ open, onClose, title, children, footer }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  // onClose는 그릴 때마다 새 함수일 수 있어요. ref에 담아 두고 열릴 때 한 번만 준비해야
  // 입력칸에 글자를 칠 때마다 포커스가 창으로 튀지 않아요.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCloseRef.current();
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="relative w-full max-w-md rounded-t-3xl bg-white p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-lift outline-none sm:rounded-3xl"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-lg font-bold text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="-m-2 grid h-10 w-10 place-items-center rounded-full text-ink-muted hover:bg-slate-100"
            aria-label="닫기"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="text-[15px] leading-relaxed text-ink-soft">{children}</div>
        {footer && <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{footer}</div>}
      </div>
    </div>
  );
}
