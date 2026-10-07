import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/safeNext";
import { createClient } from "@/lib/supabase/server";

/** 가입 확인 메일의 링크를 누르면 이곳으로 돌아와 로그인을 마칩니다. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, origin));
    console.error("인증 링크 처리 실패", error.message);
  }
  // 비밀번호 재설정 링크는 요청한 그 브라우저에서만 열려요 (보안상 브라우저에 남긴 확인값이 필요).
  if (next.startsWith("/reset-password")) return NextResponse.redirect(new URL("/forgot-password?error=expired", origin));
  return NextResponse.redirect(new URL("/login?error=confirm", origin));
}
