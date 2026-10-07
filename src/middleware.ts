import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * 모든 요청마다 로그인 상태(쿠키)를 새로 고칩니다.
 * 로그인이 필요한 화면(/dashboard, /vehicles)에 로그인하지 않고 들어오면 로그인 화면으로 보냅니다.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const needsLogin = path.startsWith("/dashboard") || path.startsWith("/vehicles") || path === "/community/new" || path.startsWith("/stickers") || path.startsWith("/admin") || path === "/ride" || path.startsWith("/rides");
  if (needsLogin && !user) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = `?next=${encodeURIComponent(path + request.nextUrl.search)}`;
    return NextResponse.redirect(login);
  }
  // 이미 로그인했는데 로그인·회원가입 화면에 오면 가려던 곳(없으면 내 이동수단)으로
  if (user && (path === "/login" || path === "/signup")) {
    const next = request.nextUrl.searchParams.get("next");
    const dest = request.nextUrl.clone();
    dest.pathname = next && next.startsWith("/") && !next.startsWith("//") ? next.split("?")[0] : "/dashboard";
    dest.search = next && next.includes("?") ? next.slice(next.indexOf("?")) : "";
    return NextResponse.redirect(dest);
  }
  // 개발용 디자인 확인 화면은 실제 사이트에서 숨김
  if (path.startsWith("/styleguide") && process.env.NODE_ENV === "production") {
    const home = request.nextUrl.clone();
    home.pathname = "/";
    home.search = "";
    return NextResponse.redirect(home);
  }
  return response;
}

export const config = {
  // 이미지·정적 파일은 건너뜁니다.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|icons/|icon|apple-icon|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
