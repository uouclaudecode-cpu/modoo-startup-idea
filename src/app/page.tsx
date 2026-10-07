import Link from "next/link";
import { Bike, Camera, ChevronRight, Lock, MapPinned, MessagesSquare, QrCode, ScanLine, Siren, Sticker } from "lucide-react";
import { site } from "@/config/site";
import { ButtonLink, Card, StatusBadge } from "@/components/ui";
import { PostCard, type PostListItem } from "@/components/community/PostCard";
import { POST_LIST_COLUMNS } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";

const STEPS = [
  { icon: Bike, title: "이동수단 등록", text: "자전거·킥보드의 사진과 특징을 등록해요." },
  { icon: QrCode, title: "고유 QR 생성", text: "예측할 수 없는 나만의 QR이 자동으로 만들어져요." },
  { icon: Sticker, title: "QR 부착", text: "QR 이미지를 저장해 이동수단에 붙여 두세요." },
  { icon: Siren, title: "분실 시 수색 중으로", text: "잃어버리면 버튼 하나로 '수색 중'으로 바꿔요." },
  { icon: ScanLine, title: "주변 사람이 스캔", text: "발견한 사람이 로그인 없이 QR을 스캔해요." },
  { icon: MapPinned, title: "발견 위치 제보", text: "발견 위치와 사진이 소유자에게만 전달돼요." },
  { icon: MessagesSquare, title: "커뮤니티에 분실 글", text: "QR이 없어도 분실 글을 올리면 본 사람이 댓글·비밀 댓글로 알려줘요." },
];

/** 최근 '찾는 중' 글 3개 (불러오지 못해도 첫 화면은 그대로 보여요) */
async function recentPosts() {
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
    return [];
  }
  return (data ?? []) as PostListItem[];
}

export default async function HomePage() {
  const posts = await recentPosts();
  return (
    <div className="space-y-12">
      {/* 첫 화면: 무엇을 하는 서비스인지 바로 이해되도록 */}
      <section className="rounded-3xl bg-gradient-to-br from-brand-600 to-brand-800 px-6 py-10 text-white shadow-lift">
        <p className="text-sm font-semibold text-brand-100">{site.tagline}</p>
        <h1 className="mt-3 text-[28px] font-extrabold leading-tight tracking-tight sm:text-4xl">
          내 자전거에
          <br />
          디지털 신분증을 만들어주세요.
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed text-brand-50/90">
          QR 하나로 등록하고, 잃어버렸을 때 주변 사람의 제보를 받을 수 있습니다.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <ButtonLink href="/vehicles/new" size="lg" full variant="light" icon={<Bike aria-hidden className="h-5 w-5" />}>
            내 이동수단 등록하기
          </ButtonLink>
          <ButtonLink href="/scan" size="lg" full variant="glass" icon={<Camera aria-hidden className="h-5 w-5" />}>
            QR 스캔하기
          </ButtonLink>
        </div>
      </section>

      {/* 작동 방식 */}
      <section>
        <h2 className="text-xl font-bold tracking-tight">이렇게 작동해요</h2>
        <ol className="mt-4 grid gap-3 sm:grid-cols-2">
          {STEPS.map((s, i) => (
            <li key={s.title}>
              <Card className="flex h-full items-start gap-4 p-4">
                <span className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-brand-50 text-brand-600">
                  <s.icon aria-hidden className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-[13px] font-semibold text-brand-600">STEP {i + 1}</p>
                  <p className="font-bold">{s.title}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-ink-muted">{s.text}</p>
                </div>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      {/* 분실 커뮤니티 */}
      <section>
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold tracking-tight">지금 찾고 있어요</h2>
            <p className="mt-1 text-sm text-ink-muted">비슷한 자전거·킥보드를 봤다면 댓글로 알려주세요.</p>
          </div>
          <Link href="/community" className="flex flex-none items-center text-sm font-semibold text-brand-700 hover:underline">
            전체 보기 <ChevronRight aria-hidden className="h-4 w-4" />
          </Link>
        </div>
        {posts.length > 0 ? (
          <ul className="mt-4 space-y-3">
            {posts.map((p) => (
              <li key={p.id}>
                <PostCard post={p} />
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

      {/* 분실 상황에서 받는 도움 */}
      <section>
        <h2 className="text-xl font-bold tracking-tight">잃어버렸을 때 이렇게 도와드려요</h2>
        <Card className="mt-4 space-y-4">
          <p className="text-[15px] leading-relaxed text-ink-soft">
            상태를 <b className="text-ink">수색 중</b>으로 바꾸면, QR을 스캔한 사람에게 &lsquo;분실/도난 수색 중&rsquo; 안내와 이동수단의
            사진·색상·특징이 보여요. 발견한 사람은 로그인 없이 <b className="text-ink">발견 위치 제보</b>를 보낼 수 있고, 제보는 소유자
            계정에서만 확인할 수 있어요.
          </p>
          <div className="flex flex-wrap gap-2">
            <StatusBadge status="active" />
            <StatusBadge status="searching" />
            <StatusBadge status="reported" />
            <StatusBadge status="recovered" />
          </div>
          <p className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-[13px] leading-relaxed text-ink-muted">
            <Lock aria-hidden className="mt-0.5 h-4 w-4 flex-none" />
            이 서비스는 실시간 위치 추적 장치가 아니에요. 발견한 사람이 그 자리에서 알려주는 발견 위치 제보 방식이며, 소유자의
            이름·전화번호·이메일·주소는 공개하지 않아요.
          </p>
        </Card>
      </section>
    </div>
  );
}
