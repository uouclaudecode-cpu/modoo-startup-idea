import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ZoneManager, type PrivacyZone, type ZoneSuggestion } from "./ZoneManager";

export const metadata: Metadata = { title: "집·회사 가림" };

export default async function PrivacyZonesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/settings/privacy-zones");

  const [{ data: zones, error }, { data: sugg, error: sErr }, { data: prof }] = await Promise.all([
    supabase.from("privacy_zones").select("id, label, lat, lng, radius_m").eq("owner_id", user.id).order("created_at", { ascending: true }),
    supabase.rpc("suggest_privacy_zones"),
    supabase.from("profiles").select("share_trim_m").eq("id", user.id).maybeSingle(),
  ]);
  if (error) console.error(error);
  if (sErr) console.error(sErr);

  return (
    <div className="mx-auto max-w-md space-y-4">
      <Link href="/settings" className="-ml-2 inline-flex h-10 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-ink-muted hover:bg-slate-100 hover:text-ink">
        <ChevronLeft aria-hidden className="h-4 w-4" />
        설정
      </Link>
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">집·회사 가림</h1>
        <p className="mt-1 text-[15px] leading-relaxed text-ink-muted">
          정해 둔 곳 근처의 길은 <b className="text-ink">공유 카드와 경로 파일에서 빠져요.</b> 라이딩 기록과 거리 계산은 그대로라 정비 알림도 정확해요.
        </p>
      </div>
      <ZoneManager zones={(zones ?? []) as PrivacyZone[]} suggestions={(sugg ?? []) as ZoneSuggestion[]} shareTrim={(prof as { share_trim_m?: number } | null)?.share_trim_m ?? 300} />
      <p className="flex items-start gap-2 rounded-xl bg-slate-100 p-3 text-[13px] leading-relaxed text-ink-soft">
        <ShieldCheck aria-hidden className="mt-0.5 h-4 w-4 flex-none" />
        가림 장소는 나만 볼 수 있어요. 라이딩 기록도 원래 나만 보이고, 남에게 보이는 건 내가 직접 공유한 사진·파일뿐이에요. 출발·도착 근처는 위에서 정한 거리만큼 빠져요(‘안 가림’이면 그대로 보여요).
      </p>
    </div>
  );
}
