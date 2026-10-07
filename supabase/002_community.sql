-- =====================================================================
-- B-LOCK 2차: 커뮤니티 (분실 게시글 · 댓글 · 비밀 댓글)
-- schema.sql 을 먼저 실행한 뒤, 이 파일 전체를 SQL Editor 에서 실행하세요. (여러 번 실행해도 안전)
--   - 글·공개 댓글은 누구나 읽기 / 쓰기는 로그인한 회원만
--   - 비밀 댓글은 댓글 쓴 사람과 글쓴이(주인)만 내용을 볼 수 있음
--   - 글쓴이 이름은 닉네임만 (이메일·전화번호 없음)
-- =====================================================================

create table if not exists public.lost_posts (
  id            uuid primary key default gen_random_uuid(),
  author_id     uuid not null references auth.users (id) on delete cascade default auth.uid(),
  author_name   text not null default '',
  vehicle_id    uuid references public.vehicles (id) on delete set null,   -- 내 이동수단과 연결 (선택)
  type          text not null default 'bicycle' check (type in ('bicycle', 'kickboard', 'other')),
  title         text not null check (char_length(btrim(title)) between 2 and 60),
  body          text not null check (char_length(btrim(body)) between 1 and 2000),
  lost_area     text check (char_length(lost_area) <= 100),
  lost_on       date,
  brand         text check (char_length(brand) <= 40),
  model         text check (char_length(model) <= 40),
  color         text check (char_length(color) <= 30),
  image_bucket  text check (image_bucket in ('vehicle-images', 'community-images')),
  image_path    text,
  status        text not null default 'open' check (status in ('open', 'resolved')),
  comment_count integer not null default 0,
  deleted_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists lost_posts_list_idx on public.lost_posts (created_at desc) where deleted_at is null;
create index if not exists lost_posts_vehicle_idx on public.lost_posts (vehicle_id) where deleted_at is null;

create table if not exists public.post_comments (
  id             uuid primary key default gen_random_uuid(),
  post_id        uuid not null references public.lost_posts (id) on delete cascade,
  author_id      uuid not null references auth.users (id) on delete cascade default auth.uid(),
  author_name    text not null default '',
  body           text not null check (char_length(btrim(body)) between 1 and 1000),
  is_secret      boolean not null default false,
  latitude       double precision check (latitude between -90 and 90),
  longitude      double precision check (longitude between -180 and 180),
  location_text  text check (char_length(location_text) <= 200),
  image_path     text,          -- 공개 댓글: community-images / 비밀 댓글: community-secret
  deleted_at     timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists post_comments_post_idx on public.post_comments (post_id, created_at);

-- 글: 작성자·닉네임 고정, 연결한 이동수단·사진 경로 검사, 도배 방지
create or replace function public.lost_posts_before_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.author_id := auth.uid();
    new.author_name := coalesce((select nullif(nickname, '') from public.profiles where id = auth.uid()), '회원');
    new.comment_count := 0;
    new.status := 'open';
    if (select count(*) from public.lost_posts where author_id = auth.uid() and created_at > now() - interval '1 hour') >= 5 then
      raise exception '글은 1시간에 5개까지 올릴 수 있어요. 잠시 후 다시 시도해 주세요.';
    end if;
  else
    -- 바꿀 수 없는 값 (댓글 수는 아래 트리거가 고칠 때만 바뀜)
    new.author_id := old.author_id;
    new.author_name := old.author_name;
    if current_setting('blocklock.counting', true) is distinct from 'on' then
      new.comment_count := old.comment_count;
    end if;
    new.created_at := old.created_at;
    new.updated_at := now();
  end if;

  if new.vehicle_id is not null and not exists (
    select 1 from public.vehicles v where v.id = new.vehicle_id and v.owner_id = new.author_id
  ) then
    raise exception '내 이동수단만 연결할 수 있어요.';
  end if;

  if new.image_path is null then
    new.image_bucket := null;
  elsif new.image_bucket = 'vehicle-images' then
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
  return new;
end;
$$;
drop trigger if exists lost_posts_before_write on public.lost_posts;
create trigger lost_posts_before_write before insert or update on public.lost_posts
  for each row execute function public.lost_posts_before_write();

-- 댓글: 작성자·닉네임 고정, 사진 경로 검사, 도배 방지
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
drop trigger if exists post_comments_before_insert on public.post_comments;
create trigger post_comments_before_insert before insert on public.post_comments
  for each row execute function public.post_comments_before_insert();

-- 글의 댓글 수 맞추기
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
     set comment_count = (select count(*) from public.post_comments c where c.post_id = v_post and c.deleted_at is null)
   where id = v_post;
  perform set_config('blocklock.counting', 'off', true);
  return null;
end;
$$;
drop trigger if exists post_comments_count on public.post_comments;
create trigger post_comments_count after insert or update of deleted_at on public.post_comments
  for each row execute function public.post_comments_count();

alter table public.lost_posts enable row level security;
alter table public.post_comments enable row level security;

drop policy if exists "anyone reads posts" on public.lost_posts;
create policy "anyone reads posts" on public.lost_posts for select to anon, authenticated using (deleted_at is null or author_id = auth.uid());
drop policy if exists "members write posts" on public.lost_posts;
create policy "members write posts" on public.lost_posts for insert to authenticated with check (author_id = auth.uid());
drop policy if exists "author updates posts" on public.lost_posts;
create policy "author updates posts" on public.lost_posts for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());

-- 댓글 테이블을 직접 읽을 때도 비밀 댓글은 댓글 쓴 사람·글쓴이만
drop policy if exists "read visible comments" on public.post_comments;
create policy "read visible comments" on public.post_comments for select to anon, authenticated
  using (
    deleted_at is null and (
      not is_secret
      or author_id = auth.uid()
      or exists (select 1 from public.lost_posts p where p.id = post_id and p.author_id = auth.uid())
    )
  );
drop policy if exists "members write comments" on public.post_comments;
create policy "members write comments" on public.post_comments for insert to authenticated with check (author_id = auth.uid());

-- 댓글 목록: 비밀 댓글은 볼 수 없는 사람에게 '비밀 댓글입니다'로만 보이게 (내용·위치·사진 없음)
create or replace function public.get_post_comments(p_post uuid)
returns table (
  id uuid, author_name text, is_secret boolean, can_view boolean, is_mine boolean,
  body text, latitude double precision, longitude double precision, location_text text,
  image_path text, created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.author_name, c.is_secret, v.ok, coalesce(c.author_id = auth.uid(), false),
         case when v.ok then c.body end,
         case when v.ok then c.latitude end,
         case when v.ok then c.longitude end,
         case when v.ok then c.location_text end,
         case when v.ok then c.image_path end,
         c.created_at
  from public.post_comments c
  join public.lost_posts p on p.id = c.post_id and p.deleted_at is null
  cross join lateral (
    select coalesce(not c.is_secret or c.author_id = auth.uid() or p.author_id = auth.uid(), false) as ok
  ) v
  where c.post_id = p_post and c.deleted_at is null
  order by c.created_at;
$$;

-- 댓글 삭제: 댓글 쓴 사람 또는 글쓴이
create or replace function public.delete_post_comment(p_comment uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.post_comments c
     set deleted_at = now()
   where c.id = p_comment
     and c.deleted_at is null
     and (c.author_id = auth.uid()
          or exists (select 1 from public.lost_posts p where p.id = c.post_id and p.author_id = auth.uid()));
  if not found then
    raise exception '삭제할 수 없는 댓글이에요.';
  end if;
end;
$$;

-- QR 공개 화면에서 '커뮤니티 분실 글'로 이어 주기 (글 ID만, 개인정보 없음)
create or replace function public.get_vehicle_post(p_token text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id
  from public.lost_posts p join public.vehicles v on v.id = p.vehicle_id
  where v.qr_token = p_token and v.deleted_at is null and p.deleted_at is null and p.status = 'open'
  order by p.created_at desc
  limit 1;
$$;

revoke all on function public.get_post_comments(uuid) from public;
revoke all on function public.delete_post_comment(uuid) from public;
revoke all on function public.get_vehicle_post(text) from public;
grant execute on function public.get_post_comments(uuid) to anon, authenticated;
grant execute on function public.delete_post_comment(uuid) to authenticated;
grant execute on function public.get_vehicle_post(text) to anon, authenticated;

grant select on public.lost_posts to anon;
grant select, insert, update on public.lost_posts to authenticated;
grant select on public.post_comments to anon;
grant select, insert on public.post_comments to authenticated;

-- 커뮤니티 사진
-- community-images: 공개 (글 사진·공개 댓글 사진). 올리기·지우기는 본인 폴더만.
-- community-secret: 비공개 (비밀 댓글 사진). 보기는 올린 사람과 해당 글쓴이만.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('community-images', 'community-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('community-secret', 'community-secret', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "community images upload own folder" on storage.objects;
create policy "community images upload own folder" on storage.objects for insert to authenticated
  with check (bucket_id in ('community-images', 'community-secret') and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "community images delete own folder" on storage.objects;
create policy "community images delete own folder" on storage.objects for delete to authenticated
  using (bucket_id in ('community-images', 'community-secret') and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "community secret read" on storage.objects;
create policy "community secret read" on storage.objects for select to authenticated
  using (
    bucket_id = 'community-secret'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1 from public.post_comments c join public.lost_posts p on p.id = c.post_id
        where c.image_path = storage.objects.name and c.is_secret and c.deleted_at is null and p.author_id = auth.uid()
      )
    )
  );
