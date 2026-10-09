"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Bike, ChevronRight, Lock, Route, Search, ShieldCheck, Siren, Tag } from "lucide-react";
import { cn } from "@/lib/cn";
import { createClient } from "@/lib/supabase/client";

const SEEN_KEY = "b-lock:intro-seen";

type Slide = { icon: typeof Bike; bg: string; title: string; text: string; points: string[] };

const SLIDES: Slide[] = [
  {
    icon: ShieldCheck,
    bg: "from-brand-500 to-brand-700",
    title: "자전거·킥보드에\n디지털 신분증을",
    text: "B-LOCK은 QR 하나로 내 이동수단을 등록하고, 잃어버렸을 때 주변 사람의 도움으로 찾는 서비스예요.",
    points: ["가입·이용 모두 무료", "QR 스티커 하나면 준비 끝", "이름·전화번호는 공개 안 해요"],
  },
  {
    icon: Tag,
    bg: "from-sky-500 to-brand-600",
    title: "등록하고\nQR을 붙여요",
    text: "사진과 특징을 등록하면 QR이 만들어져요. 원하는 크기로 출력하거나 스티커를 받아서, 안장 밑처럼 주인만 아는 곳에 숨겨 붙여요.",
    points: ["1.5cm부터 A4까지 크기 골라 출력", "받은 스티커는 찍어서 연결", "여러 곳에 붙일수록 좋아요"],
  },
  {
    icon: Siren,
    bg: "from-rose-500 to-rose-700",
    title: "잃어버리면\n근처에 알려요",
    text: "'찾는 중'으로 바꾸고 도난 경보를 보내면 근처 사용자에게 알림이 가요. 누가 QR을 찍으면 위치·사진이 나에게만 와요.",
    points: ["발견한 사람과 번호 없이 익명 대화", "사례금 약속도 걸 수 있어요", "112 신고서도 자동으로 정리"],
  },
  {
    icon: Search,
    bg: "from-emerald-500 to-emerald-700",
    title: "중고 거래도\n안심하고",
    text: "사기 전에 조회 번호나 판매 글로 도난 신고 여부를 확인해요. 팔 때는 인증 링크와 소유권 넘기기로 믿고 거래해요.",
    points: ["로그인 없이 도난 조회", "판매자 인증 링크·정비 이력", "QR·링크로 소유권 넘기기"],
  },
  {
    icon: Route,
    bg: "from-violet-500 to-brand-700",
    title: "타는 날엔\n기록까지",
    text: "라이딩 거리를 기록하면 체인·브레이크·타이어를 언제 바꿀지 알려 줘요. 세워 둔 곳도 저장돼요.",
    points: ["달린 길·속도·고도 기록", "소모품 교체 알림", "마지막으로 세운 곳 찾아가기"],
  },
];

/** 앱으로 처음 열었는지: 홈 화면에 설치한 앱(standalone)이거나 앱 시작 주소(?source=app) */
function openedAsApp() {
  if (typeof window === "undefined") return false;
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return standalone || new URLSearchParams(window.location.search).get("source") === "app";
}

/**
 * 앱을 처음 열었을 때(가입 전) 보여 주는 소개 화면. 옆으로 넘기거나 '다음'을 눌러요.
 * - 로그인한 사람, 이미 본 사람에게는 안 보여요
 * - 주소에 ?intro=1 을 붙이면 언제든 다시 볼 수 있어요
 */
export function IntroSlides() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (pathname !== "/") return;
    const force = new URLSearchParams(window.location.search).get("intro") === "1";
    let seen = false;
    try {
      seen = localStorage.getItem(SEEN_KEY) === "1";
    } catch {
      /* 저장소를 못 쓰면 처음 보는 것으로 */
    }
    if (force) return setOpen(true);
    if (seen || !openedAsApp()) return;
    // 로그인 여부는 이 기기에 저장된 로그인 정보로만 확인해요 (네트워크 없이)
    createClient()
      .auth.getSession()
      .then(({ data }) => {
        if (!data.session) setOpen(true);
      });
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  function close(to?: string) {
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* 무시 */
    }
    setOpen(false);
    if (new URLSearchParams(window.location.search).has("intro")) router.replace("/");
    if (to) router.push(to);
  }

  function go(i: number) {
    const el = trackRef.current;
    if (!el) return;
    const n = Math.max(0, Math.min(SLIDES.length - 1, i));
    setIdx(n); // 넘어가는 동안 '다음'을 또 눌러도 바로 다음 장으로
    el.scrollTo({ left: n * el.clientWidth, behavior: "smooth" });
  }

  if (!open) return null;
  const last = idx === SLIDES.length - 1;

  return (
    <div role="dialog" aria-modal="true" aria-label="B-LOCK 소개" className="fixed inset-0 z-[60] flex flex-col bg-white pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
      <div className="flex h-14 flex-none items-center justify-between px-4">
        <span className="text-[15px] font-extrabold tracking-tight text-brand-700">B-LOCK</span>
        {!last && (
          <button type="button" onClick={() => close()} className="h-10 rounded-xl px-3 text-[14px] font-semibold text-ink-muted hover:bg-slate-50">
            건너뛰기
          </button>
        )}
      </div>

      <div
        ref={trackRef}
        className="no-scrollbar flex flex-1 snap-x snap-mandatory overflow-x-auto overscroll-contain"
        onScroll={(e) => {
          const el = e.currentTarget;
          setIdx(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
        }}
      >
        {SLIDES.map((s, i) => (
          <section key={i} aria-hidden={i !== idx} className="flex w-full flex-none snap-center flex-col overflow-y-auto px-6">
            <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-4">
              <div className={cn("mx-auto grid h-28 w-28 place-items-center rounded-[2rem] bg-gradient-to-br text-white shadow-lift", s.bg)}>
                <s.icon aria-hidden className="h-14 w-14" strokeWidth={1.75} />
              </div>
              <p className="mt-8 text-[13px] font-bold text-brand-600">
                {i + 1} / {SLIDES.length}
              </p>
              <h2 className="mt-1 whitespace-pre-line text-[28px] font-extrabold leading-tight tracking-tight">{s.title}</h2>
              <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">{s.text}</p>
              <ul className="mt-5 space-y-2">
                {s.points.map((p) => (
                  <li key={p} className="flex items-center gap-2 text-[14px] font-semibold text-ink">
                    <span aria-hidden className="grid h-5 w-5 flex-none place-items-center rounded-full bg-brand-50 text-[11px] text-brand-700">
                      ✓
                    </span>
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ))}
      </div>

      <div className="flex-none space-y-3 px-6 pb-5 pt-2">
        <div className="flex justify-center gap-1.5" aria-hidden>
          {SLIDES.map((_, i) => (
            <button
              key={i}
              type="button"
              tabIndex={-1}
              onClick={() => go(i)}
              className={cn("h-2 rounded-full transition-all", i === idx ? "w-6 bg-brand-600" : "w-2 bg-slate-200")}
            />
          ))}
        </div>
        <div className="mx-auto w-full max-w-sm space-y-2">
          {last ? (
            <>
              <button
                type="button"
                onClick={() => close("/signup")}
                className="flex h-14 w-full items-center justify-center gap-1.5 rounded-2xl bg-brand-600 text-[17px] font-bold text-white shadow-lift hover:bg-brand-700"
              >
                무료로 시작하기
                <ChevronRight aria-hidden className="h-5 w-5" />
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => close("/login")} className="h-12 rounded-2xl bg-slate-100 text-[15px] font-semibold text-ink hover:bg-slate-200">
                  로그인
                </button>
                <button type="button" onClick={() => close()} className="h-12 rounded-2xl bg-white text-[15px] font-semibold text-ink-soft ring-1 ring-inset ring-line hover:bg-slate-50">
                  먼저 둘러볼게요
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={() => go(idx + 1)}
              className="flex h-14 w-full items-center justify-center gap-1.5 rounded-2xl bg-brand-600 text-[17px] font-bold text-white shadow-lift hover:bg-brand-700"
            >
              다음
              <ChevronRight aria-hidden className="h-5 w-5" />
            </button>
          )}
          <p className="flex items-center justify-center gap-1 text-[12px] text-ink-muted">
            <Lock aria-hidden className="h-3.5 w-3.5" />
            실시간 위치 추적이 아니에요 · 개인정보는 공개하지 않아요
          </p>
        </div>
      </div>
    </div>
  );
}
