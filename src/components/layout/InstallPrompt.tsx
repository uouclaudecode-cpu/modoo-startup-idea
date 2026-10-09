"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Download, MoreVertical, Share, SquarePlus, X } from "lucide-react";
import { site } from "@/config/site";
import { Button, Modal } from "@/components/ui";

/** 크롬·삼성 인터넷·엣지가 주는 '앱 설치' 이벤트 */
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

const DISMISS_KEY = "b-lock:install-dismissed";
const DISMISS_DAYS = 3;

type Platform = "ios" | "inapp" | "other";

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  // 카카오톡·인스타그램 등 앱 안 브라우저는 설치가 안 돼요.
  if (/KAKAOTALK|Instagram|FBAN|FBAV|NAVER\(inapp|Line\//i.test(ua)) return "inapp";
  if (/iPhone|iPad|iPod/i.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1)) return "ios";
  return "other";
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/**
 * 화면 맨 아래 '앱 설치' 버튼.
 * - 이미 설치한 앱으로 들어온 사람에게는 보이지 않아요.
 * - 설치 창을 띄울 수 있는 브라우저는 바로 설치, 아이폰 등은 방법을 안내해요.
 */
export function InstallPrompt() {
  const [visible, setVisible] = useState(false); // 처음엔 숨김 (서버 화면과 어긋나지 않게)
  const [event, setEvent] = useState<InstallEvent | null>(null);
  const [platform, setPlatform] = useState<Platform>("other");
  const [guide, setGuide] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    // 서비스 워커 등록 (앱 설치 조건 + 오프라인 안내)
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((e) => console.error("서비스 워커 등록 실패", e));
    }
    if (isStandalone()) return;

    let dismissedAt = 0;
    try {
      dismissedAt = Number(localStorage.getItem(DISMISS_KEY)) || 0;
    } catch {
      // 사생활 보호 모드 등에서는 저장소를 못 써요. 그냥 버튼을 보여줍니다.
    }
    setPlatform(detectPlatform());
    setVisible(Date.now() - dismissedAt > DISMISS_DAYS * 86400e3);

    const onPrompt = (e: Event) => {
      e.preventDefault(); // 브라우저 기본 안내 대신 우리 버튼으로 띄움
      setEvent(e as InstallEvent);
    };
    const onInstalled = () => {
      setVisible(false);
      setEvent(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!event) {
      setGuide(true);
      return;
    }
    await event.prompt();
    const { outcome } = await event.userChoice;
    setEvent(null); // 설치 창은 한 번만 쓸 수 있어요
    if (outcome === "accepted") setVisible(false);
  }

  function dismiss() {
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // 저장 못 해도 이번 화면에서는 닫힘
    }
  }

  // 라이딩 화면에서는 시작·종료 버튼을 가리지 않도록 숨김
  if (!visible || pathname === "/ride") return null;

  return (
    <>
      {/* 고정된 버튼이 마지막 내용을 가리지 않도록 자리 확보 */}
      <div aria-hidden className="h-20 print:hidden" />
      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 print:hidden px-3 pb-7 sm:bottom-0 sm:pb-4">
        <div className="mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-ink p-2.5 pl-3 text-white shadow-lift">
          <span aria-hidden className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-brand-600">
            <Download className="h-5 w-5" />
          </span>
          <p className="min-w-0 flex-1 text-sm leading-snug">
            <b>{site.name} 앱 설치</b>
            <span className="block truncate text-[12px] text-white/70">홈 화면에서 바로 QR 스캔</span>
          </p>
          <Button size="md" className="h-10 flex-none px-4 text-sm" onClick={install}>
            설치
          </Button>
          <button type="button" onClick={dismiss} className="grid h-9 w-9 flex-none place-items-center rounded-full text-white/60 hover:bg-white/10" aria-label="앱 설치 안내 닫기">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <Modal
        open={guide}
        onClose={() => setGuide(false)}
        title={`${site.name} 앱 설치하기`}
        footer={<Button onClick={() => setGuide(false)}>알겠어요</Button>}
      >
        {platform === "ios" ? (
          <ol className="space-y-3">
            <li className="flex items-center gap-3">
              <Step n={1} />
              <span>
                Safari 아래쪽 <Share aria-label="공유" className="inline h-4 w-4 align-[-2px] text-brand-600" /> <b>공유</b> 버튼을 눌러요.
              </span>
            </li>
            <li className="flex items-center gap-3">
              <Step n={2} />
              <span>
                <SquarePlus aria-hidden className="inline h-4 w-4 align-[-2px] text-brand-600" /> <b>홈 화면에 추가</b>를 눌러요.
              </span>
            </li>
            <li className="flex items-center gap-3">
              <Step n={3} />
              <span>
                오른쪽 위 <b>추가</b>를 누르면 홈 화면에 {site.name} 앱이 생겨요.
              </span>
            </li>
            <li className="text-[13px] text-ink-muted">크롬 등 다른 브라우저라면 Safari에서 이 사이트를 열어 주세요.</li>
          </ol>
        ) : platform === "inapp" ? (
          <p>
            카카오톡 같은 앱 안에서는 설치할 수 없어요. 오른쪽 위 메뉴에서 <b>다른 브라우저로 열기</b>(크롬·Safari·삼성 인터넷)를 누른 뒤 다시
            설치 버튼을 눌러 주세요.
          </p>
        ) : (
          <ol className="space-y-3">
            <li className="flex items-center gap-3">
              <Step n={1} />
              <span>
                브라우저 오른쪽 위 <MoreVertical aria-label="메뉴" className="inline h-4 w-4 align-[-2px] text-brand-600" /> <b>메뉴</b>를 눌러요.
              </span>
            </li>
            <li className="flex items-center gap-3">
              <Step n={2} />
              <span>
                <b>앱 설치</b> 또는 <b>홈 화면에 추가</b>를 눌러요.
              </span>
            </li>
            <li className="text-[13px] text-ink-muted">메뉴에 없다면 크롬이나 삼성 인터넷으로 열어 주세요.</li>
          </ol>
        )}
      </Modal>
    </>
  );
}

function Step({ n }: { n: number }) {
  return <span className="grid h-7 w-7 flex-none place-items-center rounded-full bg-brand-50 text-sm font-bold text-brand-700">{n}</span>;
}
