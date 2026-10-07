-- =====================================================================
-- B-LOCK 데이터베이스 설정
-- Supabase 대시보드 → SQL Editor 에 전체를 붙여넣고 한 번 실행하세요. (여러 번 실행해도 안전)
-- =====================================================================

create extension if not exists pgcrypto;

-- 1) 회원 프로필 --------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,
  nickname    text not null default '',
  created_at  timestamptz not null default now()
);

-- 회원가입하면 프로필을 자동으로 만듭니다. (닉네임은 가입 시 입력값)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, nickname)
  values (new.id, new.email, coalesce(nullif(btrim(new.raw_user_meta_data ->> 'nickname'), ''), split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2) 이동수단 -------------------------------------------------------------
create table if not exists public.vehicles (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users (id) on delete cascade default auth.uid(),
  type         text not null check (type in ('bicycle', 'kickboard', 'other')),
  name         text not null check (char_length(name) between 1 and 40),
  brand        text check (char_length(brand) <= 40),
  model        text check (char_length(model) <= 40),
  color        text check (char_length(color) <= 30),
  description  text check (char_length(description) <= 500),
  image_path   text,                                   -- vehicle-images 버킷 안의 파일 경로
  -- QR에 들어가는 값: 예측할 수 없는 무작위 문자열 (개인정보·ID 없음)
  qr_token     text not null unique default replace(replace(replace(encode(gen_random_bytes(18), 'base64'), '+', '-'), '/', '_'), '=', ''),
  status       text not null default 'active' check (status in ('active', 'searching', 'recovered')),
  deleted_at   timestamptz,                            -- 삭제한 이동수단 (QR은 '사용할 수 없음'으로 표시)
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists vehicles_owner_idx on public.vehicles (owner_id);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists vehicles_touch on public.vehicles;
create trigger vehicles_touch before update on public.vehicles
  for each row execute function public.touch_updated_at();

-- 3) 발견 제보 -----------------------------------------------------------
create table if not exists public.reports (
  id             uuid primary key default gen_random_uuid(),
  vehicle_id     uuid not null references public.vehicles (id) on delete cascade,
  reporter_id    uuid references auth.users (id) on delete set null,
  kind           text not null default 'found' check (kind in ('found', 'contact')), -- 발견 제보 / 연락 요청
  latitude       double precision check (latitude between -90 and 90),
  longitude      double precision check (longitude between -180 and 180),
  location_text  text check (char_length(location_text) <= 200),
  description    text not null check (char_length(description) between 1 and 1000),
  image_path     text,                                 -- report-images 버킷 안의 파일 경로
  contact        text check (char_length(contact) <= 100),
  created_at     timestamptz not null default now()
);
create index if not exists reports_vehicle_idx on public.reports (vehicle_id, created_at desc);

-- 4) 권한 (Row Level Security) ------------------------------------------
alter table public.profiles enable row level security;
alter table public.vehicles enable row level security;
alter table public.reports  enable row level security;

-- 프로필: 본인만
drop policy if exists "own profile read" on public.profiles;
create policy "own profile read" on public.profiles for select to authenticated using (id = auth.uid());
drop policy if exists "own profile update" on public.profiles;
create policy "own profile update" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- 이동수단: 소유자만 보기·등록·수정 (QR 공개 정보는 아래 함수로만 제공)
drop policy if exists "owner reads vehicles" on public.vehicles;
create policy "owner reads vehicles" on public.vehicles for select to authenticated using (owner_id = auth.uid());
drop policy if exists "owner inserts vehicles" on public.vehicles;
create policy "owner inserts vehicles" on public.vehicles for insert to authenticated with check (owner_id = auth.uid());
drop policy if exists "owner updates vehicles" on public.vehicles;
create policy "owner updates vehicles" on public.vehicles for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- 제보: 소유자만 보기 (등록은 아래 함수로만)
drop policy if exists "owner reads reports" on public.reports;
create policy "owner reads reports" on public.reports for select to authenticated
  using (exists (select 1 from public.vehicles v where v.id = vehicle_id and v.owner_id = auth.uid()));

-- 5) QR 공개 정보: 소유자 개인정보 없이 필요한 항목만 돌려줍니다 -----------
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
  select v.qr_token, v.type, v.brand, v.model, v.color, v.description, v.image_path, v.status,
         v.deleted_at is null as available
  from public.vehicles v
  where v.qr_token = p_token
  limit 1;
$$;

-- 6) 제보 등록: QR 토큰으로만 제보를 남길 수 있게 (로그인 없이 가능) ------
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
  select id into v_vehicle from public.vehicles where qr_token = p_token and deleted_at is null;
  if v_vehicle is null then
    raise exception '등록되지 않았거나 사용할 수 없는 QR입니다.';
  end if;
  if p_kind not in ('found', 'contact') then
    raise exception '제보 종류가 올바르지 않습니다.';
  end if;
  if char_length(btrim(coalesce(p_description, ''))) = 0 then
    raise exception '설명을 입력해 주세요.';
  end if;
  -- 도배 방지: 같은 이동수단에 10분 동안 20건까지
  if (select count(*) from public.reports where vehicle_id = v_vehicle and created_at > now() - interval '10 minutes') >= 20 then
    raise exception '잠시 후 다시 시도해 주세요.';
  end if;
  -- 사진 경로는 report-images 버킷의 제보용 폴더만 허용
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

revoke all on function public.get_public_vehicle(text) from public;
revoke all on function public.submit_report(text, text, text, double precision, double precision, text, text, text) from public;
grant execute on function public.get_public_vehicle(text) to anon, authenticated;
grant execute on function public.submit_report(text, text, text, double precision, double precision, text, text, text) to anon, authenticated;

grant select, update on public.profiles to authenticated;
grant select, insert, update on public.vehicles to authenticated;
grant select on public.reports to authenticated;

-- 7) 사진 저장소 (Storage) ------------------------------------------------
-- vehicle-images: QR 공개 화면에 보여야 해서 공개 읽기. 올리기·지우기는 본인 폴더(사용자 ID)만.
-- report-images : 비공개. 올리기는 누구나(제보용, 5MB·이미지만), 보기는 해당 이동수단 소유자만.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('vehicle-images', 'vehicle-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('report-images', 'report-images', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "vehicle images upload own folder" on storage.objects;
create policy "vehicle images upload own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'vehicle-images' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "vehicle images delete own folder" on storage.objects;
create policy "vehicle images delete own folder" on storage.objects for delete to authenticated
  using (bucket_id = 'vehicle-images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "report images upload" on storage.objects;
create policy "report images upload" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'report-images' and (storage.foldername(name))[1] = 'reports');
drop policy if exists "report images owner read" on storage.objects;
create policy "report images owner read" on storage.objects for select to authenticated
  using (
    bucket_id = 'report-images'
    and exists (
      select 1 from public.reports r join public.vehicles v on v.id = r.vehicle_id
      where r.image_path = storage.objects.name and v.owner_id = auth.uid()
    )
  );
