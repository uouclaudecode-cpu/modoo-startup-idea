import { site } from "@/config/site";
import { LockLogo } from "@/lib/logo";

/**
 * 설치한 앱으로 켤 때 처음 보이는 화면: 가운데 로고, 아래쪽에 서비스 이름과 소개 글.
 *
 * 안드로이드는 앱을 켜자마자 휴대폰이 직접 그리는 시작 화면(흰 바탕 + 앱 아이콘만)을 먼저 보여 줘요.
 * 그 화면에서 이 화면으로 넘어갈 때 로고가 바뀌어 보이지 않도록, 실제 휴대폰(갤럭시) 화면을 재서
 * 로고 크기(높이 약 187px)와 위치(상태 표시줄·아래 버튼까지 포함한 화면 정가운데 → 앱 화면 가운데보다 약 7px 아래)를 맞췄어요.
 * 이 화면이 보이는 동안은 위쪽 상태 표시줄도 흰색으로 맞추고, 사라질 때 원래 색(파랑)으로 돌려요.
 *
 * 자바스크립트를 기다리지 않도록 서버에서 바로 그리고, 설치한 앱(standalone)일 때만 보여 줘요.
 * 최소 2.5초 보여 주고, 앱 준비(load)가 끝나면 스르르 사라져요. (아무리 늦어도 6초)
 * 한 번 켠 뒤(같은 실행 중)에는 새로고침해도 다시 나오지 않아요.
 * (React가 화면을 이어받을 때 요소가 그대로 있어야 해서, 지우지 않고 숨기기만 해요)
 */
const SCRIPT = `(function(){
var el=document.getElementById('app-splash');if(!el)return;
var standalone=(window.matchMedia&&matchMedia('(display-mode: standalone)').matches)||navigator.standalone===true;
var seen=false;try{seen=sessionStorage.getItem('blk-splash')==='1';sessionStorage.setItem('blk-splash','1')}catch(e){}
if(!standalone||seen)return;
el.style.display='block';
var meta=document.querySelector('meta[name="theme-color"]');var old=meta&&meta.getAttribute('content');
if(meta)meta.setAttribute('content','#ffffff');
requestAnimationFrame(function(){var t=document.getElementById('app-splash-text');if(t){t.style.opacity='1';t.style.transform='translateY(0)'}});
var shownAt=Date.now(),done=false;
function hide(){if(done)return;done=true;var wait=Math.max(0,2500-(Date.now()-shownAt));setTimeout(function(){el.style.opacity='0';if(meta&&old)meta.setAttribute('content',old);setTimeout(function(){el.style.display='none'},450)},wait)}
if(document.readyState==='complete')hide();else window.addEventListener('load',hide);
setTimeout(hide,6000);
})();`;

export function AppSplash() {
  return (
    <>
      <div
        id="app-splash"
        aria-hidden
        suppressHydrationWarning
        style={{ display: "none", transition: "opacity .45s ease" }}
        className="fixed inset-0 z-[100] bg-white"
      >
        {/* 휴대폰 시작 화면의 아이콘 자리 (전체 화면 정가운데 = 앱 화면 가운데보다 살짝 아래) */}
        <div className="absolute left-1/2 top-[calc(50%+7px)] -translate-x-1/2 -translate-y-1/2">
          <LockLogo size={187} />
        </div>
        <div
          id="app-splash-text"
          suppressHydrationWarning
          style={{ opacity: 0, transform: "translateY(8px)", transition: "opacity .6s ease .2s, transform .6s ease .2s" }}
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
