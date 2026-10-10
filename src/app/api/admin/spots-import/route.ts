import { NextResponse } from "next/server";
import { dataKey, fetchSpotRows, SPOTS_PER_PAGE } from "@/lib/publicData";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

const PAGES_PER_CALL = 8;

/**
 * 관리자: 공공데이터 자전거 보관소를 page부터 8페이지(800건)씩 데이터베이스에 넣어요.
 * 화면(/admin/spots)이 nextPage가 null이 될 때까지 여러 번 불러요. (한 달마다 자동 갱신은 /api/cron/public-data)
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

  const body = (await req.json().catch(() => ({}))) as { page?: number };
  const start = Math.max(1, Math.floor(Number(body.page) || 1));

  try {
    const { total, rows, skipped } = await fetchSpotRows(key, start, PAGES_PER_CALL);
    let imported = 0;
    for (let i = 0; i < rows.length; i += 400) {
      const { data, error } = await supabase.rpc("import_bike_spots", { p_rows: rows.slice(i, i + 400) });
      if (error) {
        console.error(error);
        return NextResponse.json({ error: /[가-힣]/.test(error.message) ? error.message : "데이터베이스에 넣지 못했어요. 031 설정을 실행했는지 확인해 주세요." }, { status: 500 });
      }
      imported += Number(data ?? 0);
    }
    const lastPage = Math.ceil(total / SPOTS_PER_PAGE);
    const end = start + PAGES_PER_CALL - 1;
    return NextResponse.json({ total, imported, skipped, done: Math.min(end, lastPage), lastPage, nextPage: end < lastPage ? end + 1 : null });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error && /[가-힣]/.test(e.message) ? e.message : "공공데이터를 불러오지 못했어요. 잠시 후 다시 시도해 주세요." }, { status: 502 });
  }
}
