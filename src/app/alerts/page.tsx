import type { Metadata } from "next";
import Link from "next/link";
import { BellRing, ChevronRight, ClipboardList, Siren } from "lucide-react";
import { MyAlerts, alertTodo } from "@/components/alerts/MyAlerts";
import { ButtonLink, Card, ErrorState } from "@/components/ui";
import type { MyAlert, NearbyAlert } from "@/lib/alerts";
import { createClient } from "@/lib/supabase/server";
import { AlertList } from "./AlertList";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "근처 도난 경보", description: "내 근처에서 도난당한 자전거·킥보드를 함께 찾아요." };

export default async function AlertsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let area: { lat: number; lng: number; label: string | null } | null = null;
  let optIn = false;
  if (user) {
    const { data: p } = await supabase.from("profiles").select("alert_opt_in, alert_lat, alert_lng, alert_area_label").eq("id", user.id).maybeSingle();
    optIn = Boolean(p?.alert_opt_in);
    if (p?.alert_lat != null && p?.alert_lng != null) area = { lat: p.alert_lat, lng: p.alert_lng, label: p.alert_area_label };
  }
  const [{ data, error }, mine] = await Promise.all([
    supabase.rpc("nearby_alerts", { p_lat: area?.lat ?? null, p_lng: area?.lng ?? null, p_km: 10 }),
    // 내 경보·제보: 끝난 경보도 다시 열어 사례금을 처리할 수 있게 (로그인했을 때만)
    user ? supabase.rpc("my_alert_activity") : Promise.resolve(null),
  ]);
  if (error) console.error(error);
  if (mine?.error) console.error(mine.error);
  const myAlerts = (mine?.data ?? []) as MyAlert[];
  const todoCount = myAlerts.filter(alertTodo).length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight">
          <Siren aria-hidden className="h-6 w-6 text-rose-600" />
          근처 도난 경보
        </h1>
        <p className="mt-1 text-[15px] text-ink-muted">지금 찾고 있는 자전거·킥보드예요. 비슷한 걸 보면 눌러서 제보해 주세요.</p>
      </div>

      {todoCount > 0 && (
        <a href="#mine" className="flex items-center gap-3 rounded-2xl bg-rose-50 p-4 text-rose-800 ring-1 ring-rose-200">
          <ClipboardList aria-hidden className="h-5 w-5 flex-none" />
          <span className="min-w-0 flex-1 text-[15px] font-semibold">확인할 내 경보·제보가 {todoCount}건 있어요</span>
          <ChevronRight aria-hidden className="h-4 w-4 flex-none" />
        </a>
      )}

      {!optIn && (
        <Card className="flex items-center gap-3 bg-brand-50/60 p-4 ring-brand-100">
          <BellRing aria-hidden className="h-6 w-6 flex-none text-brand-600" />
          <p className="min-w-0 flex-1 text-[14px] leading-relaxed text-ink-soft">
            관심 동네를 정하면 그 근처에서 도난 경보가 나올 때 알림을 받아요. 실시간 위치는 쓰지 않아요.
          </p>
          <ButtonLink href={user ? "/settings#alerts" : "/login?next=/settings%23alerts"} className="h-10 flex-none px-3 text-sm">
            알림 켜기
          </ButtonLink>
        </Card>
      )}

      {error ? (
        // 못 불러왔는데 '경보 없음'으로 보이면 방금 도둑맞은 사람이 잘못 안심해요
        <ErrorState title="경보를 불러오지 못했어요" description="인터넷 연결을 확인하고 새로고침해 주세요." />
      ) : (
        <AlertList initial={(data ?? []) as NearbyAlert[]} areaLabel={area ? (area.label ?? "관심 동네") : null} />
      )}

      {user && <MyAlerts items={myAlerts} failed={Boolean(mine?.error)} />}

      <p className="text-center text-[13px] text-ink-muted">
        내 이동수단을 잃어버렸나요?{" "}
        <Link href="/dashboard" className="font-semibold text-brand-700 underline">
          MY → 이동수단 → 분실·도난 신고
        </Link>
      </p>
    </div>
  );
}
