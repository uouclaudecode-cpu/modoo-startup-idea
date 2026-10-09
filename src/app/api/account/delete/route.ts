import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { RECOVERY_COOKIE } from "@/app/auth/recovery";
import { checkPassword, rejectCrossOrigin } from "../verify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 회원 탈퇴: 비밀번호를 한 번 더 확인한 뒤 계정을 지워요. (휴대폰을 잠깐 빌린 사람이 몰래 지우지 못하게)
 * 사진 파일은 미리 지우지 않아요. 탈퇴가 실패하면 모든 것이 그대로 남고,
 * 성공하면 데이터베이스(delete_my_account)가 남은 사진을 정리 대기열에 넣어 관리자 정리로 지워져요.
 */
export async function POST(request: NextRequest) {
  const blocked = rejectCrossOrigin(request);
  if (blocked) return blocked;

  const body = (await request.json().catch(() => null)) as { password?: unknown } | null;
  const password = typeof body?.password === "string" ? body.password : "";
  if (!password) return NextResponse.json({ error: "비밀번호를 입력해 주세요." }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "로그인이 만료됐어요. 다시 로그인해 주세요." }, { status: 401 });

  const checked = await checkPassword(user.email, user.id, password);
  if (!checked.ok) {
    return NextResponse.json(
      { error: checked.limited ? "시도가 너무 많아요. 잠시 후 다시 해 주세요." : "비밀번호가 맞지 않아요." },
      { status: checked.limited ? 429 : 400 },
    );
  }
  // 확인용으로 만든 세션은 바로 끝내요 (이 연결에만 해당, 내 로그인은 그대로)
  await checked.checker.auth.signOut({ scope: "local" }).catch(() => {});

  // 계정 지우기 (연결된 데이터는 데이터베이스가 함께 지움, 남은 사진은 정리 대기열로). 한 번에 처리돼서 실패하면 아무것도 지워지지 않아요.
  const { error } = await supabase.rpc("delete_my_account");
  if (error) {
    console.error("탈퇴 실패", error.message);
    const msg = /[가-힣]/.test(error.message) ? error.message : "탈퇴하지 못했어요. 잠시 후 다시 시도해 주세요.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  // 이 브라우저의 로그인 쿠키도 정리 (계정이 이미 없어져 서버 쪽 로그아웃은 실패해도 괜찮아요)
  await supabase.auth.signOut({ scope: "local" }).catch(() => {});
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(RECOVERY_COOKIE);
  return res;
}
