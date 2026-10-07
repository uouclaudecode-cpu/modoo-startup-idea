import { appIconResponse } from "@/lib/appIcon";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** 아이폰 '홈 화면에 추가' 아이콘 (아이폰이 모서리를 알아서 둥글림) */
export default function AppleIcon() {
  return appIconResponse(180, { rounded: false });
}
