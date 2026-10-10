import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { SpotsExplorer } from "./SpotsExplorer";

export const metadata: Metadata = {
  title: "공기주입기·자전거 보관소",
  description: "내 주변 자전거 공기주입기, 보관소, 수리대, 자전거 사고가 잦은 곳을 지도에서 찾고 바로 길 안내를 받아요.",
};

/** 로그인 없이도 볼 수 있어요. 고장 표시·장소 알려 주기는 로그인한 회원만. */
export default async function SpotsPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const { kind } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return <SpotsExplorer loggedIn={Boolean(user)} initialKind={kind === "parking" || kind === "repair" ? kind : "pump"} />;
}
