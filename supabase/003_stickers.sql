-- =====================================================================
-- B-LOCK 3차: 미리 인쇄한 QR 스티커 · 비밀 답글
-- schema.sql, 002_community.sql 다음에 실행하세요. (여러 번 실행해도 안전)
--   - 관리자가 빈 스티커 코드를 묶음으로 만들어 인쇄 → 학교·편의점에 배치
--   - 사용자가 스티커를 찍어 내 이동수단에 등록 (주인만 아는 부착 위치 기록)
--   - 스티커를 찍은 사람의 제보는 연결된 이동수단 주인에게 전달
--   - 댓글에 답글: 비밀 댓글에 단 비밀 답글은 원래 댓글 쓴 사람도 볼 수 있음
-- =====================================================================

-- 1) 관리자 표시 (스티커 묶음 만들기용). 대시보드에서 직접 true로 바꿉니다.
alter table public.profiles add column if not exists is_admin boolean not null default false;

-- 본인이 is_admin 을 스스로 바꾸지 못하게 (프로필 수정 권한은 닉네임용)
create or replace function public.profiles_guard()
returns trigger language plpgsql as $$
begin
  if new.is_admin is distinct from old.is_admin and current_user in ('authenticated', 'anon') then
    new.is_admin := old.is_admin;
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.profiles_guard();

-- 2) 이동수단: 주인만 아는 스티커 부착 위치 (RLS로 주인만 읽음)
alter table public.vehicles add column if not exists sticker_spot text check (char_length(sticker_spot) <= 200);

-- 3) 스티커 묶음과 스티커
create table if not exists public.sticker_batches (
  id          uuid primary key default gen_random_uuid(),
  label       text not null check (char_length(btrim(label)) between 1 and 60),  -- 예) 울산대 학생회관 1차
  quantity    integer not null check (quantity between 1 and 1000),
  created_by  uuid references auth.users (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now()
);

create table if not exists public.stickers (
  code        text primary key,                     -- QR에 들어가는 무작위 코드 (개인정보 없음)
  batch_id    uuid references public.sticker_batches (id) on delete set null,
  vehicle_id  uuid references public.vehicles (id) on delete set null,
  claimed_by  uuid references auth.users (id) on delete set null,
  claimed_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists stickers_vehicle_idx on public.stickers (vehicle_id);
create index if not exists stickers_batch_idx on public.stickers (batch_id);

alter table public.sticker_batches enable row level security;
alter table public.stickers enable row level security;

-- 관리자만 묶음·코드 목록을 봄 / 일반 사용자는 내 이동수단에 붙은 스티커만
drop policy if exists "admins read batches" on public.sticker_batches;
create policy "admins read batches" on public.sticker_batches for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));
drop policy if exists "read own or admin stickers" on public.stickers;
create policy "read own or admin stickers" on public.stickers for select to authenticated
  using (
    claimed_by = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );
grant select on public.sticker_batches to authenticated;
grant select on public.stickers to authenticated;

-- QR 코드 → 이동수단 (스티커 코드 또는 직접 출력한 QR 코드 모두)
create or replace function public.resolve_vehicle(p_token text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select s.vehicle_id from public.stickers s where s.code = p_token and s.vehicle_id is not null),
    (select v.id from public.vehicles v where v.qr_token = p_token)
  );
$$;
revoke all on function public.resolve_vehicle(text) from public;

-- 스티커 상태: unclaimed(새 스티커) / claimed(등록됨) / null(스티커 아님)
create or replace function public.get_sticker_status(p_code text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case when s.vehicle_id is null then 'unclaimed' else 'claimed' end
  from public.stickers s where s.code = p_code;
$$;

-- 스티커를 내 이동수단에 등록 (새 스티커만, 로그인 필요)
create or replace function public.claim_sticker(p_code text, p_vehicle uuid, p_spot text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요해요.';
  end if;
  select owner_id into v_owner from public.vehicles where id = p_vehicle and deleted_at is null;
  if v_owner is null or v_owner <> auth.uid() then
    raise exception '내 이동수단에만 등록할 수 있어요.';
  end if;
  update public.stickers
     set vehicle_id = p_vehicle, claimed_by = auth.uid(), claimed_at = now()
   where code = p_code and vehicle_id is null;
  if not found then
    if exists (select 1 from public.stickers where code = p_code) then
      raise exception '이미 다른 이동수단에 등록된 스티커예요.';
    end if;
    raise exception 'B-LOCK 스티커가 아니에요. QR을 다시 확인해 주세요.';
  end if;
  if p_spot is not null and btrim(p_spot) <> '' then
    update public.vehicles set sticker_spot = left(btrim(p_spot), 200) where id = p_vehicle;
  end if;
end;
$$;

-- 내 스티커 등록 해제 (스티커를 떼었거나 잘못 등록했을 때) → 다시 '새 스티커'가 되지 않고 사용 중지
create or replace function public.release_sticker(p_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.stickers where code = p_code and claimed_by = auth.uid();
  if not found then
    raise exception '해제할 수 없는 스티커예요.';
  end if;
end;
$$;

-- 관리자: 스티커 묶음 만들기 → 인쇄용 코드 목록
create or replace function public.create_sticker_batch(p_label text, p_quantity integer)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch uuid;
  i integer;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_admin) then
    raise exception '관리자만 스티커를 만들 수 있어요.';
  end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 1000 then
    raise exception '한 번에 1~1000장까지 만들 수 있어요.';
  end if;
  insert into public.sticker_batches (label, quantity) values (btrim(p_label), p_quantity) returning id into v_batch;
  for i in 1..p_quantity loop
    insert into public.stickers (code, batch_id)
    values (replace(replace(replace(encode(gen_random_bytes(15), 'base64'), '+', '-'), '/', '_'), '=', ''), v_batch)
    on conflict do nothing;
  end loop;
  return v_batch;
end;
$$;

-- 4) 기존 공개 함수들이 스티커 코드도 알아보도록 -----------------------------
create or replace function public.get_public_vehicle(p_token text)
returns table (
  qr_token text, type text, brand text, model text, color text,
  description text, image_path text, status text, available boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select p_token, v.type, v.brand, v.model, v.color, v.description, v.image_path, v.status,
         v.deleted_at is null as available
  from public.vehicles v
  where v.id = public.resolve_vehicle(p_token)
  limit 1;
$$;

create or replace function public.submit_report(
  p_token text,
  p_kind text,
  p_description text,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_location_text text default null,
  p_image_path text default null,
  p_contact text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vehicle uuid;
  v_id uuid;
begin
  select id into v_vehicle from public.vehicles where id = public.resolve_vehicle(p_token) and deleted_at is null;
  if v_vehicle is null then
    raise exception '등록되지 않았거나 사용할 수 없는 QR입니다.';
  end if;
  if p_kind not in ('found', 'contact') then
    raise exception '제보 종류가 올바르지 않습니다.';
  end if;
  if char_length(btrim(coalesce(p_description, ''))) = 0 then
    raise exception '설명을 입력해 주세요.';
  end if;
  if (select count(*) from public.reports where vehicle_id = v_vehicle and created_at > now() - interval '10 minutes') >= 20 then
    raise exception '잠시 후 다시 시도해 주세요.';
  end if;
  if p_image_path is not null and p_image_path !~ '^reports/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$' then
    raise exception '사진 경로가 올바르지 않습니다.';
  end if;

  insert into public.reports (vehicle_id, reporter_id, kind, latitude, longitude, location_text, description, image_path, contact)
  values (v_vehicle, auth.uid(), p_kind, p_latitude, p_longitude,
          nullif(btrim(p_location_text), ''), btrim(p_description), p_image_path, nullif(btrim(p_contact), ''))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.get_vehicle_post(p_token text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id
  from public.lost_posts p join public.vehicles v on v.id = p.vehicle_id
  where v.id = public.resolve_vehicle(p_token) and v.deleted_at is null and p.deleted_at is null and p.status = 'open'
  order by p.created_at desc
  limit 1;
$$;

-- 5) 커뮤니티 글: 스티커가 붙은 이동수단인지 표시 (위치는 공개 안 함) ----------
alter table public.lost_posts add column if not exists has_sticker boolean not null default false;

create or replace function public.lost_posts_sticker_flag()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.has_sticker := new.vehicle_id is not null and exists (select 1 from public.stickers s where s.vehicle_id = new.vehicle_id);
  return new;
end;
$$;
drop trigger if exists lost_posts_sticker_flag on public.lost_posts;
create trigger lost_posts_sticker_flag before insert or update of vehicle_id on public.lost_posts
  for each row execute function public.lost_posts_sticker_flag();

-- 6) 답글 ---------------------------------------------------------------
alter table public.post_comments add column if not exists parent_id uuid references public.post_comments (id) on delete cascade;

-- 답글은 한 단계만, 같은 글 안에서만
create or replace function public.post_comments_reply_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.parent_id is not null and not exists (
    select 1 from public.post_comments c
    where c.id = new.parent_id and c.post_id = new.post_id and c.parent_id is null and c.deleted_at is null
  ) then
    raise exception '답글을 달 수 없는 댓글이에요.';
  end if;
  return new;
end;
$$;
drop trigger if exists post_comments_reply_check on public.post_comments;
create trigger post_comments_reply_check before insert on public.post_comments
  for each row execute function public.post_comments_reply_check();

-- 비밀 댓글을 볼 수 있는 사람: 댓글 쓴 사람, 글쓴이, (답글이면) 원래 댓글 쓴 사람
create or replace function public.can_view_comment(c public.post_comments)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not c.is_secret
      or c.author_id = auth.uid()
      or exists (select 1 from public.lost_posts p where p.id = c.post_id and p.author_id = auth.uid())
      or exists (select 1 from public.post_comments pc where pc.id = c.parent_id and pc.author_id = auth.uid());
$$;

drop policy if exists "read visible comments" on public.post_comments;
create policy "read visible comments" on public.post_comments for select to anon, authenticated
  using (deleted_at is null and public.can_view_comment(post_comments));

drop function if exists public.get_post_comments(uuid);
create function public.get_post_comments(p_post uuid)
returns table (
  id uuid, parent_id uuid, author_name text, is_secret boolean, can_view boolean, is_mine boolean,
  is_post_author boolean, body text, latitude double precision, longitude double precision,
  location_text text, image_path text, created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.parent_id, c.author_name, c.is_secret, v.ok, coalesce(c.author_id = auth.uid(), false),
         c.author_id = p.author_id,
         case when v.ok then c.body end,
         case when v.ok then c.latitude end,
         case when v.ok then c.longitude end,
         case when v.ok then c.location_text end,
         case when v.ok then c.image_path end,
         c.created_at
  from public.post_comments c
  join public.lost_posts p on p.id = c.post_id and p.deleted_at is null
  cross join lateral (select coalesce(public.can_view_comment(c), false) as ok) v
  where c.post_id = p_post and c.deleted_at is null
  order by c.created_at;
$$;
revoke all on function public.get_post_comments(uuid) from public;
grant execute on function public.get_post_comments(uuid) to anon, authenticated;

-- 비밀 답글 사진도 원래 댓글 쓴 사람이 볼 수 있게
drop policy if exists "community secret read" on storage.objects;
create policy "community secret read" on storage.objects for select to authenticated
  using (
    bucket_id = 'community-secret'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1 from public.post_comments c
        where c.image_path = storage.objects.name and c.is_secret and c.deleted_at is null and public.can_view_comment(c)
      )
    )
  );

revoke all on function public.get_sticker_status(text) from public;
revoke all on function public.claim_sticker(text, uuid, text) from public;
revoke all on function public.release_sticker(text) from public;
revoke all on function public.create_sticker_batch(text, integer) from public;
revoke all on function public.can_view_comment(public.post_comments) from public;
grant execute on function public.get_sticker_status(text) to anon, authenticated;
grant execute on function public.claim_sticker(text, uuid, text) to authenticated;
grant execute on function public.release_sticker(text) to authenticated;
grant execute on function public.create_sticker_batch(text, integer) to authenticated;
grant execute on function public.can_view_comment(public.post_comments) to anon, authenticated;
