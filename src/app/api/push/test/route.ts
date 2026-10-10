import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendWebPush } from "@/lib/webPush";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 설정 화면의 '테스트 알림 보내기'.
 * 로그인한 사람의 기기 목록을 RLS로 본인 것만 읽어서, 그 기기들에 시험 알림을 보내요.
 */
export async function POST(request: NextRequest) {
  // 다른 사이트에서 몰래 이 주소를 부르지 못하게 (브라우저가 보내는 Origin 이 있으면 우리 주소인지 확인)
  if (!sameSite(request)) {
    return NextResponse.json({ error: "잘못된 요청이에요." }, { status: 403 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  }

  // 테스트 알림은 1분에 한 번만 (반복 호출로 알림 서버를 괴롭히지 않게)
  const { data: allowed, error: limitErr } = await supabase.rpc("claim_test_push");
  if (limitErr) {
    console.error(limitErr);
    return NextResponse.json({ error: "잠시 후 다시 시도해 주세요." }, { status: 500 });
  }
  if (!allowed) {
    return NextResponse.json({ error: "테스트 알림은 1분에 한 번 보낼 수 있어요." }, { status: 429 });
  }

  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) {
    console.error(error);
    return NextResponse.json({ error: "알림 기기 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요." }, { status: 500 });
  }
  if (!subs || subs.length === 0) {
    return NextResponse.json({ error: "알림을 켠 기기가 없어요. 먼저 알림을 켜 주세요." }, { status: 404 });
  }

  const result = await sendWebPush(
    subs,
    {
      title: "🔔 B-LOCK 알림이 잘 와요!",
      body: "이제 발견 제보·댓글·정비 시기를 휴대폰으로 바로 알려 드릴게요.",
      url: "/dashboard",
      tag: "test",
    },
    { urgency: "high", ttl: 600 },
  );
  if (!result) {
    return NextResponse.json({ error: "알림 기능 준비 중이에요." }, { status: 503 });
  }

  // 끝난 구독(앱 삭제·알림 끔)은 본인 권한(RLS)으로 바로 지워요.
  let removed = 0;
  if (result.gone.length > 0) {
    const { data: deleted, error: delErr } = await supabase.from("push_subscriptions").delete().in("endpoint", result.gone).select("id");
    if (delErr) console.error(delErr);
    else removed = deleted?.length ?? 0;
  }

  return NextResponse.json({ sent: result.sent, failed: result.failed, skipped: result.skipped, removed });
}

/** Origin 이 없으면(같은 사이트 일부 요청) 통과, 있으면 요청받은 주소와 같은 호스트인지 */
function sameSite(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return !host || new URL(origin).host === host;
  } catch {
    return false; // Origin: null 등
  }
}
