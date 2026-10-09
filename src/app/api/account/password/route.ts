import { NextResponse, type NextRequest } from "next/server";
import type { AuthError } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { RECOVERY_COOKIE } from "@/app/auth/recovery";
import { checkPassword, rejectCrossOrigin } from "../verify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 비밀번호 바꾸기.
 * - 설정 화면: 지금 비밀번호를 서버에서 한 번 더 확인한 뒤 바꿔요.
 *   (로그인된 휴대폰을 잠깐 빌린 사람이 비밀번호를 바꿔 주인을 내쫓거나, 그 비밀번호로 소유권 넘기기를 하지 못하게)
 * - 비밀번호 찾기 메일로 들어온 경우(recovery: true): 메일 링크가 본인 확인이라 지금 비밀번호 없이 바꿔요.
 *   단, 메일 링크로 들어온 표시(httpOnly 쿠키)가 이 사용자 것일 때만이고, 바꾸고 나면 표시를 지워요. (한 번만 쓸 수 있게)
 */
export async function POST(request: NextRequest) {
  const blocked = rejectCrossOrigin(request);
  if (blocked) return blocked;

  const body = (await request.json().catch(() => null)) as { currentPassword?: unknown; password?: unknown; recovery?: unknown } | null;
  const recovery = body?.recovery === true;
  const current = typeof body?.currentPassword === "string" ? body.currentPassword : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!recovery && !current) return fail("지금 쓰는 비밀번호를 입력해 주세요.", "current");
  if (password.length < 8) return fail("비밀번호는 8자 이상으로 정해 주세요.", "password");
  if (password.length > 72) return fail("비밀번호는 72자 이하로 정해 주세요.", "password");
  if (!recovery && password === current) return fail("지금 쓰는 비밀번호와 다른 비밀번호로 정해 주세요.", "password");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return fail("로그인이 만료됐어요. 다시 로그인한 뒤 바꿔 주세요.", undefined, 401);

  if (recovery) {
    if (request.cookies.get(RECOVERY_COOKIE)?.value !== user.id) {
      return fail("메일 링크로 들어온 지 1시간이 지났거나 이미 비밀번호를 바꿨어요. 비밀번호 찾기로 메일을 다시 받아 주세요.", undefined, 403);
    }
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return updateFailed(error);
    return done(request);
  }

  const checked = await checkPassword(user.email, user.id, current);
  if (!checked.ok) {
    return checked.limited
      ? fail("시도가 너무 많아요. 잠시 후 다시 해 주세요.", undefined, 429)
      : fail("지금 쓰는 비밀번호가 맞지 않아요.", "current");
  }

  // 내 로그인(쿠키 세션)으로 바꿔요. 바꾸면 다른 기기의 로그인은 끝나요.
  let { error } = await supabase.auth.updateUser({ password });
  let swapped = false;
  if (error && checked.session && (error.code === "reauthentication_needed" || /reauthenticat/i.test(error.message))) {
    // Supabase '안전한 비밀번호 변경'이 켜져 있으면 최근에 로그인한 세션만 바꿀 수 있어요.
    // 방금 비밀번호로 확인한 세션을 이 기기의 로그인으로 삼아 다시 시도해요. (같은 사람, 새로 로그인한 것과 같아요)
    const { error: setErr } = await supabase.auth.setSession({
      access_token: checked.session.access_token,
      refresh_token: checked.session.refresh_token,
    });
    if (!setErr) {
      swapped = true;
      ({ error } = await supabase.auth.updateUser({ password }));
    }
  }
  // 확인용 세션은 끝내요 (이 기기의 로그인으로 넘겨받은 경우는 제외)
  if (!swapped) await checked.checker.auth.signOut({ scope: "local" }).catch(() => {});

  if (error) return updateFailed(error);
  return done(request);
}

/** 바꾸기 성공. 비밀번호 찾기로 들어온 표시가 남아 있으면 함께 지워요 (같은 표시로 또 바꾸지 못하게) */
function done(request: NextRequest) {
  const res = NextResponse.json({ ok: true });
  if (request.cookies.has(RECOVERY_COOKIE)) res.cookies.delete(RECOVERY_COOKIE);
  return res;
}

/** Supabase가 거절한 이유를 쉬운 말로 */
function updateFailed(error: AuthError) {
  console.error("비밀번호 변경 실패", error.message);
  if (error.code === "same_password" || /different from the old|same password/i.test(error.message)) {
    return fail("지금 쓰는 비밀번호와 다른 비밀번호로 정해 주세요.", "password");
  }
  if (error.code === "weak_password" || /weak|should contain|at least/i.test(error.message)) {
    return fail("비밀번호가 너무 쉬워요. 더 길게 하거나 영문·숫자·기호를 섞어 주세요.", "password");
  }
  if (error.code === "reauthentication_needed" || /reauthenticat/i.test(error.message)) {
    return fail("보안을 위해 로그아웃한 뒤 다시 로그인해서 바꿔 주세요.", undefined, 401);
  }
  if (/session|expired|not authenticated|jwt/i.test(error.message)) {
    return fail("로그인이 만료됐어요. 다시 로그인한 뒤 바꿔 주세요.", undefined, 401);
  }
  return fail(/[가-힣]/.test(error.message) ? error.message : "바꾸지 못했어요. 잠시 후 다시 시도해 주세요.");
}

function fail(error: string, field?: "current" | "password", status = 400) {
  return NextResponse.json({ error, field }, { status });
}
