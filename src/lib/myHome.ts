/**
 * 로그인한 사람의 '지금 확인할 것' (홈에서 써요)
 * 내 이동수단 · 받은 제보·대화 · 진행 중인 도난 경보 · 시작 안내 단계 · 소모품 알림
 */
import type { User } from "@supabase/supabase-js";
import type { InboxItem } from "@/components/vehicle/InboxCard";
import { partsNeedingCare, type VehiclePart } from "./parts";
import type { createClient } from "./supabase/server";
import type { Vehicle } from "./types";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** 받은 제보 목록에 쓰는 열 (handled_at·chat_blocked_at 은 020에서 생긴 주인 처리 표시) */
type InboxRow = {
  id: string;
  vehicle_id: string;
  kind: InboxItem["kind"];
  contact_mode: InboxItem["mode"] | null;
  description: string;
  created_at: string;
  handled_at?: string | null;
  chat_blocked_at?: string | null;
};

export type CareItem = { part: VehiclePart; ratio: number };

export async function loadMyHome(supabase: Supabase, user: User) {
  const [{ data: profile }, { data: vehicles, error }, { data: allParts, error: partsErr }, { count: pushCount }, { data: myAlerts }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("vehicles").select("*").is("deleted_at", null).order("created_at", { ascending: false }),
    supabase.from("vehicle_parts").select("id, vehicle_id, kind, interval_km, interval_days, distance_m, last_serviced_at, enabled"),
    // 알림 받는 기기가 내 계정에 하나라도 있는지 (시작 안내·알림 안내용)
    supabase.from("push_subscriptions").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    supabase.from("theft_alerts").select("id, vehicle_id").eq("owner_id", user.id).eq("status", "open"),
  ]);
  if (partsErr) console.error(partsErr);
  if (error) console.error(error);
  const list = (vehicles ?? []) as Vehicle[];

  // 수색 중인 이동수단의 발견 제보 수 (발견 제보 접수 상태 계산용)
  const foundCounts = new Map<string, number>();
  const searchingIds = list.filter((v) => v.status === "searching").map((v) => v.id);
  if (searchingIds.length) {
    const { data: reports } = await supabase.from("reports").select("vehicle_id").eq("kind", "found").in("vehicle_id", searchingIds);
    for (const r of reports ?? []) foundCounts.set(r.vehicle_id, (foundCounts.get(r.vehicle_id) ?? 0) + 1);
  }

  // 이동수단별 소모품 알림 (점검 필요·교체 권장)
  const now = Date.now();
  const care = new Map<string, CareItem[]>();
  for (const v of list) care.set(v.id, partsNeedingCare(((allParts ?? []) as VehiclePart[]).filter((p) => p.vehicle_id === v.id), now));

  // 받은 제보·대화 (최근 14일, 내 이동수단 것만: RLS)
  const since = new Date(now - 14 * 86400e3).toISOString();
  let inboxReports: InboxRow[] = [];
  if (list.length) {
    const ids = list.map((v) => v.id);
    const res = await supabase
      .from("reports")
      .select("id, vehicle_id, kind, contact_mode, description, created_at, handled_at, chat_blocked_at")
      .in("vehicle_id", ids)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(20);
    if (res.error) {
      // 처리 표시 열(020)이 아직 없는 데이터베이스여도 받은 제보는 보이게
      console.error(res.error);
      const { data } = await supabase
        .from("reports")
        .select("id, vehicle_id, kind, contact_mode, description, created_at")
        .in("vehicle_id", ids)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(20);
      inboxReports = (data ?? []) as InboxRow[];
    } else {
      inboxReports = (res.data ?? []) as InboxRow[];
    }
  }
  const reportIds = inboxReports.map((r) => r.id);
  const { data: inboxMsgs } = reportIds.length
    ? await supabase.from("report_messages").select("report_id, sender, body, created_at").in("report_id", reportIds).order("created_at", { ascending: false })
    : { data: [] };
  const inbox: InboxItem[] = inboxReports
    .map((r) => {
      const last = (inboxMsgs ?? []).find((m) => m.report_id === r.id);
      const mode = r.contact_mode ?? "none";
      // 주인이 '확인함·연락함'으로 표시한 시각. 그 뒤에 온 발견자 메시지만 새 메시지로 봐요.
      const handled = r.handled_at ? new Date(r.handled_at).getTime() : 0;
      const recent = now - new Date(r.created_at).getTime() < 3 * 86400e3;
      // 답장 기다림: 대화는 발견자가 마지막으로 말했을 때(대화가 없으면 사흘 동안), 전화 요청은 연락함 표시 전 사흘 동안. 차단한 대화는 빼요.
      const needsReply = r.chat_blocked_at
        ? false
        : mode === "chat"
          ? last
            ? last.sender === "finder" && new Date(last.created_at as string).getTime() > handled
            : !handled && recent
          : mode === "callback" && !handled && recent;
      return {
        reportId: r.id,
        vehicleId: r.vehicle_id,
        vehicleName: list.find((v) => v.id === r.vehicle_id)?.name ?? "이동수단",
        kind: r.kind,
        mode,
        preview: last ? `${last.sender === "finder" ? "발견자: " : "나: "}${last.body}` : r.description,
        at: (last?.created_at as string | undefined) ?? r.created_at,
        needsReply,
      };
    })
    .sort((a, b) => Number(b.needsReply) - Number(a.needsReply) || b.at.localeCompare(a.at))
    .slice(0, 5);

  // 시작 안내: 스티커를 연결했거나 부착 위치를 적었거나 QR을 출력했으면 붙이기 단계 완료로 봐요
  const liveIds = list.map((v) => v.id);
  const { count: stickerCount } = liveIds.length
    ? await supabase.from("stickers").select("code", { count: "exact", head: true }).eq("claimed_by", user.id).in("vehicle_id", liveIds)
    : { count: 0 };
  const hasSticker = (stickerCount ?? 0) > 0 || list.some((v) => Boolean(v.sticker_spot) || Boolean(v.qr_printed_at));

  return {
    profile,
    nickname: (profile?.nickname as string | undefined) || user.email?.split("@")[0] || "회원",
    list,
    loadFailed: Boolean(error),
    foundCounts,
    care,
    inbox,
    myAlerts: (myAlerts ?? []) as { id: string; vehicle_id: string }[],
    hasPush: (pushCount ?? 0) > 0,
    hasSticker,
    now,
  };
}
