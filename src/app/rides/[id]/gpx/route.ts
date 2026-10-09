import { NextResponse } from "next/server";
import { UUID_RE } from "@/lib/community";
import { buildGpx, trimEnds } from "@/lib/ride/export";
import { fromPathJson } from "@/lib/ride/geo";
import { createClient } from "@/lib/supabase/server";

/** 내 라이딩을 GPX 파일로 내려받기 (?trim=1 이면 앞뒤 300m를 가려요) */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return new NextResponse("없는 기록이에요.", { status: 404 });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("로그인이 필요해요.", { status: 401 });

  // 본인 기록만 읽혀요 (rides 읽기 정책)
  const { data: ride, error } = await supabase.from("rides").select("id, started_at, ended_at, path").eq("id", id).maybeSingle();
  if (error) {
    console.error(error);
    return new NextResponse("기록을 불러오지 못했어요.", { status: 500 });
  }
  if (!ride) return new NextResponse("없는 기록이에요.", { status: 404 });

  let path = fromPathJson(ride.path);
  if (new URL(req.url).searchParams.get("trim") === "1") path = trimEnds(path, 300);
  const day = new Date(new Date(ride.started_at).getTime() + 9 * 3600e3).toISOString().slice(0, 10);
  const gpx = buildGpx({ name: `B-LOCK 라이딩 ${day}`, path, startedAt: ride.started_at, endedAt: ride.ended_at });
  return new NextResponse(gpx, {
    headers: {
      "content-type": "application/gpx+xml; charset=utf-8",
      "content-disposition": `attachment; filename="b-lock-ride-${day}.gpx"`,
      "cache-control": "private, no-store",
    },
  });
}
