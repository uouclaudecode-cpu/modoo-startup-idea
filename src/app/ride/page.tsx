import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Bike, Plus } from "lucide-react";
import { ButtonLink, EmptyState, ErrorState } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { RideTracker, type RideVehicle } from "./RideTracker";

export const metadata: Metadata = { title: "라이딩" };

export default async function RidePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/ride");

  const { data, error } = await supabase
    .from("vehicles")
    .select("id, name, type, odometer_m")
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) {
    console.error(error);
    return <ErrorState title="이동수단을 불러오지 못했어요" description="인터넷 연결을 확인하고 새로고침해 주세요." />;
  }
  const vehicles = (data ?? []) as RideVehicle[];
  if (vehicles.length === 0) {
    return (
      <EmptyState
        icon={<Bike className="h-7 w-7" />}
        title="먼저 이동수단을 등록해 주세요"
        description="라이딩 거리는 탄 자전거·킥보드의 소모품 수명에 자동으로 더해져요."
        action={
          <ButtonLink href="/vehicles/new" full icon={<Plus aria-hidden className="h-4 w-4" />}>
            이동수단 등록
          </ButtonLink>
        }
      />
    );
  }
  return <RideTracker vehicles={vehicles} userId={user.id} />;
}
