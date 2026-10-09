import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Bike, ChartColumn, ChevronRight, Flag, History, Play, Plus, Printer, Siren } from "lucide-react";
import { MaintenanceAlert } from "@/components/maintenance/MaintenanceAlert";
import { PushPrompt } from "@/components/onboarding/PushPrompt";
import { WelcomeGuide, welcomeGuideVisible } from "@/components/onboarding/WelcomeGuide";
import { InboxCard, type InboxItem } from "@/components/vehicle/InboxCard";
import { partsNeedingCare, type VehiclePart } from "@/lib/parts";
import { ButtonLink, Card, EmptyState, ErrorState } from "@/components/ui";
import { VehicleCard } from "@/components/vehicle/VehicleCard";
import { PostCard, type PostListItem } from "@/components/community/PostCard";
import { POST_LIST_COLUMNS } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import type { Vehicle } from "@/lib/types";
import { UnfinishedRideCard } from "./UnfinishedRideCard";

export const metadata: Metadata = { title: "내 이동수단" };

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

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const { welcome } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/dashboard");

  const [{ data: profile }, { data: vehicles, error }, { data: myPosts }, { data: allParts, error: partsErr }, { count: pushCount }] = await Promise.all([
    supabase.from("profiles").select("nickname, is_admin").eq("id", user.id).maybeSingle(),
    supabase.from("vehicles").select("*").is("deleted_at", null).order("created_at", { ascending: false }),
    supabase
      .from("lost_posts")
      .select(POST_LIST_COLUMNS)
      .eq("author_id", user.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase.from("vehicle_parts").select("id, vehicle_id, kind, interval_km, interval_days, distance_m, last_serviced_at, enabled"),
    // 알림 받는 기기가 내 계정에 하나라도 있는지 (시작 안내·알림 안내용)
    supabase.from("push_subscriptions").select("id", { count: "exact", head: true }).eq("user_id", user.id),
  ]);
  if (partsErr) console.error(partsErr);
  const hasPush = (pushCount ?? 0) > 0;

  if (error) {
    console.error(error);
    return <ErrorState title="이동수단을 불러오지 못했어요" description="인터넷 연결을 확인하고 새로고침해 주세요." />;
  }

  const list = (vehicles ?? []) as Vehicle[];
  // 수색 중인 이동수단의 발견 제보 수 (발견 제보 접수 상태 계산용)
  const counts = new Map<string, number>();
  const searchingIds = list.filter((v) => v.status === "searching").map((v) => v.id);
  if (searchingIds.length) {
    const { data: reports } = await supabase.from("reports").select("vehicle_id").eq("kind", "found").in("vehicle_id", searchingIds);
    for (const r of reports ?? []) counts.set(r.vehicle_id, (counts.get(r.vehicle_id) ?? 0) + 1);
  }

  // 이동수단별 정비 알림 (점검 필요·교체 권장)
  const now = Date.now();
  const careByVehicle = list
    .map((v) => ({ v, items: partsNeedingCare(((allParts ?? []) as VehiclePart[]).filter((p) => p.vehicle_id === v.id), now) }))
    .filter((x) => x.items.length > 0);

  const { data: myAlerts } = await supabase.from("theft_alerts").select("id, vehicle_id").eq("owner_id", user.id).eq("status", "open");
  // 받은 제보·대화 (최근 14일, 내 이동수단 것만: RLS)
  const since = new Date(Date.now() - 14 * 86400e3).toISOString();
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
      const recent = Date.now() - new Date(r.created_at).getTime() < 3 * 86400e3;
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
  const nickname = profile?.nickname || user.email?.split("@")[0] || "회원";
  // 시작 안내: 스티커를 연결했거나 부착 위치를 적었으면 붙이기 단계 완료로 봐요
  const liveIds = list.map((v) => v.id);
  const { count: stickerCount } = liveIds.length
    ? await supabase.from("stickers").select("code", { count: "exact", head: true }).eq("claimed_by", user.id).in("vehicle_id", liveIds)
    : { count: 0 };
  const hasSticker = (stickerCount ?? 0) > 0 || list.some((v) => Boolean(v.sticker_spot));
  const fresh = welcome === "1";
  // 알림 안내: 알림 받는 기기가 없을 때. 시작 안내가 보이는 동안은 거기 '알림 켜기'가 있어서 빼요 (수색 중이면 함께 보여요).
  const urgentPush = list.some((v) => v.status === "searching") || (myAlerts ?? []).length > 0;
  const showPushPrompt = list.length > 0 && !hasPush && (urgentPush || !welcomeGuideVisible({ hasVehicle: true, hasSticker, fresh }));

  return (
    <div className="space-y-6">
      {/* 내 정보: 닉네임 + 설정으로 바로 가기 */}
      <Card className="flex items-center gap-4 p-4">
        <span aria-hidden className="grid h-14 w-14 flex-none place-items-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-xl font-extrabold text-white">
          {Array.from(String(nickname))[0]}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-ink-muted">안녕하세요</p>
          <h1 className="line-clamp-1 break-all text-xl font-extrabold tracking-tight">{nickname}님</h1>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-ink-muted">
            <Bike aria-hidden className="h-4 w-4" />내 이동수단 {list.length}개
          </p>
        </div>
      </Card>

      {/* 진행 중인 도난 경보: 이름이 길면 줄임표로 줄이고, 글자가 버튼 밖으로 넘치지 않게 두 줄로 */}
      {(myAlerts ?? []).map((a) => (
        <Link
          key={a.id}
          href={`/alerts/${a.id}`}
          className="flex min-h-14 w-full items-center gap-3 rounded-xl bg-rose-600 px-4 py-3 text-white transition-colors hover:bg-rose-700 active:bg-rose-800"
        >
          <Siren aria-hidden className="h-5 w-5 flex-none" />
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 font-semibold">
              <span className="truncate">{list.find((v) => v.id === a.vehicle_id)?.name ?? "이동수단"}</span>
              <span className="flex-none">&nbsp;도난 경보 진행 중</span>
            </span>
            <span className="block text-[13px] text-white/85">받은 목격 제보 보기</span>
          </span>
          <ChevronRight aria-hidden className="h-5 w-5 flex-none" />
        </Link>
      ))}

      <div className="space-y-1">
        <InboxCard items={inbox} />
        <div className="flex justify-end">
          <Link href="/alerts#mine" className="inline-flex items-center gap-1 py-1.5 text-[13px] font-semibold text-ink-muted hover:text-ink">
            <History aria-hidden className="h-4 w-4" />
            내 경보·제보 기록
            <ChevronRight aria-hidden className="h-4 w-4" />
          </Link>
        </div>
      </div>

      <WelcomeGuide nickname={nickname} hasVehicle={list.length > 0} hasSticker={hasSticker} hasPush={hasPush} fresh={fresh} />

      {showPushPrompt && <PushPrompt userId={user.id} urgent={urgentPush} />}

      <UnfinishedRideCard userId={user.id} />

      {list.length > 0 && (
        <ButtonLink href="/ride" full size="lg" icon={<Play aria-hidden className="h-5 w-5" />}>
          라이딩 시작
        </ButtonLink>
      )}

      {careByVehicle.map(({ v, items }) => (
        <MaintenanceAlert key={v.id} vehicleId={v.id} vehicleName={v.name} items={items} now={now} />
      ))}

      {profile?.is_admin && (
        <div className="grid gap-2 sm:grid-cols-3">
          <ButtonLink href="/admin" variant="secondary" icon={<ChartColumn aria-hidden className="h-4 w-4" />}>
            운영 통계
          </ButtonLink>
          <ButtonLink href="/admin/stickers" variant="secondary" icon={<Printer aria-hidden className="h-4 w-4" />}>
            스티커 관리
          </ButtonLink>
          <ButtonLink href="/admin/reports" variant="secondary" icon={<Flag aria-hidden className="h-4 w-4" />}>
            신고 처리
          </ButtonLink>
        </div>
      )}

      {list.length === 0 ? (
        <EmptyState
          icon={<Bike className="h-7 w-7" />}
          title="아직 등록한 이동수단이 없어요"
          description="자전거나 킥보드를 등록하면 디지털 신분증(QR)이 자동으로 만들어져요."
          action={
            <ButtonLink href="/vehicles/new" full size="lg" icon={<Plus aria-hidden className="h-5 w-5" />}>
              이동수단 등록
            </ButtonLink>
          }
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            {list.map((v) => (
              <VehicleCard key={v.id} vehicle={v} foundReports={counts.get(v.id) ?? 0} />
            ))}
          </div>
          <ButtonLink href="/vehicles/new" full size="lg" variant="secondary" icon={<Plus aria-hidden className="h-5 w-5" />}>
            이동수단 등록
          </ButtonLink>
        </>
      )}

      {(myPosts ?? []).length > 0 && (
        <section className="space-y-3 pt-2">
          <h2 className="text-lg font-bold">내 분실 글</h2>
          <ul className="space-y-3">
            {(myPosts as PostListItem[]).map((p) => (
              <li key={p.id}>
                <PostCard post={p} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
