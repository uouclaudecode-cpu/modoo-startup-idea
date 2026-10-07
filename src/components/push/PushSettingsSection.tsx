import { createClient } from "@/lib/supabase/server";
import { PushSettings, type NotifyPrefs } from "./PushSettings";

/**
 * 설정 화면에 바로 넣을 수 있는 서버 컴포넌트: 내 알림 설정을 읽어 PushSettings 에 넘겨요.
 * 프로필을 이미 읽는 화면이라면 이것 대신 <PushSettings {...prefs} /> 를 직접 써도 돼요.
 */
export async function PushSettingsSection() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("notify_reports, notify_comments, notify_maintenance")
    .eq("id", user.id)
    .maybeSingle();
  // 못 읽어도 알림 켜기는 쓸 수 있게 기본값(모두 켜짐)으로 보여줘요.
  if (error) console.error("알림 설정 불러오기 실패", error);

  const prefs: NotifyPrefs = {
    notify_reports: data?.notify_reports ?? true,
    notify_comments: data?.notify_comments ?? true,
    notify_maintenance: data?.notify_maintenance ?? true,
  };
  return <PushSettings {...prefs} />;
}
