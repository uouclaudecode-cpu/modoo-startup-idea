import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { NewPostForm, type VehicleOption } from "./NewPostForm";

export const metadata: Metadata = { title: "분실 글 올리기" };

export default async function NewPostPage({ searchParams }: { searchParams: Promise<{ vehicle?: string }> }) {
  const { vehicle: vehicleParam } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent("/community/new" + (vehicleParam ? `?vehicle=${vehicleParam}` : ""))}`);

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
        <h1 className="text-2xl font-extrabold tracking-tight">분실 글 올리기</h1>
        <p className="mt-1 text-sm leading-relaxed text-ink-muted">
          잃어버린 곳과 특징을 자세히 적을수록 찾기 쉬워요. 연락처는 적지 마세요. 본 사람은 댓글이나 비밀 댓글로 알려줄 수 있어요.
        </p>
      </div>
      <NewPostForm vehicles={vehicles} initialVehicleId={initial} />
    </div>
  );
}
