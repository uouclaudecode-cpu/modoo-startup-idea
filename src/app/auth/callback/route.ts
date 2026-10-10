import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/safeNext";
import { createClient } from "@/lib/supabase/server";
import { RECOVERY_COOKIE, RECOVERY_MAX_AGE } from "../recovery";

/** 가입 확인·비밀번호 찾기 메일의 링크를 누르면 이곳으로 돌아와 로그인을 마칩니다. */
export async function GET(request: NextRequest) {
  const { searchParams, origin, protocol } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));
  const isRecovery = next.startsWith("/reset-password");
  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const res = NextResponse.redirect(new URL(next, origin));
      if (isRecovery && data.user) {
        res.cookies.set(RECOVERY_COOKIE, data.user.id, {
          httpOnly: true,
          sameSite: "lax",
          secure: protocol === "https:",
          path: "/",
          maxAge: RECOVERY_MAX_AGE,
        });
      }
      return res;
    }
    console.error("인증 링크 처리 실패", error.message);
  }
  // 비밀번호 재설정 링크는 요청한 그 브라우저에서만 열려요 (보안상 브라우저에 남긴 확인값이 필요).
  if (isRecovery) return NextResponse.redirect(new URL("/forgot-password?error=expired", origin));
  // 가입 확인은 다른 브라우저에서 열어도 확인 자체는 끝나요. 로그인하면 원래 가려던 곳(next)으로 이어서 가요.
  // '확인 메일 다시 보내기'로 받은 링크는 code 없이 결과를 주소 끝(#)에 붙여 와요. 브라우저가 # 부분을 그대로 넘겨서
  // 로그인 화면이 읽고 '확인 완료' 또는 '링크 만료'로 안내해요.
  const login = new URL("/login?error=confirm", origin);
  if (next !== "/") login.searchParams.set("next", next);
  return NextResponse.redirect(login);
}
