import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { supabaseEnv } from "./env";

/** 서버에서 쓰는 Supabase 연결: 로그인한 사용자의 쿠키로 데이터를 읽고 씁니다. */
export async function createClient() {
  // 쿠키를 먼저 읽어야 Next.js가 이 화면을 '요청마다 새로 그리는 화면'으로 알고 빌드 때 미리 만들지 않아요.
  const cookieStore = await cookies();
  const { url, key } = supabaseEnv();
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // 서버 컴포넌트에서는 쿠키를 쓸 수 없어요. 로그인 유지는 middleware.ts 가 맡습니다.
        }
      },
    },
  });
}

/** 지금 로그인한 사용자 (없으면 null) */
export async function getUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user;
}
