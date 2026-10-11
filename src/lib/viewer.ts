import { cache } from "react";
import { createClient } from "./supabase/server";

/**
 * 지금 로그인한 사람과 안 읽은 알림 수 (알림함이 아직 없으면 0).
 * 머리글(알림 종)과 아래 메뉴(홈 빨간 점)가 함께 써서, 한 화면에서 한 번만 불러와요.
 */
export const loadViewer = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { user: null, unread: 0, chatUnread: 0 };
  const [{ count, error }, { count: chatCount }] = await Promise.all([
    supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null).or("tag.is.null,tag.not.like.chat-%"),
    // 대화 알림(tag chat-…)만: 머리글 💬 빨간 점
    supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null).like("tag", "chat-%"),
  ]);
  if (error) console.error(error);
  return { user, unread: error ? 0 : (count ?? 0), chatUnread: chatCount ?? 0 };
});
