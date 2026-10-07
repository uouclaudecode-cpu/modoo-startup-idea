import { appIconResponse } from "@/lib/appIcon";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

/** 브라우저 탭 아이콘 */
export default function Icon() {
  return appIconResponse(64);
}
