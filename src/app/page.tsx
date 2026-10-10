import Link from "next/link";
import {
  Bike,
  ChevronRight,
  Lock,
  MapPin,
  MapPinned,
  MessagesSquare,
  Navigation,
  Plus,
  Printer,
  Route,
  ScanLine,
  Search,
  ShieldCheck,
  Siren,
  Tag,
  Wind,
  Wrench,
} from "lucide-react";
import { site } from "@/config/site";
import { ButtonLink, Card } from "@/components/ui";
import { PostCard, type PostListItem } from "@/components/community/PostCard";
import { loadPostAvatars, POST_LIST_COLUMNS } from "@/lib/community";
import { createClient, getUser } from "@/lib/supabase/server";

/**
 * 최근 '찾는 중' 글 3개.
 * 불러오지 못해도 첫 화면은 그대로 보여요. 이때는 null을 돌려줘서 '글이 없어요' 대신 '불러오지 못했어요'를 보여줘요.
 */
async function recentPosts(): Promise<{ posts: PostListItem[]; avatars: Record<string, string> } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lost_posts")
    .select(POST_LIST_COLUMNS)
    .is("deleted_at", null)
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(3);
  if (error) {
    console.error(error);
    return null;
  }
  const posts = (data ?? []) as PostListItem[];
  return { posts, avatars: await loadPostAvatars(supabase, posts.map((p) => p.id)) };
}

/** 로그인한 사람의 이름과 이동수단 상태 (홈 맨 위 내 상태 카드) */
async function myStatus(userId: string) {
  const supabase = await createClient();
  const [{ data: profile }, { data: vehicles, error }] = await Promise.all([
    supabase.from("profiles").select("nickname").eq("id", userId).maybeSingle(),
    supabase.from("vehicles").select("id, status").is("deleted_at", null),
  ]);
  if (error) console.error(error);
  const list = (vehicles ?? []) as { id: string; status: string }[];
  return { nickname: profile?.nickname || "회원", count: list.length, searching: list.filter((v) => v.status === "searching") };
}

/** 로그인한 사람의 바로가기 (자주 쓰는 순서) */
const QUICK = [
  { href: "/ride", label: "라이딩 시작", icon: Route, color: "text-emerald-600", bg: "bg-emerald-50" },
  { href: "/navigate", label: "길 안내", icon: Navigation, color: "text-brand-600", bg: "bg-brand-50" },
  { href: "/maintenance", label: "소모품·정비", icon: Wrench, color: "text-amber-600", bg: "bg-amber-50" },
  { href: "/spots", label: "보관소·공기주입기", icon: Wind, color: "text-sky-600", bg: "bg-sky-50" },
];

/**
 * 홈
 * - 로그인: 내 상태 → 바로가기 → (이동수단이 없으면 3단계) → 근처 도난 경보 → 지금 찾고 있어요 → 도난 예방 도구
 * - 처음 온 사람: 소개 → 3단계 → 라이딩도 한 앱에서 → 근처 도난 경보 → 지금 찾고 있어요 → 도난 예방 도구 → 안심 문구
 */
export default async function HomePage({ searchParams }: { searchParams: Promise<{ bye?: string }> }) {
  const { bye } = await searchParams;
  const [recent, user] = await Promise.all([recentPosts(), getUser()]);
  const posts = recent?.posts ?? null;
  const me = user ? await myStatus(user.id) : null;
  // 3단계 안내는 처음 온 사람과, 아직 이동수단이 없는 회원에게만
  const showSteps = !me || me.count === 0;

  return (
    <div className="space-y-8 sm:space-y-12">
      {bye === "1" && !user && (
        <p role="status" className="rounded-2xl bg-slate-100 p-4 text-[15px] leading-relaxed text-ink-soft">
          탈퇴가 끝났어요. 계정과 기록을 모두 지웠어요. 그동안 {site.name}을 이용해 주셔서 고마워요.
        </p>
      )}

      {me ? (
        /* ① 로그인: 내 상태 + 자주 쓰는 바로가기 */
        <section className="space-y-3">
          <h1 className="sr-only">{site.name} 홈</h1>
          {me.searching.length > 0 ? (
            <Link
              href={me.searching.length === 1 ? `/vehicles/${me.searching[0].id}/reports` : "/dashboard"}
              className="flex items-center gap-3 rounded-3xl bg-rose-600 p-5 text-white shadow-lift transition-colors hover:bg-rose-700"
            >
              <Siren aria-hidden className="h-8 w-8 flex-none" />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold text-rose-100">{me.nickname}님</span>
                <span className="block text-lg font-extrabold leading-snug">이동수단 {me.searching.length}대를 찾고 있어요</span>
                <span className="block text-[13px] text-rose-50/90">받은 제보·대화 보기</span>
              </span>
              <ChevronRight aria-hidden className="h-5 w-5 flex-none" />
            </Link>
          ) : (
            <Link href={me.count > 0 ? "/dashboard" : "/vehicles/new"} className="flex items-center gap-3 rounded-3xl bg-gradient-to-br from-brand-600 to-brand-800 p-5 text-white shadow-lift">
              <ShieldCheck aria-hidden className="h-8 w-8 flex-none" />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold text-brand-100">{me.nickname}님</span>
                <span className="block text-lg font-extrabold leading-snug">{me.count > 0 ? `내 이동수단 ${me.count}대 · 모두 안전해요` : "이동수단을 등록해 주세요"}</span>
                <span className="block text-[13px] text-brand-50/90">{me.count > 0 ? "MY에서 QR·제보·정비 관리" : "등록하면 QR 신분증이 바로 만들어져요"}</span>
              </span>
              <ChevronRight aria-hidden className="h-5 w-5 flex-none" />
            </Link>
          )}
          <div className="grid grid-cols-4 gap-2">
            {QUICK.map((q) => (
              <Link
                key={q.href}
                href={q.href}
                className="flex min-h-[88px] flex-col items-center justify-center gap-1.5 rounded-2xl bg-white px-1 py-2.5 text-center text-[12px] font-semibold leading-tight shadow-card ring-1 ring-line/70 hover:bg-slate-50"
              >
                <span className={`grid h-10 w-10 place-items-center rounded-full ${q.bg}`}>
                  <q.icon aria-hidden className={`h-5 w-5 ${q.color}`} />
                </span>
                <span className="break-keep">{q.label}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : (
        /* ① 처음 온 사람: 무엇을 하는 서비스인지 바로 이해되도록 */
        <section className="rounded-3xl bg-gradient-to-br from-brand-600 to-brand-800 px-6 py-10 text-white shadow-lift">
          <p className="text-sm font-semibold text-brand-100">{site.tagline}</p>
          <h1 className="mt-3 text-[28px] font-extrabold leading-tight tracking-tight sm:text-4xl">
            내 자전거에
            <br />
            디지털 신분증을 만들어 주세요.
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-brand-50/90">
            QR 스티커 하나로 등록하고, 잃어버렸을 때 주변 사람의 제보를 받을 수 있어요. 라이딩 기록과 정비 알림도 함께요.
          </p>
          <div className="mt-7">
            <ButtonLink href="/vehicles/new" size="lg" full variant="light" icon={<Bike aria-hidden className="h-5 w-5" />}>
              무료로 등록하기
            </ButtonLink>
          </div>
        </section>
      )}

      {/* ② 순서대로 시작하기: 처음 온 사람과, 아직 이동수단이 없는 회원에게만 */}
      {showSteps && (
        <section className="space-y-3">
          <div className="px-1">
            <h2 className="text-xl font-bold tracking-tight">3단계로 시작해요</h2>
            <p className="mt-1 text-sm text-ink-muted">무료예요. 5분이면 잃어버렸을 때 찾을 준비가 끝나요.</p>
          </div>
          <ol className="space-y-3">
            <StepCard n={1} icon={Bike} title="내 이동수단 등록" text="자전거·킥보드 사진과 특징을 넣으면 QR 신분증이 만들어져요.">
              <ButtonLink href="/vehicles/new" full icon={<Plus aria-hidden className="h-4 w-4" />}>
                등록하기
              </ButtonLink>
            </StepCard>
            <StepCard n={2} icon={Tag} title="QR 준비 후 연결" text="QR을 출력하거나 스티커를 받아서 내 이동수단에 연결하고, 안장 밑처럼 주인만 아는 곳에 붙여요.">
              <ul className="mb-3 space-y-1.5 rounded-xl bg-slate-50 p-3 text-[13px] leading-relaxed text-ink-soft">
                <li>
                  <b className="text-ink">출력한 QR</b> · 처음부터 내 이동수단 QR이라 바로 붙이면 끝이에요.
                </li>
                <li>
                  <b className="text-ink">받은 스티커</b> · 아직 주인이 없는 스티커예요. 붙이기 전에 한 번 찍어서 내 것으로 연결해요.
                </li>
              </ul>
              <div className="grid grid-cols-2 gap-2">
                <ButtonLink href="/print" icon={<Printer aria-hidden className="h-4 w-4" />}>
                  QR 출력하기
                </ButtonLink>
                <ButtonLink href="/get-sticker" variant="secondary" icon={<MapPin aria-hidden className="h-4 w-4" />}>
                  받는 곳
                </ButtonLink>
                <ButtonLink href="/scan" variant="secondary" className="col-span-2" icon={<ScanLine aria-hidden className="h-4 w-4" />}>
                  받은 스티커 연결하기
                </ButtonLink>
              </div>
            </StepCard>
            <StepCard
              n={3}
              icon={Siren}
              title="잃어버리면 알리기"
              text="'수색 중'으로 바꾸고 도난 경보를 보내면 근처 사용자에게 알림이 가요. 누가 QR을 찍으면 위치·사진이 나에게만 와요."
            />
          </ol>
        </section>
      )}

      {/* ③ 처음 온 사람에게: 라이딩·정비도 한 앱에서 (로그인했으면 위 바로가기로 대신해요) */}
      {!me && (
        <section aria-labelledby="ride-title" className="space-y-3">
          <div className="px-1">
            <h2 id="ride-title" className="text-xl font-bold tracking-tight">
              라이딩도 {site.name} 하나로
            </h2>
            <p className="mt-1 text-sm text-ink-muted">타는 것부터 관리까지, 따로 앱을 깔 필요 없어요.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <ToolCard href="/ride" icon={Route} color="text-emerald-600" title="라이딩 기록" text="달린 거리·시간·경로를 무료로" />
            <ToolCard href="/navigate" icon={Navigation} color="text-brand-600" title="자전거 길 안내" text="꺾는 곳·사고 잦은 곳 미리 알림" />
            <ToolCard href="/maintenance" icon={Wrench} color="text-amber-600" title="소모품 정비 알림" text="탄 거리로 타이어·체인 교체 시기" />
            <ToolCard href="/spots" icon={Wind} color="text-sky-600" title="보관소·공기주입기" text="내 주변에서 바로 찾기" />
          </div>
        </section>
      )}

      {/* ④ 근처 도난 경보 */}
      <Link href="/alerts" className="flex items-center gap-3 rounded-2xl bg-rose-50 p-4 ring-1 ring-rose-100 transition-colors hover:bg-rose-100/70">
        <Siren aria-hidden className="h-6 w-6 flex-none text-rose-600" />
        <span className="min-w-0 flex-1">
          <span className="block font-bold text-rose-800">근처 도난 경보</span>
          <span className="block text-[13px] text-rose-700/80">방금 도둑맞은 자전거·킥보드를 같이 찾아 주세요</span>
        </span>
        <ChevronRight aria-hidden className="h-5 w-5 flex-none text-rose-400" />
      </Link>

      {/* ⑤ 지금 찾고 있어요 (분실 커뮤니티) */}
      <section>
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold tracking-tight">지금 찾고 있어요</h2>
            <p className="mt-1 text-sm text-ink-muted">비슷한 자전거·킥보드를 봤다면 댓글로 알려 주세요.</p>
          </div>
          <Link href="/community" className="flex flex-none items-center text-sm font-semibold text-brand-700 hover:underline">
            전체 보기 <ChevronRight aria-hidden className="h-4 w-4" />
          </Link>
        </div>
        {posts === null ? (
          <p role="alert" className="mt-4 rounded-2xl bg-rose-50/60 p-4 text-center text-[15px] text-ink-soft ring-1 ring-rose-200">
            글을 불러오지 못했어요. 잠시 후 새로고침하거나{" "}
            <Link href="/community" className="font-semibold text-brand-700 underline">
              커뮤니티
            </Link>
            에서 확인해 주세요.
          </p>
        ) : posts.length > 0 ? (
          <ul className="mt-4 space-y-3">
            {posts.map((p) => (
              <li key={p.id}>
                <PostCard post={p} avatarPath={recent?.avatars[p.id]} />
              </li>
            ))}
          </ul>
        ) : (
          <Card className="mt-4 flex flex-col items-center gap-3 py-8 text-center">
            <MessagesSquare aria-hidden className="h-8 w-8 text-brand-600" />
            <p className="text-[15px] text-ink-soft">지금 찾는 중인 글이 없어요. 잃어버렸다면 분실 글을 올려 보세요.</p>
            <ButtonLink href="/community/new" variant="secondary">
              분실 글 올리기
            </ButtonLink>
          </Card>
        )}
      </section>

      {/* ⑥ 도난 예방 도구 (QR 찍기는 아래 메뉴 가운데 버튼이라 여기서는 빼요) */}
      <section aria-labelledby="tools-title" className="space-y-3">
        <h2 id="tools-title" className="px-1 text-xl font-bold tracking-tight">
          도난 예방 도구
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <ToolCard href="/check" icon={Search} color="text-brand-600" title="도난 조회" text="중고로 사기 전 번호·판매 글로 확인" />
          <ToolCard href="/stats" icon={MapPinned} color="text-rose-600" title="도난 다발 지도" text="어디서 많이 도둑맞을까?" />
        </div>
      </section>

      {/* ⑦ 안심 문구 (처음 온 사람에게) */}
      {!me && (
        <p className="flex items-start gap-2 rounded-2xl bg-slate-100 p-4 text-[13px] leading-relaxed text-ink-soft">
          <Lock aria-hidden className="mt-0.5 h-4 w-4 flex-none" />
          <span>
            QR에는 무작위 코드만 들어 있어요. 주인의 이름·전화번호·주소는 공개하지 않고, 실시간 위치 추적이 아니라 발견한 사람이 그 자리에서 알려 주는 방식이에요.
          </span>
        </p>
      )}
    </div>
  );
}

function StepCard({ n, icon: Icon, title, text, children }: { n: number; icon: typeof Bike; title: string; text: string; children?: React.ReactNode }) {
  return (
    <li className="rounded-2xl bg-white p-4 shadow-card ring-1 ring-line/70">
      <div className="flex gap-3">
        <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-brand-600 text-[15px] font-extrabold text-white">{n}</span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 font-bold">
            <Icon aria-hidden className="h-4 w-4 text-brand-600" />
            {title}
          </p>
          <p className="mt-0.5 text-[14px] leading-relaxed text-ink-muted">{text}</p>
        </div>
      </div>
      {children && <div className="mt-3">{children}</div>}
    </li>
  );
}

function ToolCard({ href, icon: Icon, color, title, text }: { href: string; icon: typeof Bike; color: string; title: string; text: string }) {
  return (
    <Link href={href} className="rounded-2xl bg-white p-4 shadow-card ring-1 ring-line/70 transition-shadow hover:shadow-lift">
      <Icon aria-hidden className={`h-6 w-6 ${color}`} />
      <p className="mt-2 font-bold">{title}</p>
      <p className="mt-0.5 text-[13px] leading-snug text-ink-muted">{text}</p>
    </Link>
  );
}
