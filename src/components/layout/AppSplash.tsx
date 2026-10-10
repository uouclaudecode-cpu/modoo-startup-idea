import { site } from "@/config/site";
import { LockLogo } from "@/lib/logo";

/**
 * 설치한 앱으로 켤 때 처음 보이는 화면: 가운데 로고, 아래쪽에 서비스 이름과 소개 글.
 *
 * 안드로이드는 앱을 켜자마자 휴대폰이 직접 그리는 시작 화면(흰 바탕 + 앱 아이콘만)을 먼저 보여 줘요.
 * 그 화면에서 이 화면으로 넘어갈 때 로고가 바뀌어 보이지 않도록, 로고를 휴대폰 시작 화면과 같은
 * 크기·위치(화면 정가운데, 아이콘 240dp 중 로고 68% ≈ 163px)에 두고 아래 글만 스르르 나타나게 해요.
 * (아이콘 비율은 src/lib/appIcon.tsx 의 maskable 0.68과 맞춰요)
 *
 * 자바스크립트를 기다리지 않도록 서버에서 바로 그리고, 설치한 앱(standalone)일 때만 보여 줘요.
 * 한 번 켠 뒤(같은 실행 중)에는 새로고침해도 다시 나오지 않아요. 약 1.3초 뒤 스르르 사라져요.
 * (React가 화면을 이어받을 때 요소가 그대로 있어야 해서, 지우지 않고 숨기기만 해요)
 */
const SCRIPT = `(function(){var el=document.getElementById('app-splash');if(!el)return;var standalone=(window.matchMedia&&matchMedia('(display-mode: standalone)').matches)||navigator.standalone===true;var seen=false;try{seen=sessionStorage.getItem('blk-splash')==='1';sessionStorage.setItem('blk-splash','1')}catch(e){}if(!standalone||seen)return;el.style.display='block';requestAnimationFrame(function(){var t=document.getElementById('app-splash-text');if(t){t.style.opacity='1';t.style.transform='translateY(0)'}});setTimeout(function(){el.style.opacity='0';setTimeout(function(){el.style.display='none'},450)},1300)})();`;

export function AppSplash() {
  return (
    <>
      <div
        id="app-splash"
        aria-hidden
        suppressHydrationWarning
        style={{ display: "none", transition: "opacity .4s ease" }}
        className="fixed inset-0 z-[100] bg-white"
      >
        {/* 화면 정가운데 (휴대폰 시작 화면의 아이콘 자리) */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <LockLogo size={163} />
        </div>
        <div
          id="app-splash-text"
          suppressHydrationWarning
          style={{ opacity: 0, transform: "translateY(8px)", transition: "opacity .5s ease .15s, transform .5s ease .15s" }}
          className="absolute inset-x-0 bottom-0 px-8 pb-[max(2.75rem,calc(env(safe-area-inset-bottom)+1.5rem))] text-center"
        >
          <p className="text-2xl font-extrabold tracking-tight text-ink">{site.name}</p>
          <p className="mt-1.5 text-[15px] font-semibold text-ink-soft">{site.tagline}</p>
          <p className="mt-1 text-[13px] text-ink-muted">잃어버려도 다시 찾는 안심 라이딩</p>
        </div>
      </div>
      <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />
    </>
  );
}
