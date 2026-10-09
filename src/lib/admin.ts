import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** 관리자만 들어올 수 있는 화면. 관리자가 아니면 404로 숨깁니다. */
export async function requireAdmin(nextPath: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  const { data, error } = await supabase.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
  if (error) throw error;
  if (!data?.is_admin) notFound();
  return { supabase, user };
}

/** 관리자 홈의 '처리할 일' 개수 (020_g6_community_admin.sql 의 admin_pending_counts) */
export type PendingCounts = {
  /** 아직 보이는 중인 신고된 글·댓글 (관리자가 다시 보이게 한 뒤 새로 신고된 것 포함) */
  reports_visible: number;
  /** 숨겨진 채 남은 신고된 글·댓글 (자동 숨김 포함) */
  reports_hidden: number;
  /** 신고가 들어온 진행 중 도난 경보 */
  alerts_flagged: number;
  /** 신고로 숨겨진 도난 경보 */
  alerts_hidden: number;
  /** 저장소에서 지울 사진 파일 */
  cleanup: number;
  /** 지금 이용이 제한된 회원 */
  suspended: number;
};

/** 처리할 일 개수. 함수가 아직 없거나 실패하면 null (화면은 개수 없이 그대로) */
export async function loadPendingCounts(supabase: Awaited<ReturnType<typeof createClient>>): Promise<PendingCounts | null> {
  const { data, error } = await supabase.rpc("admin_pending_counts");
  if (error || !data) {
    if (error) console.error(error);
    return null;
  }
  const d = data as Partial<Record<keyof PendingCounts, unknown>>;
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);
  return {
    reports_visible: n(d.reports_visible),
    reports_hidden: n(d.reports_hidden),
    alerts_flagged: n(d.alerts_flagged),
    alerts_hidden: n(d.alerts_hidden),
    cleanup: n(d.cleanup),
    suspended: n(d.suspended),
  };
}
