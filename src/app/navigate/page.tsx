import type { Metadata } from "next";
import type { RideVehicle } from "../ride/RideTracker";
import { createClient } from "@/lib/supabase/server";
import { Navigator } from "./Navigator";

export const metadata: Metadata = {
  title: "자전거 길 안내",
  description: "자전거로 가기 좋은 길을 찾고, 꺾는 곳과 자전거 사고가 잦은 곳을 미리 알려 줘요.",
};

/** 로그인 없이도 길 안내는 쓸 수 있어요. 로그인하면 라이딩 기록도 함께 남길 수 있어요. */
export default async function NavigatePage({ searchParams }: { searchParams: Promise<{ to?: string; name?: string }> }) {
  const { to, name } = await searchParams;
  const [lat, lng] = (to ?? "").split(",").map(Number);
  const dest = Number.isFinite(lat) && Number.isFinite(lng) && lat >= 33 && lat <= 39 && lng >= 124 && lng <= 132 ? { lat, lng, name: (name ?? "").slice(0, 40) || "고른 곳" } : null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let ride: { userId: string; vehicles: RideVehicle[] } | null = null;
  if (user) {
    const { data, error } = await supabase.from("vehicles").select("id, name, type, subtype, odometer_m").is("deleted_at", null).order("created_at", { ascending: true });
    if (error) console.error(error);
    ride = { userId: user.id, vehicles: (data ?? []) as RideVehicle[] };
  }
  return <Navigator initialDest={dest} ride={ride} />;
}
