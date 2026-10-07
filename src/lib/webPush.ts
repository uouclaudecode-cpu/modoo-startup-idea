import { sendNotification, setVapidDetails, type Urgency } from "web-push";
import { isAllowedPushEndpoint } from "./pushEndpoint";

/**
 * 서버 전용: 브라우저 알림(웹 푸시) 보내기. /api/push 와 /api/push/test 에서 씁니다.
 * 비공개 키(VAPID_PRIVATE_KEY)를 쓰므로 화면(클라이언트) 코드에서 불러오면 안 돼요.
 */

export type PushTarget = { endpoint: string; p256dh: string; auth: string };

export type PushMessage = {
  title: string;
  body: string;
  /** 알림을 누르면 열 화면 (사이트 안 경로만) */
  url: string;
  /** 같은 tag 알림은 하나로 묶여요 */
  tag?: string | null;
};

export type PushSendResult = {
  sent: number;
  failed: number;
  /** 알림 서버에 허용하지 않는 주소라 건너뛴 기기 */
  skipped: number;
  /** 구독이 끝난 기기(404·410) — 목록에서 지워야 해요 */
  gone: string[];
};

// 알림 서버가 문제를 연락할 곳 (VAPID 규격상 필요)
const VAPID_SUBJECT = "https://b-lock-app.vercel.app";

let vapidReady: boolean | null = null;

/** VAPID 키가 있고 올바르면 true. 한 번 확인하면 서버가 살아 있는 동안 다시 하지 않아요. */
export function ensureVapid() {
  if (vapidReady !== null) return vapidReady;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    // 키를 나중에 넣고 다시 배포할 수 있으니 '없음'은 기억하지 않아요.
    return false;
  }
  try {
    setVapidDetails(VAPID_SUBJECT, publicKey, privateKey);
    vapidReady = true;
  } catch (e) {
    console.error("VAPID 키가 올바르지 않아요.", e);
    vapidReady = false;
  }
  return vapidReady;
}

/**
 * 여러 기기에 같은 알림을 보내요. 한 기기가 실패해도 나머지는 계속 보냅니다.
 * VAPID 설정이 없으면 null.
 */
export async function sendWebPush(
  targets: PushTarget[],
  message: PushMessage,
  { urgency = "normal", ttl = 3600 }: { urgency?: Urgency; ttl?: number } = {},
): Promise<PushSendResult | null> {
  if (!ensureVapid()) return null;

  const allowed = targets.filter((t) => isAllowedPushEndpoint(t.endpoint));
  const skipped = targets.length - allowed.length;
  if (skipped > 0) console.error(`허용하지 않는 알림 서버 주소 ${skipped}개를 건너뛰었어요.`);

  const payload = JSON.stringify({ title: message.title, body: message.body, url: message.url, tag: message.tag ?? null });
  const results = await Promise.allSettled(
    allowed.map((t) =>
      sendNotification({ endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } }, payload, {
        TTL: ttl,
        urgency,
        timeout: 8000, // 알림 서버가 응답하지 않을 때 함수가 오래 붙잡히지 않게
      }),
    ),
  );

  const result: PushSendResult = { sent: 0, failed: 0, skipped, gone: [] };
  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      result.sent += 1;
      return;
    }
    // WebPushError 는 statusCode 를 가져요 (모듈이 두 번 불려도 맞게 instanceof 대신 값으로 확인)
    const reason = r.reason as { statusCode?: unknown; message?: unknown } | null;
    const status = typeof reason?.statusCode === "number" ? reason.statusCode : 0;
    if (status === 404 || status === 410) {
      // 앱을 지웠거나 알림을 끈 기기: 다음부터 보내지 않도록 지워요.
      result.gone.push(allowed[i].endpoint);
    } else {
      result.failed += 1;
      // 기기 주소(endpoint)는 로그에 남기지 않고 상태·메시지만
      console.error("알림 보내기 실패", status, typeof reason?.message === "string" ? reason.message : reason);
    }
  });
  return result;
}
