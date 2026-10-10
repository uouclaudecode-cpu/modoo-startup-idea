import { site } from "@/config/site";
import { LockLogo } from "@/lib/logo";

/**
 * 설치한 앱으로 켤 때 처음 보이는 화면: 가운데 로고, 아래쪽에 서비스 이름과 소개 글.
 * 자바스크립트를 기다리지 않도록 서버에서 바로 그리고, 설치한 앱(standalone)일 때만 CSS로 보여 줘요.
 * 한 번 켠 뒤(같은 실행 중)에는 새로고침해도 다시 나오지 않아요. 약 1.2초 뒤 스르르 사라져요.
 * (React가 화면을 이어받을 때 요소가 그대로 있어야 해서, 지우지 않고 숨기기만 해요)
 */
const SCRIPT = `(function(){var el=document.getElementById('app-splash');if(!el)return;var standalone=(window.matchMedia&&matchMedia('(display-mode: standalone)').matches)||navigator.standalone===true;var seen=false;try{seen=sessionStorage.getItem('blk-splash')==='1';sessionStorage.setItem('blk-splash','1')}catch(e){}if(!standalone||seen)return;el.style.display='flex';setTimeout(function(){el.style.opacity='0';setTimeout(function(){el.style.display='none'},400)},1200)})();`;

export function AppSplash() {
  return (
    <>
      <div
        id="app-splash"
        aria-hidden
        suppressHydrationWarning
        style={{ display: "none", transition: "opacity .35s ease" }}
        className="fixed inset-0 z-[100] flex-col items-center bg-white px-8 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-[env(safe-area-inset-top)]"
      >
        <div className="flex flex-1 items-center justify-center">
          <LockLogo size={112} />
        </div>
        <div className="text-center">
          <p className="text-2xl font-extrabold tracking-tight text-ink">{site.name}</p>
          <p className="mt-1.5 text-[15px] font-semibold text-ink-soft">{site.tagline}</p>
          <p className="mt-1 text-[13px] text-ink-muted">잃어버려도 다시 찾는 안심 라이딩</p>
        </div>
      </div>
      <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />
    </>
  );
}
