import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, ChevronLeft, Inbox, Lock, MapPin, MessageSquare, Tag } from "lucide-react";
import { ButtonLink, Card, buttonClass } from "@/components/ui";
import { PostStatusBadge } from "@/components/community/PostStatusBadge";
import { VehicleImage } from "@/components/vehicle/VehicleImage";
import { postImageUrl, UUID_RE, type LostPost, type PostComment } from "@/lib/community";
import { formatDate, formatDateTime, timeAgo } from "@/lib/format";
import { publicImageUrl } from "@/lib/images";
import { createClient } from "@/lib/supabase/server";
import { typeLabel } from "@/lib/types";
import { CommentForm } from "./CommentForm";
import { CommentThread } from "./CommentItem";
import { PostActions } from "./PostActions";
import { ShareButton } from "./ShareButton";

type Params = { params: Promise<{ id: string }> };

async function loadPost(id: string) {
  if (!UUID_RE.test(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("lost_posts").select("*").eq("id", id).is("deleted_at", null).maybeSingle();
  if (error) throw error;
  return { supabase, post: data as LostPost | null };
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const res = await loadPost(id).catch(() => null);
  if (!res?.post) return { title: "분실 커뮤니티" };
  const p = res.post;
  return {
    title: p.title,
    description: `${typeLabel(p.type)}${p.color ? ` · ${p.color}` : ""}${p.lost_area ? ` · ${p.lost_area}` : ""} — 보셨다면 댓글로 알려주세요.`,
  };
}

export default async function PostPage({ params }: Params) {
  const { id } = await params;
  const res = await loadPost(id);
  if (!res?.post) notFound();
  const { supabase, post } = res;

  const [{ data: userData }, { data: commentData, error: commentErr }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.rpc("get_post_comments", { p_post: post.id }),
  ]);
  if (commentErr) console.error(commentErr);
  const user = userData.user;
  const isAuthor = user?.id === post.author_id;
  const comments = (commentData ?? []) as PostComment[];

  // 비밀 댓글 사진은 비공개 저장소라서 볼 수 있는 사람에게만 1시간짜리 주소를 만듭니다.
  const secretPaths = comments.filter((c) => c.is_secret && c.image_path).map((c) => c.image_path!);
  const signed = new Map<string, string>();
  if (secretPaths.length) {
    const { data: urls, error } = await supabase.storage.from("community-secret").createSignedUrls(secretPaths, 3600);
    if (error) console.error(error);
    for (const u of urls ?? []) if (u.path && u.signedUrl) signed.set(u.path, u.signedUrl);
  }
  const imageOf: Record<string, string | null> = {};
  for (const c of comments) {
    imageOf[c.id] = !c.image_path ? null : c.is_secret ? (signed.get(c.image_path) ?? null) : publicImageUrl("community-images", c.image_path);
  }
  // 댓글과 답글 묶기 (답글은 한 단계)
  const topLevel = comments.filter((c) => !c.parent_id);
  const repliesOf = (id: string) => comments.filter((c) => c.parent_id === id);

  // 글쓴이에게만: 연결한 이동수단의 스티커 위치 (비밀 답글에 넣기용)
  let stickerSpot: string | null = null;
  if (isAuthor && post.vehicle_id) {
    const { data: v } = await supabase.from("vehicles").select("sticker_spot").eq("id", post.vehicle_id).maybeSingle();
    stickerSpot = v?.sticker_spot ?? "";
  }

  const facts: [string, string | null][] = [
    ["종류", typeLabel(post.type)],
    ["색상", post.color],
    ["브랜드·모델", [post.brand, post.model].filter(Boolean).join(" ") || null],
  ];

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Link href="/community" className="inline-flex items-center gap-1 text-sm font-semibold text-ink-muted hover:text-ink">
        <ChevronLeft aria-hidden className="h-4 w-4" />
        커뮤니티
      </Link>

      <Card className="overflow-hidden p-0">
        <VehicleImage src={postImageUrl(post)} type={post.type} alt={post.title} className="aspect-[4/3]" />
        <div className="space-y-4 p-5">
          <div className="space-y-2">
            <PostStatusBadge status={post.status} />
            <h1 className="text-xl font-extrabold leading-snug tracking-tight sm:text-2xl">{post.title}</h1>
            <p className="text-[13px] text-ink-muted">
              {post.author_name} · <time dateTime={post.created_at} title={formatDateTime(post.created_at)}>{timeAgo(post.created_at)}</time>
            </p>
          </div>

          <div className="grid gap-2 rounded-xl bg-rose-50/70 p-3 text-[15px] ring-1 ring-rose-100">
            {post.lost_area && (
              <p className="flex items-start gap-2">
                <MapPin aria-hidden className="mt-0.5 h-4 w-4 flex-none text-rose-600" />
                <span>
                  <span className="text-[13px] text-ink-muted">잃어버린 곳</span>
                  <br />
                  <b>{post.lost_area}</b>
                </span>
              </p>
            )}
            {post.lost_on && (
              <p className="flex items-center gap-2">
                <CalendarDays aria-hidden className="h-4 w-4 flex-none text-rose-600" />
                <span className="text-[13px] text-ink-muted">잃어버린 날</span>
                <b>{formatDate(post.lost_on)}</b>
              </p>
            )}
          </div>

          <dl className="grid grid-cols-[6rem_1fr] gap-x-3 gap-y-2 text-[15px]">
            {facts.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-ink-muted">{k}</dt>
                <dd className="font-medium">{v || "—"}</dd>
              </div>
            ))}
          </dl>
          <p className="whitespace-pre-line text-[15px] leading-relaxed text-ink">{post.body}</p>
        </div>
      </Card>

      {post.has_sticker && post.status === "open" && (
        <div className="flex items-start gap-3 rounded-2xl bg-brand-50 p-4 text-[14px] leading-relaxed text-brand-900 ring-1 ring-brand-100">
          <Tag aria-hidden className="mt-0.5 h-5 w-5 flex-none text-brand-600" />
          {isAuthor ? (
            <p>
              <b>🏷️ QR 스티커가 붙은 이동수단이에요.</b> &ldquo;이건가요?&rdquo;라는 비밀 댓글이 오면 <b>비밀 답글</b>로 스티커 위치를 알려주세요. 그
              사람이 스티커를 찍으면 위치·사진이 나에게 와요. 스티커 위치는 공개 댓글에 쓰지 마세요.
            </p>
          ) : (
            <p>
              <b>🏷️ 이 자전거에는 B-LOCK QR 스티커가 숨겨져 있어요.</b> 비슷한 자전거를 봤다면 <b>비밀 댓글</b>로 &ldquo;이건가요?&rdquo;라고
              물어보세요. 주인이 스티커 위치를 알려주면, 그 스티커를 찍어서 위치와 사진을 주인에게 바로 보낼 수 있어요.
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-[1fr_auto] gap-2">
        {isAuthor ? (
          <PostActions postId={post.id} status={post.status} vehicleId={post.vehicle_id} />
        ) : (
          <a href="#comment-form" className={buttonClass("primary")}>
            <MessageSquare aria-hidden className="h-4 w-4" />
            봤어요! 댓글 남기기
          </a>
        )}
        <ShareButton title={post.title} />
      </div>

      {isAuthor && post.vehicle_id && (
        <ButtonLink href={`/vehicles/${post.vehicle_id}/reports`} variant="ghost" full icon={<Inbox aria-hidden className="h-4 w-4" />}>
          QR로 받은 발견 제보 보기
        </ButtonLink>
      )}

      <section aria-labelledby="comments-title" className="space-y-3 pt-2">
        <h2 id="comments-title" className="flex items-center gap-2 text-lg font-bold">
          댓글 <span className="text-brand-600">{comments.length}</span>
        </h2>
        {commentErr && <p className="text-sm text-rose-600">댓글을 불러오지 못했어요. 새로고침해 주세요.</p>}
        {comments.length === 0 && !commentErr && (
          <p className="rounded-2xl border border-dashed border-line bg-white px-4 py-8 text-center text-sm text-ink-muted">
            아직 댓글이 없어요. 비슷한 {typeLabel(post.type)}를 봤다면 알려주세요.
          </p>
        )}
        <ul className="space-y-3">
          {topLevel.map((c) => (
            <li key={c.id}>
              <CommentThread
                comment={c}
                replies={repliesOf(c.id)}
                imageOf={imageOf}
                viewerIsAuthor={isAuthor}
                postId={post.id}
                stickerSpot={stickerSpot}
                loggedIn={Boolean(user)}
              />
            </li>
          ))}
        </ul>

        <div id="comment-form" className="scroll-mt-20">
          {user ? (
            <CommentForm postId={post.id} isAuthor={isAuthor} />
          ) : (
            <Card className="space-y-3 text-center">
              <p className="text-[15px] font-semibold">댓글을 남기려면 로그인해 주세요.</p>
              <p className="flex items-center justify-center gap-1.5 text-[13px] text-ink-muted">
                <Lock aria-hidden className="h-3.5 w-3.5" />
                비밀 댓글로 글쓴이에게만 위치를 알려줄 수도 있어요.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <ButtonLink href={`/login?next=/community/${post.id}`}>로그인</ButtonLink>
                <ButtonLink href={`/signup?next=/community/${post.id}`} variant="secondary">
                  회원가입
                </ButtonLink>
              </div>
            </Card>
          )}
        </div>
      </section>
    </div>
  );
}
