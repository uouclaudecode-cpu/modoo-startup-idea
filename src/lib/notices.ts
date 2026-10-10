/**
 * QR로 '주인에게 알리기' 사유 (037_bike_notices.sql 의 notice_label 과 같아요).
 * urgent: 주인이 알림을 잠시 꺼 두었어도 바로 울리고, 같은 사유를 10분 뒤면 다시 보낼 수 있어요.
 */
export type NoticeReason =
  | "move"
  | "entrance"
  | "no_parking"
  | "long_parked"
  | "fallen"
  | "rain"
  | "flat"
  | "broken"
  | "light_on"
  | "key_left"
  | "item_left"
  | "unlocked"
  | "taking"
  | "tampering"
  | "nice"
  | "other";

export type NoticeInfo = { value: NoticeReason; emoji: string; label: string; urgent?: boolean; hint?: string };

export const NOTICE_GROUPS: { title: string; items: NoticeInfo[] }[] = [
  {
    title: "🚨 급해요",
    items: [
      { value: "taking", emoji: "🚨", label: "누가 가져가려는 것 같아요", urgent: true, hint: "직접 막지 말고 안전한 곳에서 알려 주세요. 위험하면 112에 신고해 주세요." },
      { value: "tampering", emoji: "⚠️", label: "누가 자물쇠·부품을 만지고 있어요", urgent: true, hint: "직접 다가가지 말고 안전한 곳에서 알려 주세요." },
      { value: "unlocked", emoji: "🔓", label: "잠금이 풀려 있어요", urgent: true },
    ],
  },
  {
    title: "📍 세워 둔 자리",
    items: [
      { value: "move", emoji: "🚧", label: "통행에 방해돼요" },
      { value: "entrance", emoji: "🚪", label: "출입구·통로를 막고 있어요" },
      { value: "no_parking", emoji: "🚫", label: "주차 금지 구역이에요" },
      { value: "long_parked", emoji: "🕸️", label: "오래 세워 둔 것 같아요" },
    ],
  },
  {
    title: "🔧 이동수단 상태",
    items: [
      { value: "fallen", emoji: "↘️", label: "넘어져 있어요" },
      { value: "rain", emoji: "🌧️", label: "비를 맞고 있어요" },
      { value: "flat", emoji: "🛞", label: "타이어 바람이 빠졌어요" },
      { value: "broken", emoji: "🔧", label: "부품이 망가졌거나 떨어졌어요" },
      { value: "light_on", emoji: "💡", label: "라이트가 켜져 있어요" },
      { value: "key_left", emoji: "🔑", label: "열쇠·배터리가 꽂혀 있어요" },
      { value: "item_left", emoji: "🎒", label: "헬멧·가방을 두고 갔어요" },
    ],
  },
  {
    title: "💬 그 밖에",
    items: [
      { value: "nice", emoji: "👍", label: "멋있어요!" },
      { value: "other", emoji: "✏️", label: "직접 쓰기" },
    ],
  },
];

export const NOTICE_REASONS: NoticeInfo[] = NOTICE_GROUPS.flatMap((g) => g.items);

export function noticeInfo(reason: string | null | undefined) {
  return NOTICE_REASONS.find((r) => r.value === reason) ?? null;
}

/** 주인이 누르는 빠른 답장 */
export const OWNER_QUICK_REPLIES = ["확인했어요, 알려 주셔서 고마워요!", "지금 옮길게요 🙏", "곧 가서 확인할게요", "고마워요! 😊"];

/** 이 기기를 구분하는 값 (같은 기기가 너무 자주 보내지 못하게, 서버에는 해시로만 저장돼요) */
export function deviceId() {
  try {
    const k = "b-lock:device";
    let id = localStorage.getItem(k);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(k, id);
    }
    return id;
  } catch {
    return null;
  }
}
