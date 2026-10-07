// B-LOCK 서비스 워커: 앱 설치를 가능하게 하고, 인터넷이 끊겼을 때 안내 화면을 보여줍니다.
// 개인 정보가 담긴 화면은 저장(캐시)하지 않습니다. 오프라인 안내 화면 하나만 저장합니다.
const CACHE = "b-lock-v1";
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "reload" }))));
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
  event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE_URL)));
});
