import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { toSpotRow, type PublicParkingItem } from "@/lib/spots";

export const maxDuration = 60;

const ENDPOINT = "https://apis.data.go.kr/1741000/bicycle_parking_info/info";
const PER_PAGE = 100; // 이 서비스의 한 번 최대
const PAGES_PER_CALL = 8;

type ApiBody = { totalCount?: number; items?: { item?: PublicParkingItem[] | PublicParkingItem } | "" };

/** 공공데이터 한 페이지 (100건) */
async function fetchPage(key: string, page: number) {
  const u = new URL(ENDPOINT);
  // Encoding 키(%가 들어간 키)를 넣었어도 두 번 바뀌지 않게 풀어서 넣어요
  u.searchParams.set("serviceKey", key.includes("%") ? decodeURIComponent(key) : key);
  u.searchParams.set("pageNo", String(page));
  u.searchParams.set("numOfRows", String(PER_PAGE));
  u.searchParams.set("returnType", "json");
  const r = await fetch(u, { cache: "no-store", signal: AbortSignal.timeout(20000) });
  const text = await r.text();
  let json: { response?: { header?: { resultCode?: string; resultMsg?: string }; body?: ApiBody } };
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(text.includes("SERVICE_KEY") ? "인증키가 아직 등록되지 않았거나 틀렸어요." : "공공데이터 서버가 응답하지 않아요. 잠시 후 다시 시도해 주세요.");
  }
  const code = json.response?.header?.resultCode;
  if (code && code !== "0" && code !== "00") throw new Error(`공공데이터 오류: ${json.response?.header?.resultMsg ?? code}`);
  const body = json.response?.body ?? {};
  const raw = body.items && typeof body.items === "object" ? body.items.item : [];
  const items = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return { total: Number(body.totalCount ?? 0), items };
}

/**
 * 관리자: 공공데이터 자전거 보관소를 page부터 8페이지(800건)씩 데이터베이스에 넣어요.
 * 화면(/admin/spots)이 nextPage가 null이 될 때까지 여러 번 불러요.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  const { data: me } = await supabase.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
  if (!me?.is_admin) return NextResponse.json({ error: "관리자만 할 수 있어요." }, { status: 403 });

  const key = process.env.DATA_GO_KR_API_KEY?.trim();
  if (!key) return NextResponse.json({ error: "공공데이터 인증키(DATA_GO_KR_API_KEY)가 아직 설정되지 않았어요." }, { status: 500 });

  const body = (await req.json().catch(() => ({}))) as { page?: number };
  const start = Math.max(1, Math.floor(Number(body.page) || 1));

  try {
    const pages = await Promise.all(Array.from({ length: PAGES_PER_CALL }, (_, i) => fetchPage(key, start + i)));
    const total = pages[0].total;
    const rows = pages.flatMap((p) => p.items).map(toSpotRow).filter((r): r is NonNullable<typeof r> => r !== null);
    let imported = 0;
    for (let i = 0; i < rows.length; i += 400) {
      const { data, error } = await supabase.rpc("import_bike_spots", { p_rows: rows.slice(i, i + 400) });
      if (error) {
        console.error(error);
        return NextResponse.json({ error: /[가-힣]/.test(error.message) ? error.message : "데이터베이스에 넣지 못했어요. 031 설정을 실행했는지 확인해 주세요." }, { status: 500 });
      }
      imported += Number(data ?? 0);
    }
    const lastPage = Math.ceil(total / PER_PAGE);
    const end = start + PAGES_PER_CALL - 1;
    return NextResponse.json({ total, imported, skipped: pages.reduce((n, p) => n + p.items.length, 0) - rows.length, done: Math.min(end, lastPage), lastPage, nextPage: end < lastPage ? end + 1 : null });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error && /[가-힣]/.test(e.message) ? e.message : "공공데이터를 불러오지 못했어요. 잠시 후 다시 시도해 주세요." }, { status: 502 });
  }
}
