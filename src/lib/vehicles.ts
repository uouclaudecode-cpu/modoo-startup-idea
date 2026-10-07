import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Vehicle } from "@/lib/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 로그인한 사용자의 이동수단 하나를 불러옵니다.
 * 없거나, 남의 것이거나(RLS가 막음), 삭제된 경우 404 화면을 보여줍니다.
 */
export async function getOwnedVehicle(id: string, nextPath: string) {
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);

  const { data, error } = await supabase.from("vehicles").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data || data.deleted_at) notFound();
  return { supabase, vehicle: data as Vehicle };
}
