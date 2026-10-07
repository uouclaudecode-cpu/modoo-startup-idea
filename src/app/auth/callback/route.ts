import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** 가입 확인 메일의 링크를 누르면 이곳으로 돌아와 로그인을 마칩니다. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") || "/dashboard";
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard"}`);
  }
  return NextResponse.redirect(`${origin}/login?error=confirm`);
}
