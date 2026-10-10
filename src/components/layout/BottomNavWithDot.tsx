import { loadViewer } from "@/lib/viewer";
import { BottomNav } from "./BottomNav";

/** 아래 메뉴 + 안 읽은 알림 빨간 점 (머리글과 같은 정보를 한 번만 불러와요) */
export async function BottomNavWithDot() {
  const { unread } = await loadViewer().catch(() => ({ unread: 0 }));
  return <BottomNav dot={unread > 0} />;
}
