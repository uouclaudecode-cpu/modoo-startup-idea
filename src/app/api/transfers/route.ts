import { NextResponse, type NextRequest } from "next/server";
import { createClient as createPlainClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { supabaseEnv } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 소유권 넘기기 시작: 비밀번호를 한 번 더 확인한 뒤 10분짜리 양도 QR을 만들어요.
 * (휴대폰을 잠깐 빌려 간 사람이 몰래 넘기지 못하게)
 */
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (origin && host) {
    try {
      if (new URL(origin).host !== host) return NextResponse.json({ error: "잘못된 요청이에요." }, { status: 403 });
    } catch {
      return NextResponse.json({ error: "잘못된 요청이에요." }, { status: 403 });
    }
  }

  const body = (await request.json().catch(() => null)) as { vehicleId?: unknown; password?: unknown; mode?: unknown } | null;
  const vehicleId = typeof body?.vehicleId === "string" ? body.vehicleId : "";
  const password = typeof body?.password === "string" ? body.password : "";
  // qr: 직접 만나서 10분 / link: 택배·원격 거래 3일
  const mode = body?.mode === "link" ? "link" : "qr";
  if (!UUID.test(vehicleId) || !password) {
    return NextResponse.json({ error: "비밀번호를 입력해 주세요." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  }

  // 비밀번호 재확인 (세션을 저장하지 않는 별도 연결로 확인만)
  const { url, key } = supabaseEnv();
  const checker = createPlainClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { data: signed, error: authErr } = await checker.auth.signInWithPassword({ email: user.email, password });
  if (authErr || signed.user?.id !== user.id) {
    const limited = authErr && /rate|too many/i.test(authErr.message);
    return NextResponse.json(
      { error: limited ? "시도가 너무 많아요. 잠시 후 다시 해 주세요." : "비밀번호가 맞지 않아요." },
      { status: limited ? 429 : 400 },
    );
  }

  // 확인용으로 만든 세션은 바로 끝내요 (이 연결에만 해당, 내 로그인은 그대로)
  await checker.auth.signOut({ scope: "local" }).catch(() => {});

  const { data, error } = await supabase.rpc("start_transfer", { p_vehicle: vehicleId, p_mode: mode });
  if (error) {
    console.error(error);
    const msg = /[가-힣]/.test(error.message) ? error.message : "소유권 넘기기를 시작하지 못했어요. 잠시 후 다시 시도해 주세요.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  const d = data as { transfer_id: string; token: string; expires_at: string };
  return NextResponse.json({ transferId: d.transfer_id, token: d.token, expiresAt: d.expires_at });
}
