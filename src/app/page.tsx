import Link from "next/link";
import { Bike, ChevronRight, Lock, MapPin, MapPinned, MessagesSquare, Plus, Printer, Route, ScanLine, Search, Siren, Tag } from "lucide-react";
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

export default async function HomePage({ searchParams }: { searchParams: Promise<{ bye?: string }> }) {
  const { bye } = await searchParams;
  const [recent, user] = await Promise.all([recentPosts(), getUser()]);
  const posts = recent?.posts ?? null;
  return (
    <div className="space-y-8 sm:space-y-12">
      {bye === "1" && !user && (
        <p role="status" className="rounded-2xl bg-slate-100 p-4 text-[15px] leading-relaxed text-ink-soft">
          탈퇴가 끝났어요. 계정과 기록을 모두 지웠어요. 그동안 {site.name}을 이용해 주셔서 고마워요.
        </p>
      )}
      {/* 첫 화면: 무엇을 하는 서비스인지 바로 이해되도록 */}
      <section className="rounded-3xl bg-gradient-to-br from-brand-600 to-brand-800 px-6 py-10 text-white shadow-lift">
        <p className="text-sm font-semibold text-brand-100">{site.tagline}</p>
        <h1 className="mt-3 text-[28px] font-extrabold leading-tight tracking-tight sm:text-4xl">
          내 자전거에
          <br />
          디지털 신분증을 만들어 주세요.
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed text-brand-50/90">
          QR 스티커 하나로 등록하고, 잃어버렸을 때 주변 사람의 제보를 받을 수 있어요.
        </p>
        <div className="mt-7">
          {/* 로그인했으면 내 이동수단으로, 아니면 등록 시작 (QR 스캔은 아래 메뉴 가운데 버튼) */}
          <ButtonLink href={user ? "/dashboard" : "/vehicles/new"} size="lg" full variant="light" icon={<Bike aria-hidden className="h-5 w-5" />}>
            {user ? "내 이동수단 보기" : "무료로 등록하기"}
          </ButtonLink>
        </div>
      </section>

      {/* 순서대로 시작하기: 등록 → QR 붙이기 → 잃어버리면 */}
      <section className="space-y-3">
        <div className="px-1">
          <h2 className="text-xl font-bold tracking-tight">3단계로 시작해요</h2>
          <p className="mt-1 text-sm text-ink-muted">무료예요. 5분이면 잃어버렸을 때 찾을 준비가 끝나요.</p>
        </div>
        <ol className="space-y-3">
          <StepCard n={1} icon={Bike} title="내 이동수단 등록" text="자전거·킥보드 사진과 특징을 넣으면 QR 신분증이 만들어져요.">
            {!user && (
              <ButtonLink href="/vehicles/new" full icon={<Plus aria-hidden className="h-4 w-4" />}>
                등록하기
              </ButtonLink>
            )}
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

      {/* 누구나 쓰는 도구 */}
      <section aria-labelledby="tools-title" className="space-y-3">
        <h2 id="tools-title" className="px-1 text-xl font-bold tracking-tight">
          누구나 쓸 수 있어요
        </h2>
        <Link href="/alerts" className="flex items-center gap-3 rounded-2xl bg-rose-50 p-4 ring-1 ring-rose-100 transition-colors hover:bg-rose-100/70">
          <Siren aria-hidden className="h-6 w-6 flex-none text-rose-600" />
          <span className="min-w-0 flex-1">
            <span className="block font-bold text-rose-800">근처 도난 경보</span>
            <span className="block text-[13px] text-rose-700/80">방금 도둑맞은 자전거·킥보드를 같이 찾아 주세요</span>
          </span>
          <ChevronRight aria-hidden className="h-5 w-5 flex-none text-rose-400" />
        </Link>
        <div className="grid grid-cols-2 gap-3">
          <ToolCard href="/check" icon={Search} color="text-brand-600" title="도난 조회" text="중고로 사기 전 번호·판매 글로 확인" />
          <ToolCard href="/scan" icon={ScanLine} color="text-brand-600" title="QR 찍어 제보" text="길에서 본 자전거 QR을 찍어 알려 주기" />
          <ToolCard href="/community" icon={MessagesSquare} color="text-emerald-600" title="분실 커뮤니티" text="분실 글 보고 댓글로 알려 주기" />
          <ToolCard href="/stats" icon={MapPinned} color="text-rose-600" title="도난 다발 지도" text="어디서 많이 도둑맞을까?" />
        </div>
      </section>

      {/* 분실 커뮤니티 */}
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

      {/* 라이딩 기록 → 정비 알림 */}
      <Link href="/ride" className="flex items-center gap-4 rounded-2xl bg-gradient-to-br from-emerald-50 to-white p-4 shadow-card ring-1 ring-line/70 transition-shadow hover:shadow-lift">
        <span aria-hidden className="grid h-12 w-12 flex-none place-items-center rounded-2xl bg-emerald-600 text-white">
          <Route className="h-6 w-6" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold">라이딩 기록 · 정비 알림</span>
          <span className="block text-[13px] leading-snug text-ink-muted">달린 거리로 체인·브레이크·타이어 교체 시기를 알려 드려요</span>
        </span>
        <ChevronRight aria-hidden className="h-5 w-5 flex-none text-ink-faint" />
      </Link>

      {/* 안심 문구 */}
      <p className="flex items-start gap-2 rounded-2xl bg-slate-100 p-4 text-[13px] leading-relaxed text-ink-soft">
        <Lock aria-hidden className="mt-0.5 h-4 w-4 flex-none" />
        <span>
          QR에는 무작위 코드만 들어 있어요. 주인의 이름·전화번호·주소는 공개하지 않고, 실시간 위치 추적이 아니라 발견한 사람이 그 자리에서 알려 주는 방식이에요.
        </span>
      </p>
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
