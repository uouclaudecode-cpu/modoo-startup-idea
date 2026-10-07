-- =====================================================================
-- B-LOCK 12차: 출시 전 검토에서 찾은 문제 고치기 (011 다음에 실행, 여러 번 실행해도 안전)
--   1) 글·댓글 작성 시각을 서버 시각으로 고정 (맨 위 고정·작성 제한 우회 방지)
--   2) 삭제하면 위치는 바로 지우고, 사진은 정리 대기열에 넣고, 30일 뒤 완전히 지우기
--   3) 이동수단을 지우면 받은 발견 제보(연락처·위치·사진)도 지우기
--   4) 숨김·삭제·차단된 글의 댓글은 직접 조회로도 안 보이게
--   5) 차단한 사람의 댓글·답글 알림은 보내지 않기
--   6) 관리자가 '다시 보이기'한 글은 신고가 더 와도 자동으로 다시 숨기지 않기
--   7) 탈퇴하면 내 QR 스티커는 사용 중지, 댓글 수도 다시 셈
--   8) 닉네임 규칙 우회 막기 (프로필은 알림 설정만 직접 수정 가능)
--   9) 알림 기기는 함수로만 등록, 테스트 알림은 1분에 한 번
-- =====================================================================

-- ---------------------------------------------------------------------
-- 공통 도우미
-- ---------------------------------------------------------------------
-- a가 b를 차단했는지
create or replace function public.has_blocked(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select a is not null and b is not null and exists (select 1 from public.user_blocks x where x.blocker_id = a and x.blocked_id = b);
$$;

-- 지금 보는 사람이 이 글을 볼 수 있는지 (지우지 않음, 숨기지 않음(글쓴이·관리자 제외), 차단하지 않은 사람의 글)
create or replace function public.post_visible(p_post uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.lost_posts p
    where p.id = p_post
      and p.deleted_at is null
      and (p.hidden_at is null or p.author_id = auth.uid() or public.is_admin())
      and not public.has_blocked(auth.uid(), p.author_id)
  );
$$;

-- ---------------------------------------------------------------------
-- 2) 사진 정리 대기열: 지운 글·댓글·제보의 사진 파일 (관리자 화면에서 한 번에 지움)
--    데이터베이스에서는 저장소 파일을 직접 지울 수 없어서, 경로를 모아 두고 관리자 권한으로 지워요.
-- ---------------------------------------------------------------------
create table if not exists public.storage_cleanup_queue (
  bucket     text not null check (bucket in ('vehicle-images', 'community-images', 'community-secret', 'report-images')),
  path       text not null,
  created_at timestamptz not null default now(),
  primary key (bucket, path)
);
alter table public.storage_cleanup_queue enable row level security;
drop policy if exists "admins read cleanup" on public.storage_cleanup_queue;
create policy "admins read cleanup" on public.storage_cleanup_queue for select to authenticated using (public.is_admin());
revoke all on public.storage_cleanup_queue from anon, authenticated;
grant select on public.storage_cleanup_queue to authenticated;

create or replace function public.enqueue_cleanup(p_bucket text, p_path text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.storage_cleanup_queue (bucket, path)
  select p_bucket, p_path where p_path is not null and p_path <> ''
  on conflict do nothing;
$$;

-- 관리자: 대기열에 있는 파일만 지울 수 있게 (지운 뒤 admin_clear_cleanup 으로 목록에서 빼요)
drop policy if exists "admins delete queued files" on storage.objects;
create policy "admins delete queued files" on storage.objects for delete to authenticated
  using (
    bucket_id in ('vehicle-images', 'community-images', 'community-secret', 'report-images')
    and public.is_admin()
    and exists (select 1 from public.storage_cleanup_queue q where q.bucket = storage.objects.bucket_id and q.path = storage.objects.name)
  );
-- 저장소 API로 지우려면 읽기 권한도 필요해요
drop policy if exists "admins read queued files" on storage.objects;
create policy "admins read queued files" on storage.objects for select to authenticated
  using (
    bucket_id in ('vehicle-images', 'community-images', 'community-secret', 'report-images')
    and public.is_admin()
    and exists (select 1 from public.storage_cleanup_queue q where q.bucket = storage.objects.bucket_id and q.path = storage.objects.name)
  );

create or replace function public.admin_clear_cleanup(p_bucket text, p_paths text[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if not public.is_admin() then
    raise exception '관리자만 할 수 있어요.';
  end if;
  delete from public.storage_cleanup_queue where bucket = p_bucket and path = any (p_paths);
  get diagnostics n = row_count;
  return n;
end;
$$;

-- 이동수단 주인은 받은 발견 제보 사진을 지울 수 있게 (탈퇴·이동수단 삭제 전에 화면에서 정리)
drop policy if exists "report images owner delete" on storage.objects;
create policy "report images owner delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'report-images'
    and exists (
      select 1 from public.reports r join public.vehicles v on v.id = r.vehicle_id
      where r.image_path = storage.objects.name and v.owner_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------
-- 1) + 2) 글 쓰기·고치기 최종본 (011 + 작성 시각 고정 + 삭제하면 위치 지우기·사진 정리)
-- ---------------------------------------------------------------------
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
    new.resolved_at := null;
    -- 작성 시각은 서버가 정해요 (보내온 값으로 맨 위에 고정하거나 작성 제한을 피하지 못하게)
    new.created_at := now();
    new.updated_at := now();
    new.deleted_at := null;
    if (select count(*) from public.lost_posts where author_id = auth.uid() and created_at > now() - interval '1 hour') >= 5 then
      raise exception '글은 1시간에 5개까지 올릴 수 있어요. 잠시 후 다시 시도해 주세요.';
    end if;
    v_check := true;
  else
    new.author_id := old.author_id;
    if new.author_name is distinct from old.author_name
       and new.author_name is distinct from (select nullif(nickname, '') from public.profiles where id = old.author_id) then
      new.author_name := old.author_name;
    end if;
    if current_setting('blocklock.counting', true) is distinct from 'on' then
      new.comment_count := old.comment_count;
    end if;
    new.created_at := old.created_at;
    if current_setting('blocklock.backfill', true) is distinct from 'on' then
      if new.status = 'resolved' and old.status is distinct from 'resolved' then
        new.resolved_at := now();
      elsif new.status = 'open' then
        new.resolved_at := null;
      else
        new.resolved_at := old.resolved_at;
      end if;
      new.updated_at := now();
    end if;
    -- 지우는 순간: 지도 위치는 바로 지우고, 글에 올린 사진은 정리 대기열로
    if new.deleted_at is not null and old.deleted_at is null then
      new.lost_lat := null;
      new.lost_lng := null;
      if old.image_bucket = 'community-images' then
        perform public.enqueue_cleanup('community-images', old.image_path);
      end if;
      new.image_path := null;
      new.image_bucket := null;
      return new;  -- 지울 때는 이동수단·사진 검사가 필요 없어요
    end if;
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

-- 댓글 쓰기 최종본 (002 + 작성 시각 고정)
create or replace function public.post_comments_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.author_id := auth.uid();
  new.author_name := coalesce((select nullif(nickname, '') from public.profiles where id = auth.uid()), '회원');
  new.deleted_at := null;
  new.created_at := now();
  new.body := btrim(new.body);
  new.location_text := nullif(btrim(new.location_text), '');
  if not exists (select 1 from public.lost_posts p where p.id = new.post_id and p.deleted_at is null) then
    raise exception '삭제되었거나 없는 글이에요.';
  end if;
  if (select count(*) from public.post_comments where author_id = auth.uid() and created_at > now() - interval '10 minutes') >= 30 then
    raise exception '댓글을 너무 많이 남겼어요. 잠시 후 다시 시도해 주세요.';
  end if;
  if new.image_path is not null and new.image_path !~ ('^' || auth.uid()::text || '/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$') then
    raise exception '사진 경로가 올바르지 않습니다.';
  end if;
  return new;
end;
$$;

-- 댓글 지우기: 위치·사진은 바로 지우고(사진 파일은 대기열로), 글은 30일 뒤 완전히 지워요
create or replace function public.delete_post_comment(p_comment uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
begin
  select pc.* into c from public.post_comments pc
  where pc.id = p_comment and pc.deleted_at is null
    and (pc.author_id = auth.uid()
         or exists (select 1 from public.lost_posts p where p.id = pc.post_id and p.author_id = auth.uid()));
  if c.id is null then
    raise exception '삭제할 수 없는 댓글이에요.';
  end if;
  if c.image_path is not null then
    perform public.enqueue_cleanup(case when c.is_secret then 'community-secret' else 'community-images' end, c.image_path);
  end if;
  update public.post_comments
     set deleted_at = now(), latitude = null, longitude = null, location_text = null, image_path = null
   where id = p_comment;
end;
$$;

-- 관리자 삭제도 같은 방식으로 (006의 admin_delete_content 를 대신함)
create or replace function public.admin_delete_content(p_type text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
begin
  if not public.is_admin() then
    raise exception '관리자만 할 수 있어요.';
  end if;
  if p_type = 'post' then
    update public.lost_posts set deleted_at = coalesce(deleted_at, now()) where id = p_id;
  elsif p_type = 'comment' then
    select * into c from public.post_comments where id = p_id;
    if c.image_path is not null then
      perform public.enqueue_cleanup(case when c.is_secret then 'community-secret' else 'community-images' end, c.image_path);
    end if;
    update public.post_comments
       set deleted_at = coalesce(deleted_at, now()), latitude = null, longitude = null, location_text = null, image_path = null
     where id = p_id;
  else
    raise exception '대상 종류가 올바르지 않아요.';
  end if;
  if not found then
    raise exception '없는 글이나 댓글이에요.';
  end if;
end;
$$;

-- 완전히 지워지는 행(탈퇴로 연쇄 삭제, 30일 정리)의 사진도 대기열로
create or replace function public.post_comments_after_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.image_path is not null then
    perform public.enqueue_cleanup(case when old.is_secret then 'community-secret' else 'community-images' end, old.image_path);
  end if;
  return null;
end;
$$;
drop trigger if exists post_comments_after_delete on public.post_comments;
create trigger post_comments_after_delete after delete on public.post_comments
  for each row execute function public.post_comments_after_delete();

create or replace function public.lost_posts_after_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.image_bucket = 'community-images' then
    perform public.enqueue_cleanup('community-images', old.image_path);
  end if;
  return null;
end;
$$;
drop trigger if exists lost_posts_after_delete on public.lost_posts;
create trigger lost_posts_after_delete after delete on public.lost_posts
  for each row execute function public.lost_posts_after_delete();

create or replace function public.reports_after_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.enqueue_cleanup('report-images', old.image_path);
  return null;
end;
$$;
drop trigger if exists reports_after_delete on public.reports;
create trigger reports_after_delete after delete on public.reports
  for each row execute function public.reports_after_delete();

-- 3) 이동수단을 지우면 받은 발견 제보도 지워요 (연락처·위치·사진 보관 최소화)
create or replace function public.vehicles_purge_reports()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    delete from public.reports where vehicle_id = new.id;
  end if;
  return null;
end;
$$;
drop trigger if exists vehicles_purge_reports on public.vehicles;
create trigger vehicles_purge_reports after update of deleted_at on public.vehicles
  for each row execute function public.vehicles_purge_reports();

-- 이미 지운 이동수단에 남아 있던 제보도 정리
delete from public.reports r using public.vehicles v where v.id = r.vehicle_id and v.deleted_at is not null;

-- 2) 지운 지 30일 지난 글·댓글은 완전히 지우기 (매일 04시 KST)
create or replace function public.purge_deleted_content()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.post_comments where deleted_at is not null and deleted_at < now() - interval '30 days';
  delete from public.lost_posts where deleted_at is not null and deleted_at < now() - interval '30 days';
end;
$$;
do $$
begin
  if exists (select 1 from cron.job where jobname = 'b-lock-purge-deleted') then
    perform cron.unschedule('b-lock-purge-deleted');
  end if;
  perform cron.schedule('b-lock-purge-deleted', '0 19 * * *', 'select public.purge_deleted_content()');
end;
$$;

-- ---------------------------------------------------------------------
-- 4) 댓글 직접 조회: 볼 수 있는 글의 댓글만
-- ---------------------------------------------------------------------
drop policy if exists "read visible comments" on public.post_comments;
create policy "read visible comments" on public.post_comments for select to anon, authenticated
  using (
    deleted_at is null
    and public.can_view_comment(post_comments)
    and (hidden_at is null or author_id = auth.uid() or (select public.is_admin()))
    and author_id <> all (coalesce((select public.my_blocked_ids()), '{}'::uuid[]))
    and public.post_visible(post_id)
  );

-- 7) 댓글 수: 완전히 지워질 때(탈퇴 등)도 다시 셈
drop trigger if exists post_comments_count on public.post_comments;
create trigger post_comments_count after insert or delete or update of deleted_at, hidden_at on public.post_comments
  for each row execute function public.post_comments_count();

-- QR 화면의 분실 글 연결: 내가 차단한 사람의 글이면 연결하지 않음
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
    and not public.has_blocked(auth.uid(), p.author_id)
  order by p.created_at desc
  limit 1;
$$;

-- ---------------------------------------------------------------------
-- 5) 댓글·답글 알림: 받는 사람이 쓴 사람을 차단했으면 보내지 않음
-- ---------------------------------------------------------------------
create or replace function public.post_comments_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post record;
  v_parent_author uuid;
  v_preview text;
begin
  select id, author_id, title into v_post from public.lost_posts where id = new.post_id and deleted_at is null;
  if v_post.id is null then
    return null;
  end if;
  if new.parent_id is not null then
    select author_id into v_parent_author from public.post_comments where id = new.parent_id;
  end if;
  v_preview := new.author_name || ': ' || left(new.body, 80);

  -- (b) 글쓴이에게 (본인이 단 댓글, 차단한 사람의 댓글은 빼고)
  if new.author_id is distinct from v_post.author_id and not public.has_blocked(v_post.author_id, new.author_id) then
    perform public.send_push(
      v_post.author_id,
      case when new.is_secret then '🔒 비밀 댓글이 왔어요'
           when v_parent_author = v_post.author_id then '↩️ 내 댓글에 답글이 달렸어요'
           else '💬 분실 글에 새 댓글' end,
      case when new.is_secret then '「' || left(v_post.title, 30) || '」 글에 ' || new.author_name || '님이 비밀 댓글을 남겼어요.'
           else v_preview end,
      '/community/' || v_post.id,
      'post-' || v_post.id,
      'comments'
    );
  end if;

  -- (c) 답글이면 원래 댓글 쓴 사람에게 (본인 답글, 글쓴이(위에서 받음), 차단한 사람의 답글은 빼고)
  if v_parent_author is not null
     and v_parent_author is distinct from new.author_id
     and v_parent_author is distinct from v_post.author_id
     and not public.has_blocked(v_parent_author, new.author_id)
     and not public.has_blocked(v_parent_author, v_post.author_id) then
    perform public.send_push(
      v_parent_author,
      '↩️ 내 댓글에 답글이 달렸어요',
      case when new.is_secret then new.author_name || '님이 비밀 답글을 남겼어요.' else v_preview end,
      '/community/' || v_post.id,
      'reply-' || new.parent_id,
      'comments'
    );
  end if;
  return null;
exception when others then
  raise notice 'post_comments_push 실패: %', sqlerrm;
  return null;
end;
$$;

-- ---------------------------------------------------------------------
-- 6) 관리자가 '다시 보이기'하면 자동 숨김 다시 안 함
-- ---------------------------------------------------------------------
alter table public.lost_posts add column if not exists moderation_cleared_at timestamptz;
alter table public.post_comments add column if not exists moderation_cleared_at timestamptz;

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
       set hidden_at = case when p_hidden then coalesce(hidden_at, now()) end,
           moderation_cleared_at = case when p_hidden then moderation_cleared_at else now() end
     where id = p_id;
  elsif p_type = 'comment' then
    update public.post_comments
       set hidden_at = case when p_hidden then coalesce(hidden_at, now()) end,
           moderation_cleared_at = case when p_hidden then moderation_cleared_at else now() end
     where id = p_id;
  else
    raise exception '대상 종류가 올바르지 않아요.';
  end if;
  if not found then
    raise exception '없는 글이나 댓글이에요.';
  end if;
end;
$$;

-- moderation_guard 가 사용자 직접 수정으로 hidden_at·moderation_cleared_at 을 못 바꾸게
create or replace function public.moderation_guard()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.hidden_at := null;
      new.moderation_cleared_at := null;
    else
      new.hidden_at := old.hidden_at;
      new.moderation_cleared_at := old.moderation_cleared_at;
      -- 관리자가 지운 글을 글쓴이가 되살리지 못하게
      if old.deleted_at is not null then
        new.deleted_at := old.deleted_at;
      end if;
    end if;
  end if;
  return new;
end;
$$;

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
  v_cleared timestamptz;
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
    select p.author_id, p.moderation_cleared_at into v_author, v_cleared from public.lost_posts p where p.id = p_id and p.deleted_at is null;
  else
    select c.author_id, coalesce(public.can_view_comment(c), false), c.moderation_cleared_at into v_author, v_can_view, v_cleared
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
  if (select count(*) from public.content_reports where reporter_id = v_uid and created_at > now() - interval '1 hour') >= 20 then
    raise exception '신고는 1시간에 20번까지 할 수 있어요. 잠시 후 다시 시도해 주세요.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_type || ':' || p_id::text, 0));

  insert into public.content_reports (reporter_id, target_type, target_id, reason, detail)
  values (v_uid, p_type, p_id, p_reason, v_detail)
  on conflict (reporter_id, target_type, target_id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    raise exception '이미 신고했어요.';
  end if;

  -- 관리자가 확인하고 다시 보이게 한 글·댓글은 자동으로 다시 숨기지 않아요 (관리자 판단 우선)
  if v_cleared is not null then
    return false;
  end if;
  select count(distinct r.reporter_id) into v_reporters
  from public.content_reports r where r.target_type = p_type and r.target_id = p_id;
  if v_reporters >= 3 then
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

-- ---------------------------------------------------------------------
-- 7) 탈퇴: 내 QR 스티커는 사용 중지(다른 사람이 다시 등록하지 못하게), 연결 데이터는 함께 지움
-- ---------------------------------------------------------------------
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception '로그인이 필요해요.';
  end if;
  delete from public.stickers
   where claimed_by = auth.uid()
      or vehicle_id in (select id from public.vehicles where owner_id = auth.uid());
  delete from auth.users where id = auth.uid();
end;
$$;

-- ---------------------------------------------------------------------
-- 8) 프로필: 직접 수정은 알림 설정만 (닉네임은 change_nickname 으로만)
-- ---------------------------------------------------------------------
revoke update on public.profiles from authenticated;
grant update (notify_reports, notify_comments, notify_maintenance) on public.profiles to authenticated;

-- ---------------------------------------------------------------------
-- 9) 알림 기기는 save_push_subscription 으로만(최대 10대), 테스트 알림은 1분에 한 번
-- ---------------------------------------------------------------------
drop policy if exists "owner inserts push subscriptions" on public.push_subscriptions;
revoke insert on public.push_subscriptions from authenticated;

alter table public.profiles add column if not exists last_test_push_at timestamptz;
create or replace function public.claim_test_push()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return false;
  end if;
  update public.profiles set last_test_push_at = now()
   where id = auth.uid() and (last_test_push_at is null or last_test_push_at < now() - interval '1 minute');
  return found;
end;
$$;

-- ---------------------------------------------------------------------
-- 권한 정리
-- ---------------------------------------------------------------------
revoke execute on function public.has_blocked(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.enqueue_cleanup(text, text) from public, anon, authenticated;
revoke execute on function public.purge_deleted_content() from public, anon, authenticated;
revoke execute on function public.post_comments_after_delete() from public, anon, authenticated;
revoke execute on function public.lost_posts_after_delete() from public, anon, authenticated;
revoke execute on function public.reports_after_delete() from public, anon, authenticated;
revoke execute on function public.vehicles_purge_reports() from public, anon, authenticated;
revoke execute on function public.post_comments_push() from public, anon, authenticated;
revoke execute on function public.lost_posts_before_write() from public, anon, authenticated;
revoke execute on function public.post_comments_before_insert() from public, anon, authenticated;
revoke execute on function public.moderation_guard() from public, anon, authenticated;
-- 정책에서 쓰는 함수는 조회하는 사람도 실행할 수 있어야 해요
revoke execute on function public.post_visible(uuid) from public;
grant execute on function public.post_visible(uuid) to anon, authenticated;
revoke execute on function public.delete_post_comment(uuid) from public, anon;
grant execute on function public.delete_post_comment(uuid) to authenticated;
revoke execute on function public.admin_delete_content(text, uuid) from public, anon;
grant execute on function public.admin_delete_content(text, uuid) to authenticated;
revoke execute on function public.admin_set_hidden(text, uuid, boolean) from public, anon;
grant execute on function public.admin_set_hidden(text, uuid, boolean) to authenticated;
revoke execute on function public.report_content(text, uuid, text, text) from public, anon;
grant execute on function public.report_content(text, uuid, text, text) to authenticated;
revoke execute on function public.admin_clear_cleanup(text, text[]) from public, anon;
grant execute on function public.admin_clear_cleanup(text, text[]) to authenticated;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
revoke execute on function public.claim_test_push() from public, anon;
grant execute on function public.claim_test_push() to authenticated;
revoke execute on function public.get_vehicle_post(text) from public;
grant execute on function public.get_vehicle_post(text) to anon, authenticated;
