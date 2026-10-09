-- 028: 집 주변 가림 · 관리자 관심 구역 통계
-- 1) privacy_zones: 공유 카드·경로 파일에서 뺄 장소 (본인만 보기, 1인 3곳까지)
--    suggest_privacy_zones(): 내 라이딩에서 자주 출발·도착한 곳 추천 (본인 기록만)
-- 2) admin_areas: 관리자가 정한 관심 구역 (관리자만)
--    admin_area_stats(): 구역별 숫자만 모아서 (개인 정보 없이)
-- 여러 번 실행해도 안전해요.

-- 1) 가림 장소 -------------------------------------------------------------
create table if not exists public.privacy_zones (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users (id) on delete cascade default auth.uid(),
  label       text not null default '가림 장소' check (char_length(label) between 1 and 30),
  lat         double precision not null check (lat between -90 and 90),
  lng         double precision not null check (lng between -180 and 180),
  radius_m    int not null default 300 check (radius_m in (200, 300, 500, 1000)),
  created_at  timestamptz not null default now()
);
create index if not exists privacy_zones_owner_idx on public.privacy_zones (owner_id);
alter table public.privacy_zones enable row level security;
drop policy if exists "owner manages zones" on public.privacy_zones;
create policy "owner manages zones" on public.privacy_zones for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
revoke all on public.privacy_zones from anon, authenticated;
grant select, insert, update, delete on public.privacy_zones to authenticated;

-- 1인 3곳까지 (사용자 권한으로 도는 트리거: 본인 행만 세요)
create or replace function public.privacy_zones_limit()
returns trigger language plpgsql as $$
begin
  new.owner_id := coalesce(auth.uid(), new.owner_id);
  if (select count(*) from public.privacy_zones where owner_id = new.owner_id) >= 3 then
    raise exception '가림 장소는 3곳까지 정할 수 있어요.';
  end if;
  return new;
end;
$$;
drop trigger if exists privacy_zones_limit on public.privacy_zones;
create trigger privacy_zones_limit before insert on public.privacy_zones
  for each row execute function public.privacy_zones_limit();

-- 자주 출발·도착한 곳 (약 100m 칸으로 묶어 3번 이상), 이미 가린 곳은 빼요
create or replace function public.suggest_privacy_zones()
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_out json;
begin
  if v_uid is null then
    return '[]'::json;
  end if;
  with pts as (
    select (path -> 0 ->> 0)::float8 as lat, (path -> 0 ->> 1)::float8 as lng from public.rides
     where owner_id = v_uid and jsonb_array_length(path) > 1
    union all
    select (path -> -1 ->> 0)::float8, (path -> -1 ->> 1)::float8 from public.rides
     where owner_id = v_uid and jsonb_array_length(path) > 1
  ), cells as (
    select round(lat::numeric, 3) as clat, round(lng::numeric, 3) as clng, count(*) as n, avg(lat) as alat, avg(lng) as alng
      from pts where lat is not null and lng is not null
     group by 1, 2
    having count(*) >= 3
  )
  select coalesce(json_agg(json_build_object('lat', alat, 'lng', alng, 'count', n) order by n desc), '[]'::json)
    into v_out
    from (
      select * from cells c
       where not exists (
         select 1 from public.privacy_zones z
          where z.owner_id = v_uid and public.distance_m(z.lat, z.lng, c.alat, c.alng) <= z.radius_m
       )
       order by n desc limit 3
    ) x;
  return v_out;
end;
$$;
revoke execute on function public.suggest_privacy_zones() from public, anon;
grant execute on function public.suggest_privacy_zones() to authenticated;

-- 2) 관리자 관심 구역 -----------------------------------------------------
create table if not exists public.admin_areas (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 40),
  note        text check (char_length(note) <= 200),
  lat         double precision not null check (lat between -90 and 90),
  lng         double precision not null check (lng between -180 and 180),
  radius_m    int not null default 1000 check (radius_m between 100 and 20000),
  created_at  timestamptz not null default now()
);
alter table public.admin_areas enable row level security;
drop policy if exists "admin manages areas" on public.admin_areas;
create policy "admin manages areas" on public.admin_areas for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
revoke all on public.admin_areas from anon, authenticated;
grant select, insert, update, delete on public.admin_areas to authenticated;

-- 구역별 숫자 (관리자만). 이동수단 위치는 따로 없어서 '이 구역에서 활동한 이동수단'으로 셉니다:
--   마지막으로 세운 곳이 구역 안이거나, 구역 안에서 출발한 라이딩이 있는 이동수단
create or replace function public.admin_area_stats()
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_out json;
begin
  if not public.is_admin() then
    raise exception '관리자만 볼 수 있어요.';
  end if;
  select coalesce(json_agg(json_build_object(
    'id', a.id, 'name', a.name, 'note', a.note, 'lat', a.lat, 'lng', a.lng, 'radius_m', a.radius_m, 'created_at', a.created_at,
    'active_vehicles', (
      select count(distinct vid) from (
        select p.vehicle_id as vid from public.parking_spots p
         where public.distance_m(a.lat, a.lng, p.lat, p.lng) <= a.radius_m
        union
        select r.vehicle_id from public.rides r
         where r.vehicle_id is not null and jsonb_array_length(r.path) > 0
           and public.distance_m(a.lat, a.lng, (r.path -> 0 ->> 0)::float8, (r.path -> 0 ->> 1)::float8) <= a.radius_m
      ) u
      join public.vehicles v on v.id = u.vid and v.deleted_at is null
    ),
    'rides_30d', (
      select count(*) from public.rides r
       where r.started_at > now() - interval '30 days' and jsonb_array_length(r.path) > 0
         and public.distance_m(a.lat, a.lng, (r.path -> 0 ->> 0)::float8, (r.path -> 0 ->> 1)::float8) <= a.radius_m
    ),
    'alerts_total', (select count(*) from public.theft_alerts t where t.status <> 'hidden' and public.distance_m(a.lat, a.lng, t.lat, t.lng) <= a.radius_m),
    'alerts_30d', (select count(*) from public.theft_alerts t where t.status <> 'hidden' and t.created_at > now() - interval '30 days' and public.distance_m(a.lat, a.lng, t.lat, t.lng) <= a.radius_m),
    'alerts_resolved', (select count(*) from public.theft_alerts t where t.status = 'resolved' and public.distance_m(a.lat, a.lng, t.lat, t.lng) <= a.radius_m),
    'lost_posts', (select count(*) from public.lost_posts l where l.deleted_at is null and l.lost_lat is not null and public.distance_m(a.lat, a.lng, l.lost_lat, l.lost_lng) <= a.radius_m),
    'lost_resolved', (select count(*) from public.lost_posts l where l.deleted_at is null and l.status = 'resolved' and l.lost_lat is not null and public.distance_m(a.lat, a.lng, l.lost_lat, l.lost_lng) <= a.radius_m),
    'finder_reports', (select count(*) from public.reports rp where rp.latitude is not null and public.distance_m(a.lat, a.lng, rp.latitude, rp.longitude) <= a.radius_m),
    'finder_reports_30d', (select count(*) from public.reports rp where rp.latitude is not null and rp.created_at > now() - interval '30 days' and public.distance_m(a.lat, a.lng, rp.latitude, rp.longitude) <= a.radius_m),
    'sticker_spots', (select count(*) from public.sticker_spots s where s.active and public.distance_m(a.lat, a.lng, s.lat, s.lng) <= a.radius_m)
  ) order by a.created_at), '[]'::json)
  into v_out
  from public.admin_areas a;
  return v_out;
end;
$$;
revoke execute on function public.admin_area_stats() from public, anon;
grant execute on function public.admin_area_stats() to authenticated;
