// B-LOCK 서비스 워커: 앱 설치를 가능하게 하고, 인터넷이 끊겼을 때 안내 화면을 보여줍니다.
// 개인 정보가 담긴 화면은 저장(캐시)하지 않습니다. 오프라인 안내 화면 하나만 저장합니다.
// 앱을 닫아 두어도 발견 제보·댓글·정비 알림(웹 푸시)을 받아 휴대폰 알림으로 띄워요.
//
// 오프라인 화면은 스타일이 파일 안에 다 들어 있는 public/offline.html이에요.
// (예전처럼 /offline 화면을 저장하면 그때의 로그인 상태·배포 CSS에 묶여서, 몇 주 뒤엔 깨져 보일 수 있었어요)
// offline.html을 고치면 아래 CACHE 이름을 올려 주세요 → 이 파일이 바뀌어 설치된 앱이 새로 받아요.
const CACHE = "b-lock-v3";
const OFFLINE_URL = "/offline.html";
const ICON = "/icons/icon-192.png";
// 인터넷이 될 때 가끔(6시간에 한 번) 오프라인 화면을 새로 받아 둬요
const REFRESH_MS = 6 * 60 * 60 * 1000;
let lastRefresh = 0;

function cacheOffline(mode) {
  return caches.open(CACHE).then((cache) => cache.add(new Request(OFFLINE_URL, { cache: mode })));
}

function refreshOffline() {
  if (Date.now() - lastRefresh < REFRESH_MS) return Promise.resolve();
  lastRefresh = Date.now();
  return cacheOffline("no-cache").catch(() => {});
}

self.addEventListener("install", (event) => {
  lastRefresh = Date.now();
  event.waitUntil(cacheOffline("reload"));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  // 화면 이동만 다룹니다. 인터넷이 되면 항상 서버에서 새로 받아요.
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        try {
          event.waitUntil(refreshOffline());
        } catch {
          // 이벤트가 이미 끝났으면 다음 화면 이동 때 다시 받아요
        }
        return res;
      })
      .catch(() => caches.match(OFFLINE_URL).then((cached) => cached || Response.error())),
  );
});

// 알림을 누르면 열 주소: 우리 사이트 안의 주소만 (다른 사이트로 보내는 알림은 첫 화면으로)
function safeUrl(url) {
  try {
    const u = new URL(typeof url === "string" && url ? url : "/", self.location.origin);
    return u.origin === self.location.origin ? u.href : self.location.origin + "/";
  } catch {
    return self.location.origin + "/";
  }
}

self.addEventListener("push", (event) => {
  // 서버는 {title, body, url, tag} JSON을 보내요. 형식이 다르면 기본 문구로 알려요.
  let data = null;
  try {
    data = event.data ? event.data.json() : null;
  } catch {
    data = null;
  }
  const ok = data && typeof data === "object";
  const title = ok && typeof data.title === "string" && data.title ? data.title : "B-LOCK 새 알림";
  const options = {
    body: ok && typeof data.body === "string" && data.body ? data.body : "새 소식이 있어요. 눌러서 확인해 보세요.",
    icon: ICON,
    badge: ICON,
    lang: "ko",
    data: { url: safeUrl(ok ? data.url : "/") },
  };
  if (ok && typeof data.tag === "string" && data.tag) {
    // 같은 글·같은 이동수단 알림은 하나로 묶되, 새 알림이 오면 다시 울려요.
    options.tag = data.tag;
    options.renotify = true;
  }
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = safeUrl(event.notification.data && event.notification.data.url);
  event.waitUntil(
    (async () => {
      // 이미 열린 B-LOCK 창이 있으면 그 창을 앞으로 가져와 해당 화면으로 이동
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).origin !== self.location.origin) continue;
        try {
          const focused = await client.focus();
          if ("navigate" in focused) {
            await focused.navigate(url);
            return;
          }
        } catch (e) {
          // 이 서비스 워커가 관리하지 않는 창은 이동할 수 없어요. 새 창으로 엽니다.
          console.error("알림 창 이동 실패", e);
        }
        break;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
