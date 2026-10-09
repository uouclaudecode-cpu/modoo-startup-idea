import { isAllowedPushEndpoint } from "./pushEndpoint";
import { createClient } from "./supabase/client";

/**
 * 화면(브라우저)용 웹 푸시 도우미: 지원 여부 확인, 알림 켜기·끄기.
 * 알림 권한은 사용자가 버튼을 눌렀을 때만 물어봐요 (아이폰 Safari는 그때만 허용 창을 띄워요).
 */

export const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

/** 이 기기의 알림 상태 */
export type PushState = "unsupported" | "install" | "denied" | "off" | "on";

function isIos() {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/i.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** 이 브라우저가 웹 푸시를 지원하는지 */
export function isPushSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** 아이폰·아이패드는 '홈 화면에 추가'한 앱으로 열었을 때만 알림을 받을 수 있어요 (iOS 16.4+) */
export function needsInstallForPush() {
  return typeof window !== "undefined" && isIos() && !isStandalone();
}

/** VAPID 공개 키(base64url)를 브라우저가 받는 바이트 배열로 */
export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** 이미 등록된 서비스 워커 (없으면 null — ready 처럼 무한정 기다리지 않아요) */
async function getRegistration() {
  return (await navigator.serviceWorker.getRegistration()) ?? null;
}

/** 알림을 받으려면 서비스 워커가 켜져 있어야 해요. 없으면 등록하고, 켜질 때까지 잠깐 기다려요. */
async function readyRegistration() {
  if (!(await getRegistration())) await navigator.serviceWorker.register("/sw.js");
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("알림 준비가 늦어지고 있어요. 화면을 새로고침한 뒤 다시 눌러 주세요.")), 10000);
  });
  try {
    return await Promise.race([navigator.serviceWorker.ready, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** 기존 구독이 지금 VAPID 키로 만든 것인지 (키를 바꾸면 예전 구독으로는 알림이 안 와요) */
function sameKey(sub: PushSubscription, key: Uint8Array) {
  const current = sub.options?.applicationServerKey;
  if (!current) return true; // 알 수 없으면 그대로 써요
  const a = new Uint8Array(current);
  return a.length === key.length && a.every((v, i) => v === key[i]);
}

/** 이 기기의 지금 상태. 브라우저 구독이 있어도 내 계정에 저장돼 있지 않으면(다른 계정이 켰던 기기) '꺼짐'으로 봐요. */
export async function getPushState(): Promise<PushState> {
  if (needsInstallForPush()) return "install";
  if (!isPushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  if (Notification.permission !== "granted") return "off";

  const reg = await getRegistration();
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  if (!sub) return "off";

  const { data, error } = await createClient().from("push_subscriptions").select("id").eq("endpoint", sub.endpoint).maybeSingle();
  if (error) {
    console.error(error);
    return "on"; // 확인을 못 하면 브라우저 상태를 믿어요
  }
  return data ? "on" : "off";
}

/**
 * 알림 켜기: 권한 묻기 → 구독 → 내 계정에 기기 저장.
 * 반드시 버튼 클릭 안에서 불러 주세요. 실패하면 사용자에게 보여줄 한국어 메시지로 오류를 던져요.
 */
/** 이 브라우저의 알림 구독만 만들어요 (저장은 하지 않음). 로그인 없는 발견자 대화 알림에도 써요. */
export async function browserPushSubscription(): Promise<{ endpoint: string; p256dh: string; auth: string }> {
  if (!VAPID_PUBLIC_KEY) throw new Error("알림 기능 준비 중이에요.");
  if (needsInstallForPush()) throw new Error("iPhone은 홈 화면에 추가한 앱에서만 알림을 받을 수 있어요.");
  if (!isPushSupported()) throw new Error("이 브라우저는 알림을 지원하지 않아요. 크롬·삼성 인터넷·Safari에서 열어 주세요.");
  const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (permission === "denied") throw new Error("알림이 차단돼 있어요. 브라우저 설정에서 알림을 허용해 주세요.");
  if (permission !== "granted") throw new Error("알림을 받으려면 '허용'을 눌러 주세요.");
  const key = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
  const reg = await readyRegistration();
  let sub = await reg.pushManager.getSubscription();
  if (sub && !sameKey(sub, key)) {
    await sub.unsubscribe();
    sub = null;
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth || !isAllowedPushEndpoint(json.endpoint)) {
    throw new Error("이 브라우저의 알림은 아직 지원하지 않아요. 크롬·삼성 인터넷·Safari에서 열어 주세요.");
  }
  return { endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth };
}

export async function subscribePush(): Promise<void> {
  if (!VAPID_PUBLIC_KEY) throw new Error("알림 기능 준비 중이에요.");
  if (needsInstallForPush()) throw new Error("iPhone은 홈 화면에 추가한 앱에서만 알림을 받을 수 있어요.");
  if (!isPushSupported()) throw new Error("이 브라우저는 알림을 지원하지 않아요. 크롬·삼성 인터넷·Safari에서 열어 주세요.");

  // 권한 요청은 다른 await 보다 먼저 (클릭 직후에 불러야 Safari가 허용 창을 띄워요)
  const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (permission === "denied") throw new Error("알림이 차단돼 있어요. 브라우저 설정에서 알림을 허용해 주세요.");
  if (permission !== "granted") throw new Error("알림을 받으려면 '허용'을 눌러 주세요.");

  const key = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
  const reg = await readyRegistration();
  let sub = await reg.pushManager.getSubscription();
  if (sub && !sameKey(sub, key)) {
    await sub.unsubscribe();
    sub = null;
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });

  const json = sub.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!json.endpoint || !p256dh || !auth) throw new Error("알림을 켜지 못했어요. 잠시 후 다시 시도해 주세요.");
  if (!isAllowedPushEndpoint(json.endpoint)) {
    await sub.unsubscribe().catch((e) => console.error(e));
    throw new Error("이 브라우저의 알림은 아직 지원하지 않아요. 크롬·삼성 인터넷·Safari에서 열어 주세요.");
  }

  // 같은 브라우저를 다른 계정이 쓰던 경우까지 처리하려고 함수(save_push_subscription)로 저장해요.
  const { error } = await createClient().rpc("save_push_subscription", {
    p_endpoint: json.endpoint,
    p_p256dh: p256dh,
    p_auth: auth,
    p_user_agent: navigator.userAgent.slice(0, 200),
  });
  if (error) throw error;
}

/** 알림 끄기: 내 계정에서 이 기기를 지우고 브라우저 구독도 끝내요. */
export async function unsubscribePush(): Promise<void> {
  if (!isPushSupported()) return;
  const reg = await getRegistration();
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  if (!sub) return;

  const endpoint = sub.endpoint;
  // 브라우저 구독을 먼저 끝내요. 네트워크가 느려 아래 삭제가 늦어도, 끝난 구독은 서버가 다음 알림 때 알아서 지워요.
  await sub.unsubscribe();
  const { error } = await createClient().from("push_subscriptions").delete().eq("endpoint", endpoint);
  if (error) console.error("알림 기기 삭제 실패", error);
}
