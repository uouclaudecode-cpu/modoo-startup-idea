/**
 * 바깥 서비스 호출 수 세기 (036_usage.sql 의 bump_api_usage) → 관리자 '사용량' 화면에서 무료 한도와 비교해요.
 * 실패해도 아무 영향이 없어요. 서버(검색·길찾기·공공데이터)와 화면(네이버 지도) 모두에서 써요.
 */
import { supabaseEnv } from "./supabase/env";

export type UsageService = "naver_map" | "kakao_search" | "osm_search" | "routing" | "data_go_kr";

export async function bumpUsage(service: UsageService, n = 1) {
  if (n < 1) return;
  try {
    const { url, key } = supabaseEnv();
    await fetch(`${url}/rest/v1/rpc/bump_api_usage`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_service: service, p_n: Math.min(1000, Math.round(n)) }),
      cache: "no-store",
      keepalive: true,
    });
  } catch {
    /* 세지 못해도 괜찮아요 */
  }
}
