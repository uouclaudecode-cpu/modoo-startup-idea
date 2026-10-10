-- 032: 커뮤니티 글·댓글에 프로필 사진 보여 주기
-- 회원 ID는 드러내지 않고, 글 ID → 사진 경로 / 댓글 ID → 사진 경로만 돌려줘요.
-- 지운 글·숨긴 글, 지운 댓글·숨긴 댓글은 빼요. 여러 번 실행해도 안전해요.

-- 글쓴이 사진 (글 목록·글 화면). 한 번에 100개까지
create or replace function public.post_author_avatars(p_post_ids uuid[])
returns json
language sql stable security definer set search_path = public as $body$
  select coalesce(json_object_agg(l.id, p.avatar_path), '{}'::json)
    from public.lost_posts l
    join public.profiles p on p.id = l.author_id
   where l.id = any (p_post_ids[1:100])
     and l.deleted_at is null and l.hidden_at is null
     and p.avatar_path is not null;
$body$;
revoke execute on function public.post_author_avatars(uuid[]) from public, anon, authenticated;
grant execute on function public.post_author_avatars(uuid[]) to anon, authenticated;

-- 댓글 쓴 사람 사진 (글 화면)
create or replace function public.post_comment_avatars(p_post uuid)
returns json
language sql stable security definer set search_path = public as $body$
  select coalesce(json_object_agg(c.id, p.avatar_path), '{}'::json)
    from public.post_comments c
    join public.lost_posts l on l.id = c.post_id
    join public.profiles p on p.id = c.author_id
   where c.post_id = p_post
     and l.deleted_at is null and l.hidden_at is null
     and c.deleted_at is null and c.hidden_at is null
     and p.avatar_path is not null;
$body$;
revoke execute on function public.post_comment_avatars(uuid) from public, anon, authenticated;
grant execute on function public.post_comment_avatars(uuid) to anon, authenticated;
