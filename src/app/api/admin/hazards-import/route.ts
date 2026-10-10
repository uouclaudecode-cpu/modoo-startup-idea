import { NextResponse } from "next/server";
import { dataKey, fetchHazardRows, HAZARD_YEARS } from "@/lib/publicData";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

const PER_CALL = 30; // 한 번에 처리할 시·군·구 수

/**
 * 관리자: 도로교통공단 자전거사고 다발지역을 한 해씩, 시·군·구 30곳씩 불러와요.
 * 화면(/admin/spots)이 오래된 해부터 차례로, next가 null이 될 때까지 여러 번 불러요.
 * reset(가장 최근 해의 마지막 묶음)이면 최근 3년보다 오래된 자료를 지워요.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  const { data: me } = await supabase.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
  if (!me?.is_admin) return NextResponse.json({ error: "관리자만 할 수 있어요." }, { status: 403 });

  const key = dataKey();
  if (!key) return NextResponse.json({ error: "공공데이터 인증키(DATA_GO_KR_API_KEY)가 아직 설정되지 않았어요." }, { status: 500 });

  const body = (await req.json().catch(() => ({}))) as { year?: number; from?: number; latest?: boolean };
  const year = Math.floor(Number(body.year));
  if (!(year >= 2010 && year <= new Date().getFullYear())) return NextResponse.json({ error: "연도를 확인해 주세요." }, { status: 400 });
  const from = Math.max(0, Math.floor(Number(body.from) || 0));

  try {
    const { rows, done, total, next } = await fetchHazardRows(key, year, from, PER_CALL);
    const { data, error } = await supabase.rpc("import_bike_hazards", { p_year: year, p_rows: rows, p_reset: Boolean(body.latest) && next === null });
    if (error) {
      console.error(error);
      return NextResponse.json({ error: /[가-힣]/.test(error.message) ? error.message : "데이터베이스에 넣지 못했어요. 035 설정을 실행했는지 확인해 주세요." }, { status: 500 });
    }
    return NextResponse.json({ imported: Number(data ?? 0), done, total, next, years: HAZARD_YEARS });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error && /[가-힣]/.test(e.message) ? e.message : "공공데이터를 불러오지 못했어요. 잠시 후 다시 시도해 주세요." }, { status: 502 });
  }
}
