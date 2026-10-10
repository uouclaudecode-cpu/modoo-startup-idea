import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Bike,
  BookOpen,
  Bug,
  ChartColumn,
  ChevronRight,
  Flag,
  Gauge,
  History,
  MapPin,
  MessageCircleQuestion,
  Navigation,
  Plus,
  Printer,
  Route,
  Search,
  Wind,
  Wrench,
} from "lucide-react";
import { StickerActions } from "@/components/vehicle/StickerActions";
import { Card, ErrorState, StatusBadge } from "@/components/ui";
import { VehicleImage } from "@/components/vehicle/VehicleImage";
import { PostCard, type PostListItem } from "@/components/community/PostCard";
import { ActivityCard } from "@/components/profile/ActivityCard";
import { ProfileCard } from "@/components/profile/ProfileCard";
import type { Activity } from "@/lib/activity";
import { POST_LIST_COLUMNS } from "@/lib/community";
import { vehicleImageUrl } from "@/lib/images";
import { createClient } from "@/lib/supabase/server";
import { typeLabel, type Vehicle } from "@/lib/types";

export const metadata: Metadata = { title: "MY" };

/**
 * MY: 내 정보와 더 많은 기능 (설정은 맨 위 카드의 ⚙️ 한 곳)
 * 매일 확인하는 것(내 이동수단 상태·받은 제보·시작 안내·잃어버렸어요)은 홈에 있어요.
 * 여기에는 프로필 → 나의 활동(칭호) → 내 이동수단 관리 → QR 스티커 → 내 분실 글 → 메뉴 → 운영자 순서로 둬요.
 */
export default async function MyPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const { welcome } = await searchParams;
  // 예전 가입 확인 링크(/dashboard?welcome=1)로 온 사람은 시작 안내가 있는 홈으로
  if (welcome === "1") redirect("/?welcome=1");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/dashboard");

  const [{ data: profile }, { data: vehicles, error }, { data: myPosts }, { data: activity, error: actErr }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("vehicles").select("*").is("deleted_at", null).order("created_at", { ascending: false }),
    supabase
      .from("lost_posts")
      .select(POST_LIST_COLUMNS)
      .eq("author_id", user.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(5),
    // 나의 활동 (039가 아직 없으면 카드만 빠져요)
    supabase.rpc("my_activity"),
  ]);
  if (actErr) console.error(actErr);
  if (error) {
    console.error(error);
    return <ErrorState title="정보를 불러오지 못했어요" description="인터넷 연결을 확인하고 새로고침해 주세요." />;
  }
  const list = (vehicles ?? []) as Vehicle[];
  const nickname = profile?.nickname || user.email?.split("@")[0] || "회원";
  // 관리자: 아직 해결하지 않은 오류 수 (034가 없으면 0)
  const errorCount = profile?.is_admin
    ? ((await supabase.from("app_errors").select("id", { count: "exact", head: true }).is("resolved_at", null)).count ?? 0)
    : 0;

  return (
    <div className="space-y-8">
      {/* ① 내 정보 */}
      <div className="space-y-3">
        <h1 className="sr-only">MY</h1>
        <ProfileCard userId={user.id} nickname={nickname} avatarPath={(profile?.avatar_path as string | null | undefined) ?? null} vehicleCount={list.length} />
        {/* 나의 B-LOCK 활동 (칭호·도와준 횟수 등) */}
        {activity && <ActivityCard a={activity as Activity} />}
      </div>

      {/* ② 내 이동수단 관리 (상태·잃어버렸어요는 홈 카드에서) */}
      <Section
        title="내 이동수단"
        action={
          <Link href="/vehicles/new" className="inline-flex h-10 items-center gap-1 rounded-xl bg-brand-50 px-3.5 text-sm font-semibold text-brand-700 hover:bg-brand-100">
            <Plus aria-hidden className="h-4 w-4" />
            추가
          </Link>
        }
      >
        {list.length === 0 ? (
          <Link href="/vehicles/new" className="flex min-h-16 items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-card ring-1 ring-line/70 hover:bg-slate-50">
            <Bike aria-hidden className="h-6 w-6 flex-none text-brand-600" />
            <span className="flex-1 text-[15px] font-semibold">첫 이동수단 등록하기</span>
            <ChevronRight aria-hidden className="h-4 w-4 flex-none text-ink-faint" />
          </Link>
        ) : (
          <Card className="divide-y divide-line/70 p-0">
            {list.map((v) => (
              <Link key={v.id} href={`/vehicles/${v.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                <VehicleImage thumb src={vehicleImageUrl(v.image_path)} type={v.type} alt={v.name} className="h-12 w-12 flex-none rounded-xl" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">{v.name}</span>
                  <span className="block truncate text-[13px] text-ink-muted">
                    {typeLabel(v.type)}
                    {v.brand ? ` · ${v.brand}` : ""}
                  </span>
                </span>
                <StatusBadge status={v.status} />
                <ChevronRight aria-hidden className="h-4 w-4 flex-none text-ink-faint" />
              </Link>
            ))}
          </Card>
        )}
        <p className="px-1 text-[12px] leading-relaxed text-ink-faint">이동수단을 누르면 정보 고치기, 소유권 넘기기, 소유 증명, 삭제를 할 수 있어요.</p>
      </Section>

      {/* ③ QR 스티커 */}
      {list.length > 0 && <StickerActions withLink title="QR 스티커" />}

      {/* ④ 내 분실 글 */}
      {(myPosts ?? []).length > 0 && (
        <Section title="내 분실 글">
          <ul className="space-y-3">
            {(myPosts as PostListItem[]).map((p) => (
              <li key={p.id}>
                <PostCard post={p} avatarPath={(profile?.avatar_path as string | null | undefined) ?? null} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* ⑤ 메뉴: 성격별로 묶어요 */}
      <Section title="메뉴">
        <div className="space-y-3">
          <MenuGroup title="라이딩">
            <MenuRow href="/rides" icon={Route} label="라이딩 기록·통계" />
            <MenuRow href="/maintenance" icon={Wrench} label="소모품·정비" />
            <MenuRow href="/navigate" icon={Navigation} label="자전거 길 안내" />
            <MenuRow href="/spots" icon={Wind} label="보관소·공기주입기" />
          </MenuGroup>
          <MenuGroup title="도난·안전">
            <MenuRow href="/alerts#mine" icon={History} label="내 경보·제보 기록" />
            <MenuRow href="/check" icon={Search} label="도난 조회 · 중고 매물 확인" />
            <MenuRow href="/get-sticker" icon={MapPin} label="스티커 받는 곳" />
          </MenuGroup>
          <MenuGroup title="도움말">
            <MenuRow href="/?intro=1" icon={BookOpen} label="앱 소개 다시 보기" />
            <MenuRow href="/contact" icon={MessageCircleQuestion} label="문의하기" />
          </MenuGroup>
        </div>
        {profile?.is_admin && (
          <Card className="mt-3 divide-y divide-line/70 p-0">
            <p className="px-4 py-2.5 text-[12px] font-bold text-ink-muted">운영자</p>
            <MenuRow href="/admin" icon={ChartColumn} label="운영 통계" />
            <MenuRow href="/admin/stickers" icon={Printer} label="스티커 관리 · 받는 곳" />
            <MenuRow href="/admin/areas" icon={MapPin} label="관심 구역 통계" />
            <MenuRow href="/admin/spots" icon={Wind} label="보관소·공기주입기·사고 자료" />
            <MenuRow href="/admin/reports" icon={Flag} label="신고 처리" />
            <MenuRow href="/admin/usage" icon={Gauge} label="서비스 사용량" />
            <MenuRow href="/admin/errors" icon={Bug} label={`오류 알림${errorCount ? ` (${errorCount})` : ""}`} />
          </Card>
        )}
      </Section>
    </div>
  );
}

/** MY의 묶음 제목 */
function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex min-h-9 items-center justify-between gap-2 px-1">
        <h2 className="text-lg font-bold tracking-tight">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** 메뉴 묶음 (작은 제목 + 카드) */
function MenuGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="divide-y divide-line/70 p-0">
      <p className="px-4 py-2.5 text-[12px] font-bold text-ink-muted">{title}</p>
      {children}
    </Card>
  );
}

/** 메뉴 한 줄 */
function MenuRow({ href, icon: Icon, label }: { href: string; icon: typeof Bike; label: string }) {
  return (
    <Link href={href} className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-slate-50">
      <Icon aria-hidden className="h-5 w-5 flex-none text-ink-soft" />
      <span className="flex-1 text-[15px] font-semibold">{label}</span>
      <ChevronRight aria-hidden className="h-4 w-4 flex-none text-ink-faint" />
    </Link>
  );
}
