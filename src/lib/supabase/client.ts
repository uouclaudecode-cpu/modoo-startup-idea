"use client";

import { createBrowserClient } from "@supabase/ssr";
import { supabaseEnv } from "./env";

/** 브라우저(화면)에서 쓰는 Supabase 연결: 사진 올리기, 로그인 폼 등 */
export function createClient() {
  const { url, key } = supabaseEnv();
  return createBrowserClient(url, key);
}
