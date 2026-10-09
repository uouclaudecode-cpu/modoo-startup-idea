import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, EyeOff } from "lucide-react";
import { NewPostForm, type EditablePost, type VehicleOption } from "@/app/community/new/NewPostForm";
import { postKind, UUID_RE } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "글 고치기", robots: { index: false } };

/** 글쓴이만: 분실·발견 글 고치기 (제목·내용·장소·날짜·지도 핀·사진·이동수단 연결). 상태·댓글은 그대로예요. */
export default async function EditPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/community/${id}/edit`)}`);

  const [{ data: post, error }, { data: vehicleData, error: vErr }] = await Promise.all([
    supabase
      .from("lost_posts")
      .select("id, author_id, kind, vehicle_id, type, title, body, lost_area, lost_on, lost_lat, lost_lng, brand, model, color, image_bucket, image_path, hidden_at")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("vehicles")
      .select("id, type, name, brand, model, color, description, image_path, status")
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
  ]);
  if (error) throw error;
  if (vErr) console.error(vErr);
  // 내가 쓴 글이 아니면 고칠 수 없어요 (없는 글처럼 보여요)
  if (!post || post.author_id !== user.id) notFound();
  const editable = { ...post, kind: postKind(post.kind) } as EditablePost;
  const vehicles = (vehicleData ?? []) as VehicleOption[];

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Link href={`/community/${id}`} className="-ml-2 inline-flex h-10 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-ink-muted hover:bg-slate-100 hover:text-ink">
        <ChevronLeft aria-hidden className="h-4 w-4" />
        글로 돌아가기
      </Link>
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">글 고치기</h1>
        <p className="mt-1 text-sm leading-relaxed text-ink-muted">
          고친 내용은 바로 보여요. 달린 댓글과 &lsquo;찾는 중·찾았어요&rsquo; 상태는 그대로예요. 연락처는 적지 마세요.
        </p>
      </div>
      {post.hidden_at && (
        <div role="status" className="flex items-start gap-3 rounded-2xl bg-amber-50 p-4 text-[14px] leading-relaxed text-amber-900 ring-1 ring-amber-200">
          <EyeOff aria-hidden className="mt-0.5 h-5 w-5 flex-none text-amber-600" />
          <p>신고가 많아 숨겨진 글이에요. 고쳐도 운영자가 확인하기 전까지는 다른 사람에게 보이지 않아요.</p>
        </div>
      )}
      <NewPostForm vehicles={vehicles} initialVehicleId={editable.vehicle_id ?? ""} post={editable} />
    </div>
  );
}
