import { UUID_RE } from "@/lib/community";
import { renderRideCard } from "@/lib/ride/card";
import { fromPathJson } from "@/lib/ride/geo";
import { createClient } from "@/lib/supabase/server";

/** 내 라이딩 공유 카드 (PNG) */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return new Response("없는 기록이에요.", { status: 404 });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("로그인이 필요해요.", { status: 401 });
  const { data: ride, error } = await supabase
    .from("rides")
    .select("started_at, moving_sec, distance_m, max_speed_kmh, path, vehicle:vehicles(name)")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error(error);
    return new Response("기록을 불러오지 못했어요.", { status: 500 });
  }
  if (!ride) return new Response("없는 기록이에요.", { status: 404 });
  const vehicle = ride.vehicle as unknown as { name: string } | null;
  const { data: zones, error: zErr } = await supabase.from("privacy_zones").select("lat, lng, radius_m").eq("owner_id", user.id);
  if (zErr) console.error(zErr);
  return renderRideCard({ ...ride, path: fromPathJson(ride.path), vehicleName: vehicle?.name ?? null, zones: zones ?? [] });
}
