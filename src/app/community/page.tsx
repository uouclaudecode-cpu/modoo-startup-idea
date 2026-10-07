import type { Metadata } from "next";
import Link from "next/link";
import { MessagesSquare, PenSquare, Search } from "lucide-react";
import { ButtonLink, EmptyState, ErrorState } from "@/components/ui";
import { PostCard, type PostListItem } from "@/components/community/PostCard";
import { POST_LIST_COLUMNS } from "@/lib/community";
import { cn } from "@/lib/cn";
import { createClient } from "@/lib/supabase/server";
import { VEHICLE_TYPES } from "@/lib/types";

export const metadata: Metadata = {
  title: "분실 커뮤니티",
  description: "잃어버린 자전거·킥보드를 함께 찾는 곳. 봤다면 댓글로 위치와 사진을 알려주세요.",
};

const PAGE_SIZE = 20;
const STATUS_TABS = [
  { value: "open", label: "찾는 중" },
  { value: "resolved", label: "찾았어요" },
  { value: "all", label: "전체" },
] as const;

type Search = { q?: string; status?: string; type?: string; page?: string };

export default async function CommunityPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const status = STATUS_TABS.some((t) => t.value === sp.status) ? sp.status! : "open";
  const type = VEHICLE_TYPES.some((t) => t.value === sp.type) ? sp.type! : "";
  // 검색어의 특수문자는 필터 문법과 섞이지 않게 지웁니다.
  const q = (sp.q ?? "").replace(/[,()%*\\.:]/g, " ").trim().slice(0, 40);
  const page = Math.max(1, Math.min(50, Number(sp.page) || 1));

  const supabase = await createClient();
  let query = supabase
    .from("lost_posts")
    .select(POST_LIST_COLUMNS)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .range(0, page * PAGE_SIZE); // 한 개 더 불러와서 '더 보기' 여부 판단
  if (status !== "all") query = query.eq("status", status);
  if (type) query = query.eq("type", type);
  if (q) query = query.or(`title.ilike.%${q}%,lost_area.ilike.%${q}%,body.ilike.%${q}%,color.ilike.%${q}%,brand.ilike.%${q}%`);
  const { data, error } = await query;

  const href = (patch: Partial<Search>) => {
    const next = new URLSearchParams();
    const merged = { q, status, type, ...patch };
    if (merged.q) next.set("q", merged.q);
    if (merged.status && merged.status !== "open") next.set("status", merged.status);
    if (merged.type) next.set("type", merged.type);
    if (merged.page && merged.page !== "1") next.set("page", merged.page);
    const s = next.toString();
    return s ? `/community?${s}` : "/community";
  };

  const posts = (data ?? []) as PostListItem[];
  const hasMore = posts.length > page * PAGE_SIZE;

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">분실 커뮤니티</h1>
          <p className="mt-1 text-sm text-ink-muted">봤다면 댓글로 알려주세요. 위치·사진·비밀 댓글을 남길 수 있어요.</p>
        </div>
        <ButtonLink href="/community/new" className="flex-none" icon={<PenSquare aria-hidden className="h-4 w-4" />}>
          글쓰기
        </ButtonLink>
      </div>

      {/* 검색 (자바스크립트 없이도 동작하는 일반 폼) */}
      <form action="/community" className="relative">
        {status !== "open" && <input type="hidden" name="status" value={status} />}
        {type && <input type="hidden" name="type" value={type} />}
        <Search aria-hidden className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-faint" />
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="지역, 색상, 브랜드로 검색 (예: 울산대, 검정)"
          aria-label="분실 글 검색"
          className="h-12 w-full rounded-xl border border-line bg-white pl-12 pr-4 text-[16px] placeholder:text-ink-faint focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
        />
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="상태" className="flex rounded-xl bg-slate-100 p-1">
          {STATUS_TABS.map((t) => (
            <Link
              key={t.value}
              href={href({ status: t.value, page: "1" })}
              role="tab"
              aria-selected={status === t.value}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-semibold",
                status === t.value ? "bg-white text-ink shadow-card" : "text-ink-muted hover:text-ink",
              )}
            >
              {t.label}
            </Link>
          ))}
        </div>
        <div className="flex gap-1.5">
          {[{ value: "", label: "전체", emoji: "" }, ...VEHICLE_TYPES].map((t) => (
            <Link
              key={t.value || "all"}
              href={href({ type: t.value, page: "1" })}
              aria-current={type === t.value ? "true" : undefined}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm font-semibold ring-1 ring-inset",
                type === t.value ? "bg-brand-600 text-white ring-brand-600" : "bg-white text-ink-soft ring-line hover:bg-slate-50",
              )}
            >
              {t.emoji && <span aria-hidden>{t.emoji} </span>}
              {t.label}
            </Link>
          ))}
        </div>
      </div>

      {error ? (
        <ErrorState title="글을 불러오지 못했어요" description="인터넷 연결을 확인하고 새로고침해 주세요." />
      ) : posts.length === 0 ? (
        <EmptyState
          icon={<MessagesSquare className="h-7 w-7" />}
          title={q ? `'${q}'에 맞는 글이 없어요` : status === "resolved" ? "아직 찾은 글이 없어요" : "지금 찾는 중인 글이 없어요"}
          description="잃어버렸다면 분실 글을 올려 주세요. 주변 사람들이 보고 댓글로 알려줄 수 있어요."
          action={
            <ButtonLink href="/community/new" full icon={<PenSquare aria-hidden className="h-4 w-4" />}>
              분실 글 올리기
            </ButtonLink>
          }
        />
      ) : (
        <>
          <ul className="space-y-3">
            {posts.slice(0, page * PAGE_SIZE).map((p) => (
              <li key={p.id}>
                <PostCard post={p} />
              </li>
            ))}
          </ul>
          {hasMore && (
            <ButtonLink href={href({ page: String(page + 1) })} variant="secondary" full scroll={false}>
              더 보기
            </ButtonLink>
          )}
        </>
      )}
    </div>
  );
}
