/**
 * 브라우저 알림 서버(푸시 서비스) 주소 확인.
 * 서버가 이 주소로 직접 요청을 보내기 때문에, 아무 주소나 저장해서 우리 서버가 엉뚱한 곳(내부망 등)에
 * 요청하게 만들지 못하도록 알려진 알림 서버만 받아요. 화면(알림 켜기)과 서버(/api/push) 둘 다 씁니다.
 */
const PUSH_HOSTS = [
  "fcm.googleapis.com", // 크롬·삼성 인터넷·웨일 등 (안드로이드·PC)
  "android.googleapis.com", // 예전 크롬
  "push.services.mozilla.com", // 파이어폭스
  "push.apple.com", // Safari (아이폰 홈 화면 앱·맥)
  "notify.windows.com", // 엣지
];

export function isAllowedPushEndpoint(endpoint: string) {
  try {
    const u = new URL(endpoint);
    if (u.protocol !== "https:" || u.port !== "") return false;
    const host = u.hostname.toLowerCase();
    return PUSH_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false; // 주소 형식이 아니면 받지 않음
  }
}
