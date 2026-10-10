"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 화면 맨 위의 얇은 진행 막대. 다른 화면으로 가는 링크를 누르면 바로 흐르기 시작해서,
 * 새 화면이 열리면 끝까지 채우고 사라져요. (누른 뒤 아무 반응이 없어 보이는 순간을 없애요)
 */
export function NavProgress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [width, setWidth] = useState(0);
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const active = useRef(false);

  const stopTimer = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  }, []);

  const start = useCallback(() => {
    stopTimer();
    active.current = true;
    setVisible(true);
    setWidth(8);
    // 처음엔 빠르게, 끝에 가까울수록 천천히 (90%에서 멈춰 기다려요)
    timer.current = setInterval(() => {
      setWidth((w) => (w >= 90 ? w : w + Math.max(0.6, (90 - w) * 0.08)));
    }, 120);
  }, [stopTimer]);

  // 링크 누르기 → 시작
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const href = a.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("tel:") || href.startsWith("mailto:")) return;
      let url: URL;
      try {
        url = new URL(href, location.href);
      } catch {
        return;
      }
      if (url.origin !== location.origin) return;
      // 같은 화면(주소 뒤 #만 다른 경우 포함)이면 시작하지 않아요
      if (url.pathname === location.pathname && url.search === location.search) return;
      start();
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [start]);

  // 주소가 바뀌면 → 끝까지 채우고 사라지기
  useEffect(() => {
    if (!active.current) return;
    active.current = false;
    stopTimer();
    setWidth(100);
    const t = setTimeout(() => {
      setVisible(false);
      setTimeout(() => setWidth(0), 300);
    }, 250);
    return () => clearTimeout(t);
  }, [pathname, search, stopTimer]);

  // 너무 오래 걸리면(다른 사이트로 가는 등) 조용히 정리
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => {
      stopTimer();
      active.current = false;
      setVisible(false);
      setWidth(0);
    }, 15000);
    return () => clearTimeout(t);
  }, [visible, stopTimer]);

  useEffect(() => stopTimer, [stopTimer]);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[3px] print:hidden"
      style={{ opacity: visible ? 1 : 0, transition: "opacity .3s ease" }}
    >
      <div
        className="relative h-full overflow-hidden rounded-r-full bg-brand-600 shadow-[0_0_8px_rgba(37,82,232,.6)]"
        style={{ width: `${width}%`, transition: width === 0 ? "none" : "width .25s ease-out" }}
      >
        <span className="absolute inset-y-0 left-0 w-1/3 animate-progress-glow bg-gradient-to-r from-transparent via-white/60 to-transparent motion-reduce:hidden" />
      </div>
    </div>
  );
}
