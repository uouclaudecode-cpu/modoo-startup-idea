import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** 관리자만 들어올 수 있는 화면. 관리자가 아니면 404로 숨깁니다. */
export async function requireAdmin(nextPath: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  const { data, error } = await supabase.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
  if (error) throw error;
  if (!data?.is_admin) notFound();
  return { supabase, user };
}
