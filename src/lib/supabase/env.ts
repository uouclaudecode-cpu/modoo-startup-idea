/** Supabase 연결 정보 (공개 키라서 브라우저에 보여도 됩니다. 권한은 데이터베이스의 RLS가 정해요) */
export function supabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase 설정이 없어요. .env.local 에 NEXT_PUBLIC_SUPABASE_URL 과 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY 를 넣어 주세요.",
    );
  }
  return { url, key };
}
