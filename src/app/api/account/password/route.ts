import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkPassword, rejectCrossOrigin } from "../verify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 설정에서 비밀번호 바꾸기: 지금 비밀번호를 서버에서 한 번 더 확인한 뒤 바꿔요.
 * (로그인된 휴대폰을 잠깐 빌린 사람이 비밀번호를 바꿔 주인을 내쫓거나, 그 비밀번호로 소유권 넘기기를 하지 못하게)
 * 비밀번호 찾기 메일로 들어온 경우는 메일 링크가 본인 확인이라 이 경로를 쓰지 않아요.
 */
export async function POST(request: NextRequest) {
  const blocked = rejectCrossOrigin(request);
  if (blocked) return blocked;

  const body = (await request.json().catch(() => null)) as { currentPassword?: unknown; password?: unknown } | null;
  const current = typeof body?.currentPassword === "string" ? body.currentPassword : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!current) return fail("지금 쓰는 비밀번호를 입력해 주세요.", "current");
  if (password.length < 8) return fail("비밀번호는 8자 이상으로 정해 주세요.", "password");
  if (password.length > 72) return fail("비밀번호는 72자 이하로 정해 주세요.", "password");
  if (password === current) return fail("지금 쓰는 비밀번호와 다른 비밀번호로 정해 주세요.", "password");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return fail("로그인이 만료됐어요. 다시 로그인한 뒤 바꿔 주세요.", undefined, 401);

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

  if (error) {
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
  return NextResponse.json({ ok: true });
}

function fail(error: string, field?: "current" | "password", status = 400) {
  return NextResponse.json({ error, field }, { status });
}
