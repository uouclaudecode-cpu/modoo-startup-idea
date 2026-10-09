"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** 아래쪽 버튼 영역 */
  footer?: ReactNode;
};

// 아이폰 홈 바 영역만큼 맨 아래 여백 (버튼 영역이 있으면 버튼 영역에, 없으면 내용 영역에)
const SAFE_BOTTOM = "pb-[max(1.5rem,env(safe-area-inset-bottom))]";

/**
 * 확인 창. 모바일에서는 아래에서 올라오는 시트, 넓은 화면에서는 가운데 창으로 보입니다.
 * ESC 키와 바깥 영역 클릭으로 닫을 수 있습니다.
 * 내용이 화면보다 길면 제목줄과 아래 버튼은 그대로 두고 가운데 내용만 스크롤돼요.
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
      {/* 화면보다 커지지 않게 높이를 막고, 가운데 내용 영역만 스크롤 */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="relative flex max-h-[calc(100dvh-1rem)] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-white shadow-lift outline-none sm:max-h-[calc(100dvh-2rem)] sm:rounded-3xl"
      >
        <div className="flex flex-none items-start justify-between gap-4 px-6 pb-3 pt-6">
          <h2 className="text-lg font-bold text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="-m-2 grid h-10 w-10 flex-none place-items-center rounded-full text-ink-muted hover:bg-slate-100"
            aria-label="닫기"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {/* 위쪽 pt-1: 첫 입력칸의 포커스 테두리가 잘리지 않게 */}
        <div
          className={cn(
            "min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pt-1 text-[15px] leading-relaxed text-ink-soft",
            footer ? "pb-2" : SAFE_BOTTOM,
          )}
        >
          {children}
        </div>
        {footer && (
          <div className={cn("flex flex-none flex-col-reverse gap-2 px-6 pt-4 sm:flex-row sm:justify-end", SAFE_BOTTOM)}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
