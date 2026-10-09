import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, Lock } from "lucide-react";
import { ErrorState } from "@/components/ui";
import { requireAdmin } from "@/lib/admin";
import { AreaManager, type AreaStat } from "./AreaManager";

export const metadata: Metadata = { title: "관심 구역 통계", robots: { index: false } };

/** 관리자 전용: 원하는 구역별 숫자 (제휴 제안 자료) */
export default async function AdminAreasPage() {
  const { supabase } = await requireAdmin("/admin/areas");
  const { data, error } = await supabase.rpc("admin_area_stats");
  if (error) {
    console.error(error);
    return <ErrorState title="구역 통계를 불러오지 못했어요" description="잠시 후 새로고침해 주세요." />;
  }
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10).replace(/-/g, ".");

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Link href="/admin" className="-ml-2 inline-flex h-10 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-ink-muted hover:bg-slate-100 hover:text-ink">
        <ChevronLeft aria-hidden className="h-4 w-4" />
        운영 통계
      </Link>
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">관심 구역 통계</h1>
        <p className="mt-1 text-sm leading-relaxed text-ink-muted">
          학교·아파트·가게 주변처럼 원하는 곳을 원으로 정해 숫자를 봐요. 위쪽 파란 칸은 캡처해서 제휴 제안 자료로 쓰기 좋게 만들었어요.
        </p>
      </div>
      <p className="flex items-start gap-2 rounded-xl bg-slate-100 p-3 text-[13px] leading-relaxed text-ink-soft">
        <Lock aria-hidden className="mt-0.5 h-4 w-4 flex-none" />
        이 화면은 관리자만 볼 수 있고, 사용자 앱에는 구역 이름이 나오지 않아요. 숫자만 모아서 보여 주고 누가 어디에 세웠는지는 보여 주지 않아요. &lsquo;활동 이동수단&rsquo;은 마지막으로 세운 곳이나 라이딩 출발점이 이 구역인 이동수단이에요.
      </p>
      <AreaManager areas={(data ?? []) as AreaStat[]} today={today} />
    </div>
  );
}
