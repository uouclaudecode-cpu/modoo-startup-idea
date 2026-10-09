import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { RECOVERY_COOKIE } from "../recovery";

/** 로그아웃 (머리글의 로그아웃 버튼이 이곳으로 보냅니다) */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const res = NextResponse.redirect(new URL("/", request.url), { status: 303 });
  res.cookies.delete(RECOVERY_COOKIE); // 비밀번호 찾기로 들어온 표시도 함께 지워요
  return res;
}
