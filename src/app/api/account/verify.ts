import { NextResponse, type NextRequest } from "next/server";
import { createClient as createPlainClient, type Session } from "@supabase/supabase-js";
import { supabaseEnv } from "@/lib/supabase/env";

/** 다른 사이트에서 몰래 보낸 요청이면 막아요 (/api/transfers 와 같은 방식) */
export function rejectCrossOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) return null;
  try {
    if (new URL(origin).host === host) return null;
  } catch {
    // 주소 모양이 이상하면 아래에서 막아요
  }
  return NextResponse.json({ error: "잘못된 요청이에요." }, { status: 403 });
}

/** 세션을 저장하지 않는 별도 연결 (확인만 하고 버려요) */
function createChecker() {
  const { url, key } = supabaseEnv();
  return createPlainClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

type Checked =
  | { ok: true; checker: ReturnType<typeof createChecker>; session: Session | null }
  | { ok: false; limited: boolean };

/**
 * 비밀번호 재확인: 세션을 저장하지 않는 별도 연결로 로그인해 보기만 해요. (내 로그인은 그대로)
 * 확인이 끝나면 부른 쪽에서 checker.auth.signOut({ scope: "local" }) 로 확인용 세션을 끝내 주세요.
 */
export async function checkPassword(email: string, userId: string, password: string): Promise<Checked> {
  const checker = createChecker();
  const { data, error } = await checker.auth.signInWithPassword({ email, password });
  if (error || data.user?.id !== userId) {
    if (!error) await checker.auth.signOut({ scope: "local" }).catch(() => {});
    return { ok: false, limited: !!error && (error.status === 429 || /rate|too many/i.test(error.message)) };
  }
  return { ok: true, checker, session: data.session };
}
