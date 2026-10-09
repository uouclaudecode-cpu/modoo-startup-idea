import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { NewPostForm, type VehicleOption } from "./NewPostForm";

export const metadata: Metadata = { title: "커뮤니티 글 올리기" };

/** 분실 글 / 발견 글(주인을 찾아요) 올리기. ?vehicle= 로 내 이동수단을, ?kind=found 로 발견 글을 미리 고를 수 있어요. */
export default async function NewPostPage({ searchParams }: { searchParams: Promise<{ vehicle?: string; kind?: string }> }) {
  const { vehicle: vehicleParam, kind: kindParam } = await searchParams;
  const kind = kindParam === "found" ? "found" : "lost";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const qs = new URLSearchParams();
    if (vehicleParam) qs.set("vehicle", vehicleParam);
    if (kind === "found") qs.set("kind", "found");
    const s = qs.toString();
    redirect(`/login?next=${encodeURIComponent("/community/new" + (s ? `?${s}` : ""))}`);
  }

  const { data, error } = await supabase
    .from("vehicles")
    .select("id, type, name, brand, model, color, description, image_path, status")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) console.error(error);
  const vehicles = (data ?? []) as VehicleOption[];
  const initial = vehicles.find((v) => v.id === vehicleParam)?.id ?? "";

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Link href="/community" className="inline-flex items-center gap-1 text-sm font-semibold text-ink-muted hover:text-ink">
        <ChevronLeft aria-hidden className="h-4 w-4" />
        커뮤니티
      </Link>
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">글 올리기</h1>
        <p className="mt-1 text-sm leading-relaxed text-ink-muted">
          잃어버렸다면 잃어버린 곳과 특징을, 주인 없는 자전거·킥보드를 봤다면 발견한 곳과 모습을 자세히 적어 주세요. 연락처는 적지 마세요. 댓글이나
          비밀 댓글로 이야기할 수 있어요.
        </p>
      </div>
      <NewPostForm vehicles={vehicles} initialVehicleId={initial} initialKind={kind} />
    </div>
  );
}
