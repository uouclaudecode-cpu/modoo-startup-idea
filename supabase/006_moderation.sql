-- =====================================================================
-- B-LOCK 6차: 커뮤니티 신고 · 차단 · 관리자 신고 처리
-- schema.sql → 002 → 003 → 004 → 005 다음에 실행하세요. (여러 번 실행해도 안전)
--   - 글·댓글 신고: 이유(스팸·욕설·개인정보·허위·기타) + 자세한 내용(선택), 한 사람이 같은 대상은 한 번만
--   - 서로 다른 3명이 신고하면 자동으로 숨김 (글쓴이·관리자에게만 보임)
--   - 사용자 차단: 차단한 사람의 글·댓글이 나에게 보이지 않음 (댓글 작성자 ID는 화면에 주지 않고 서버에서 찾음)
--   - 관리자: 신고 모아 보기 · 숨기기 · 다시 보이기 · 삭제
-- =====================================================================

-- 1) 숨김 표시 --------------------------------------------------------------
alter table public.lost_posts add column if not exists hidden_at timestamptz;
alter table public.post_comments add column if not exists hidden_at timestamptz;

-- 2) 신고 · 차단 테이블 ---------------------------------------------------------
create table if not exists public.content_reports (
  id           uuid primary key default gen_random_uuid(),
  reporter_id  uuid not null references auth.users (id) on delete cascade default auth.uid(),
  target_type  text not null check (target_type in ('post', 'comment')),
  target_id    uuid not null,                 -- 글 또는 댓글 ID (종류가 둘이라 FK 없이)
  reason       text not null check (reason in ('spam', 'abuse', 'privacy', 'false', 'other')),
  detail       text check (char_length(detail) <= 300),
  created_at   timestamptz not null default now(),
  unique (reporter_id, target_type, target_id)
);
create index if not exists content_reports_target_idx on public.content_reports (target_type, target_id);
create index if not exists content_reports_reporter_idx on public.content_reports (reporter_id, created_at desc);

create table if not exists public.user_blocks (
  blocker_id  uuid not null references auth.users (id) on delete cascade,
  blocked_id  uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

alter table public.content_reports enable row level security;
alter table public.user_blocks enable row level security;

-- 신고는 아래 함수로만 쓰고, 목록은 관리자 함수로만 봐요 (누가 신고했는지 새지 않게 직접 읽기 막음)
revoke all on public.content_reports from public, anon, authenticated;
-- 차단 목록: 내 것만 읽기 (쓰기는 함수로만)
revoke all on public.user_blocks from public, anon, authenticated;
grant select on public.user_blocks to authenticated;
drop policy if exists "own blocks read" on public.user_blocks;
create policy "own blocks read" on public.user_blocks for select to authenticated using (blocker_id = auth.uid());

-- 3) 정책에서 쓰는 도우미 ----------------------------------------------------------
-- 정책 안에서 profiles·user_blocks 를 직접 읽으면 anon 은 권한이 없어 오류가 나요.
-- 그래서 definer 함수로 '지금 보는 사람' 것만 돌려주고, 정책에서는 (select ...)로 한 번만 계산해요.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false);
$$;

create or replace function public.my_blocked_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(b.blocked_id), '{}'::uuid[]) from public.user_blocks b where b.blocker_id = auth.uid();
$$;

-- 4) 사용자가 숨김을 스스로 풀거나, 관리자가 지운 글을 되살리지 못하게 ------------------
-- 신고·관리자 함수(definer)는 함수 주인 권한으로 돌아서 current_user 가 authenticated 가 아니에요.
-- (profiles_guard 와 같은 방식)
create or replace function public.moderation_guard()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.hidden_at := null;
    else
      new.hidden_at := old.hidden_at;
      -- 한 번 지운 글은 지운 상태 그대로 (지우는 것만 가능)
      new.deleted_at := coalesce(old.deleted_at, new.deleted_at);
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists lost_posts_moderation_guard on public.lost_posts;
create trigger lost_posts_moderation_guard before insert or update on public.lost_posts
  for each row execute function public.moderation_guard();
drop trigger if exists post_comments_moderation_guard on public.post_comments;
create trigger post_comments_moderation_guard before insert or update on public.post_comments
  for each row execute function public.moderation_guard();

-- 5) 글 쓰기 트리거 다시 만들기 (002와 같고, 이동수단·사진 검사는 새로 쓰거나 바꿀 때만) ----------
-- 숨기기·삭제·댓글 수 고치기처럼 다른 열만 바꿀 때도 사진 검사를 하면, 주인이 이동수단 사진을 바꾼 뒤엔
-- 예전 사진 경로가 맞지 않아 숨기기(와 댓글 달기)가 실패했어요.
create or replace function public.lost_posts_before_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_check boolean;
begin
  if tg_op = 'INSERT' then
    new.author_id := auth.uid();
    new.author_name := coalesce((select nullif(nickname, '') from public.profiles where id = auth.uid()), '회원');
    new.comment_count := 0;
    new.status := 'open';
    if (select count(*) from public.lost_posts where author_id = auth.uid() and created_at > now() - interval '1 hour') >= 5 then
      raise exception '글은 1시간에 5개까지 올릴 수 있어요. 잠시 후 다시 시도해 주세요.';
    end if;
    v_check := true;
  else
    -- 바꿀 수 없는 값 (댓글 수는 아래 트리거가 고칠 때만 바뀜)
    new.author_id := old.author_id;
    new.author_name := old.author_name;
    if current_setting('blocklock.counting', true) is distinct from 'on' then
      new.comment_count := old.comment_count;
    end if;
    new.created_at := old.created_at;
    new.updated_at := now();
    v_check := new.vehicle_id is distinct from old.vehicle_id
            or new.image_path is distinct from old.image_path
            or new.image_bucket is distinct from old.image_bucket;
  end if;

  if new.image_path is null then
    new.image_bucket := null;
  end if;

  if v_check then
    if new.vehicle_id is not null and not exists (
      select 1 from public.vehicles v where v.id = new.vehicle_id and v.owner_id = new.author_id
    ) then
      raise exception '내 이동수단만 연결할 수 있어요.';
    end if;

    if new.image_path is not null then
      if new.image_bucket = 'vehicle-images' then
        if not exists (select 1 from public.vehicles v where v.id = new.vehicle_id and v.image_path = new.image_path) then
          raise exception '사진 경로가 올바르지 않습니다.';
        end if;
      elsif new.image_bucket = 'community-images' then
        if new.image_path !~ ('^' || new.author_id::text || '/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$') then
          raise exception '사진 경로가 올바르지 않습니다.';
        end if;
      else
        raise exception '사진 경로가 올바르지 않습니다.';
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- 6) 댓글 수: 숨긴 댓글은 빼고 세기 (숨기거나 다시 보일 때도 다시 셈) -----------------------
create or replace function public.post_comments_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post uuid := coalesce(new.post_id, old.post_id);
begin
  perform set_config('blocklock.counting', 'on', true);
  update public.lost_posts
     set comment_count = (
       select count(*) from public.post_comments c
       where c.post_id = v_post and c.deleted_at is null and c.hidden_at is null
     )
   where id = v_post;
  perform set_config('blocklock.counting', 'off', true);
  return null;
end;
$$;
drop trigger if exists post_comments_count on public.post_comments;
create trigger post_comments_count after insert or update of deleted_at, hidden_at on public.post_comments
  for each row execute function public.post_comments_count();

-- 7) 보이는 범위 ---------------------------------------------------------------
-- 글: 글쓴이는 지운 글·숨긴 글도 그대로 봐요 (지우기 UPDATE 가 통과하려면 필요).
--     다른 사람은 지우지 않았고, 숨기지 않았고(관리자는 숨긴 글도 봄), 내가 차단하지 않은 사람의 글만.
drop policy if exists "anyone reads posts" on public.lost_posts;
create policy "anyone reads posts" on public.lost_posts for select to anon, authenticated
  using (
    author_id = auth.uid()
    or (
      deleted_at is null
      and (hidden_at is null or (select public.is_admin()))
      and author_id <> all ((select public.my_blocked_ids()))
    )
  );

-- 댓글: 비밀 댓글 규칙(can_view_comment)은 그대로 + 숨김·차단
drop policy if exists "read visible comments" on public.post_comments;
create policy "read visible comments" on public.post_comments for select to anon, authenticated
  using (
    deleted_at is null
    and public.can_view_comment(post_comments)
    and (hidden_at is null or author_id = auth.uid() or (select public.is_admin()))
    and author_id <> all ((select public.my_blocked_ids()))
  );

-- 댓글 목록: 003과 같은 열·순서 + 맨 끝에 hidden_at (내 댓글이 숨겨졌는지 알려주기용)
--   - 내가 차단한 사람의 댓글, 숨긴 댓글(내 것·관리자 제외)은 빼요
--   - 그런 댓글에 달린 답글, 지운 댓글에 달린 답글도 함께 빼요 (화면에 붙을 곳이 없어서)
--   - 글이 숨겨졌거나 글쓴이를 차단했으면 댓글도 돌려주지 않아요
drop function if exists public.get_post_comments(uuid);
create function public.get_post_comments(p_post uuid)
returns table (
  id uuid, parent_id uuid, author_name text, is_secret boolean, can_view boolean, is_mine boolean,
  is_post_author boolean, body text, latitude double precision, longitude double precision,
  location_text text, image_path text, created_at timestamptz, hidden_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with viewer as (
    select auth.uid() as uid, public.is_admin() as admin, public.my_blocked_ids() as blocked
  )
  select c.id, c.parent_id, c.author_name, c.is_secret, v.ok, coalesce(c.author_id = w.uid, false),
         c.author_id = p.author_id,
         case when v.ok then c.body end,
         case when v.ok then c.latitude end,
         case when v.ok then c.longitude end,
         case when v.ok then c.location_text end,
         case when v.ok then c.image_path end,
         c.created_at,
         c.hidden_at
  from public.post_comments c
  cross join viewer w
  join public.lost_posts p on p.id = c.post_id and p.deleted_at is null
  left join public.post_comments pc on pc.id = c.parent_id
  cross join lateral (select coalesce(public.can_view_comment(c), false) as ok) v
  where c.post_id = p_post
    and c.deleted_at is null
    and (p.hidden_at is null or p.author_id = w.uid or w.admin)
    and p.author_id <> all (w.blocked)
    and (c.hidden_at is null or c.author_id = w.uid or w.admin)
    and c.author_id <> all (w.blocked)
    and (
      c.parent_id is null
      or (
        pc.deleted_at is null
        and (pc.hidden_at is null or pc.author_id = w.uid or w.admin)
        and pc.author_id <> all (w.blocked)
      )
    )
  order by c.created_at;
$$;

-- QR 화면의 '커뮤니티 분실 글 보기'가 숨긴 글로 이어지지 않게 (003과 같고 hidden_at 조건만 추가)
create or replace function public.get_vehicle_post(p_token text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id
  from public.lost_posts p join public.vehicles v on v.id = p.vehicle_id
  where v.id = public.resolve_vehicle(p_token) and v.deleted_at is null
    and p.deleted_at is null and p.hidden_at is null and p.status = 'open'
  order by p.created_at desc
  limit 1;
$$;

-- 8) 신고하기 -----------------------------------------------------------------
-- 돌려주는 값: 이번 신고로 숨겨졌으면 true (화면에서 바로 목록으로 보내기용)
create or replace function public.report_content(p_type text, p_id uuid, p_reason text, p_detail text default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_author uuid;
  v_can_view boolean := true;
  v_inserted integer;
  v_reporters integer;
  v_detail text := nullif(left(btrim(coalesce(p_detail, '')), 300), '');
begin
  if v_uid is null then
    raise exception '로그인이 필요해요.';
  end if;
  if p_type is null or p_type not in ('post', 'comment') then
    raise exception '신고할 수 없는 대상이에요.';
  end if;
  if p_reason is null or p_reason not in ('spam', 'abuse', 'privacy', 'false', 'other') then
    raise exception '신고 이유를 골라 주세요.';
  end if;

  if p_type = 'post' then
    select p.author_id into v_author from public.lost_posts p where p.id = p_id and p.deleted_at is null;
  else
    -- 볼 수 없는 비밀 댓글은 신고할 수 없어요 (내용을 모르는 채로 숨기기 방지)
    select c.author_id, coalesce(public.can_view_comment(c), false) into v_author, v_can_view
    from public.post_comments c
    join public.lost_posts p on p.id = c.post_id and p.deleted_at is null
    where c.id = p_id and c.deleted_at is null;
  end if;
  if v_author is null then
    raise exception '삭제되었거나 없는 글·댓글이에요.';
  end if;
  if not v_can_view then
    raise exception '신고할 수 없는 댓글이에요.';
  end if;
  if v_author = v_uid then
    raise exception '내가 쓴 글·댓글은 신고할 수 없어요.';
  end if;
  -- 신고 남용 방지: 1시간에 20번까지
  if (select count(*) from public.content_reports where reporter_id = v_uid and created_at > now() - interval '1 hour') >= 20 then
    raise exception '신고는 1시간에 20번까지 할 수 있어요. 잠시 후 다시 시도해 주세요.';
  end if;

  -- 같은 대상에 동시에 신고가 들어와도 '3명째'를 놓치지 않게 대상별로 차례대로 처리
  perform pg_advisory_xact_lock(hashtextextended(p_type || ':' || p_id::text, 0));

  insert into public.content_reports (reporter_id, target_type, target_id, reason, detail)
  values (v_uid, p_type, p_id, p_reason, v_detail)
  on conflict (reporter_id, target_type, target_id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    raise exception '이미 신고했어요.';
  end if;

  -- 서로 다른 3명째 신고에서 한 번만 자동으로 숨겨요.
  -- 관리자가 확인하고 다시 보이게 한 뒤에는 신고가 더 와도 자동으로 다시 숨기지 않아요 (관리자 판단 우선).
  select count(distinct r.reporter_id) into v_reporters
  from public.content_reports r where r.target_type = p_type and r.target_id = p_id;
  if v_reporters = 3 then
    if p_type = 'post' then
      update public.lost_posts set hidden_at = now() where id = p_id and hidden_at is null;
    else
      update public.post_comments set hidden_at = now() where id = p_id and hidden_at is null;
    end if;
    return found;
  end if;
  return false;
end;
$$;

-- 9) 차단 ----------------------------------------------------------------------
create or replace function public.block_user_internal(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception '로그인이 필요해요.';
  end if;
  if p_user is null then
    raise exception '삭제되었거나 없는 글·댓글이에요.';
  end if;
  if p_user = auth.uid() then
    raise exception '나 자신은 차단할 수 없어요.';
  end if;
  insert into public.user_blocks (blocker_id, blocked_id) values (auth.uid(), p_user)
  on conflict (blocker_id, blocked_id) do nothing;
end;
$$;

-- 글쓴이를 차단 (글 ID로 서버에서 작성자를 찾아요)
create or replace function public.block_user_by_post(p_post uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.block_user_internal((select p.author_id from public.lost_posts p where p.id = p_post and p.deleted_at is null));
end;
$$;

-- 댓글 쓴 사람을 차단 (댓글 작성자 ID는 화면에 주지 않으니 서버에서 찾아요)
create or replace function public.block_user_by_comment(p_comment uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.block_user_internal((select c.author_id from public.post_comments c where c.id = p_comment and c.deleted_at is null));
end;
$$;

create or replace function public.unblock_user(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception '로그인이 필요해요.';
  end if;
  -- 이미 해제된 경우(두 번 누름)도 오류 없이 넘어가요
  delete from public.user_blocks where blocker_id = auth.uid() and blocked_id = p_user;
end;
$$;

-- 내 차단 목록 (닉네임만, 이메일 없음)
create or replace function public.my_blocks()
returns table (user_id uuid, nickname text, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select b.blocked_id, coalesce(nullif(pr.nickname, ''), '회원'), b.created_at
  from public.user_blocks b
  left join public.profiles pr on pr.id = b.blocked_id
  where b.blocker_id = auth.uid()
  order by b.created_at desc;
$$;

-- 10) 관리자 ---------------------------------------------------------------------
-- 신고를 대상별로 모아 최근 신고 순으로 (최대 200개)
create or replace function public.admin_list_reports()
returns table (
  target_type text, target_id uuid, report_count integer, reasons text[], last_reported_at timestamptz,
  hidden_at timestamptz, deleted boolean, excerpt text, post_id uuid,
  author_name text, is_secret boolean, details text[]
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception '관리자만 볼 수 있어요.';
  end if;
  return query
  with agg as (
    select r.target_type, r.target_id,
           count(*)::integer as report_count,
           array_agg(distinct r.reason) as reasons,
           max(r.created_at) as last_reported_at,
           coalesce(array_agg(r.detail order by r.created_at desc) filter (where r.detail is not null), '{}'::text[]) as details
    from public.content_reports r
    group by r.target_type, r.target_id
  )
  select a.target_type, a.target_id, a.report_count, a.reasons, a.last_reported_at,
         case when a.target_type = 'post' then p.hidden_at else c.hidden_at end,
         case when a.target_type = 'post' then p.id is null or p.deleted_at is not null
              else c.id is null or c.deleted_at is not null or cp.deleted_at is not null end,
         case when a.target_type = 'post' then p.title
              when char_length(cb.body) > 80 then left(cb.body, 80) || '…'
              else cb.body end,
         coalesce(p.id, c.post_id),
         coalesce(p.author_name, c.author_name),
         coalesce(c.is_secret, false),
         a.details
  from agg a
  left join public.lost_posts p on a.target_type = 'post' and p.id = a.target_id
  left join public.post_comments c on a.target_type = 'comment' and c.id = a.target_id
  left join public.lost_posts cp on cp.id = c.post_id
  -- 댓글 본문은 줄바꿈·연속 공백을 한 칸으로 줄여 80자까지만
  left join lateral (select regexp_replace(btrim(c.body), '\s+', ' ', 'g') as body) cb on true
  order by a.last_reported_at desc
  limit 200;
end;
$$;

create or replace function public.admin_set_hidden(p_type text, p_id uuid, p_hidden boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception '관리자만 할 수 있어요.';
  end if;
  if p_type = 'post' then
    update public.lost_posts
       set hidden_at = case when p_hidden then coalesce(hidden_at, now()) end
     where id = p_id;
  elsif p_type = 'comment' then
    update public.post_comments
       set hidden_at = case when p_hidden then coalesce(hidden_at, now()) end
     where id = p_id;
  else
    raise exception '대상 종류가 올바르지 않아요.';
  end if;
  if not found then
    raise exception '없는 글이나 댓글이에요.';
  end if;
end;
$$;

-- 삭제는 지운 표시만 (신고 기록과 함께 남겨서 나중에 확인할 수 있게)
create or replace function public.admin_delete_content(p_type text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception '관리자만 할 수 있어요.';
  end if;
  if p_type = 'post' then
    update public.lost_posts set deleted_at = now() where id = p_id and deleted_at is null;
  elsif p_type = 'comment' then
    update public.post_comments set deleted_at = now() where id = p_id and deleted_at is null;
  else
    raise exception '대상 종류가 올바르지 않아요.';
  end if;
  if not found then
    raise exception '이미 삭제되었거나 없는 글이에요.';
  end if;
end;
$$;

-- 11) 함수 권한: Supabase 는 새 함수를 anon·authenticated 에 기본으로 열어 두니 모두 닫고 필요한 곳만 열기 ----
revoke execute on function public.is_admin() from public, anon, authenticated;
revoke execute on function public.my_blocked_ids() from public, anon, authenticated;
revoke execute on function public.moderation_guard() from public, anon, authenticated;
revoke execute on function public.lost_posts_before_write() from public, anon, authenticated;
revoke execute on function public.post_comments_count() from public, anon, authenticated;
revoke execute on function public.get_post_comments(uuid) from public, anon, authenticated;
revoke execute on function public.get_vehicle_post(text) from public, anon, authenticated;
revoke execute on function public.report_content(text, uuid, text, text) from public, anon, authenticated;
revoke execute on function public.block_user_internal(uuid) from public, anon, authenticated;
revoke execute on function public.block_user_by_post(uuid) from public, anon, authenticated;
revoke execute on function public.block_user_by_comment(uuid) from public, anon, authenticated;
revoke execute on function public.unblock_user(uuid) from public, anon, authenticated;
revoke execute on function public.my_blocks() from public, anon, authenticated;
revoke execute on function public.admin_list_reports() from public, anon, authenticated;
revoke execute on function public.admin_set_hidden(text, uuid, boolean) from public, anon, authenticated;
revoke execute on function public.admin_delete_content(text, uuid) from public, anon, authenticated;

-- 정책 안에서 불리므로 글·댓글을 읽는 모든 사람(로그인 안 한 사람 포함)이 실행할 수 있어야 해요.
-- 둘 다 '지금 보는 사람 자신'의 정보만 돌려줘요.
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.my_blocked_ids() to anon, authenticated;
grant execute on function public.get_post_comments(uuid) to anon, authenticated;
grant execute on function public.get_vehicle_post(text) to anon, authenticated;
grant execute on function public.report_content(text, uuid, text, text) to authenticated;
grant execute on function public.block_user_by_post(uuid) to authenticated;
grant execute on function public.block_user_by_comment(uuid) to authenticated;
grant execute on function public.unblock_user(uuid) to authenticated;
grant execute on function public.my_blocks() to authenticated;
grant execute on function public.admin_list_reports() to authenticated;
grant execute on function public.admin_set_hidden(text, uuid, boolean) to authenticated;
grant execute on function public.admin_delete_content(text, uuid) to authenticated;
-- block_user_internal 은 위 두 차단 함수 안에서만 씀 (definer 끼리라 함수 주인 권한으로 불려요)
