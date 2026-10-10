-- 031: MY 프로필 사진 · 자전거 보관소/공기주입기 지도
-- 1) profiles.avatar_path + update_my_profile(): MY에서 사진·닉네임을 한 번에 바꾸기
-- 2) bike_spots: 공공데이터(행정안전부 자전거보관소정보)와 회원이 알려 준 공기주입기
--    nearby_bike_spots(): 근처 장소 (로그인 없이도 보기)
--    add_bike_spot(): 회원이 공기주입기 알려 주기 (하루 10곳)
--    rate_bike_spot(): '공기 잘 들어가요 / 고장났어요 / 없어졌어요' (한 사람이 한 곳에 하루 1번)
--    import_bike_spots(): 관리자만, 공공데이터를 100개씩 넣기
--    admin_set_bike_spot_hidden(): 관리자만, 틀린 장소 숨기기
-- 3) bike_hazards: 도로교통공단 자전거사고 다발지역 (지도 표시·길 안내 경고)
--    bike_hazards_in_box(), import_bike_hazards() (관리자만)
-- 여러 번 실행해도 안전해요.

-- 1) 프로필 사진 -----------------------------------------------------------
-- 사진은 vehicle-images 버킷의 내 폴더({사용자ID}/avatar-....jpg)에 올려요. (탈퇴하면 폴더째 지워져요)
alter table public.profiles add column if not exists avatar_path text check (char_length(avatar_path) <= 200);

-- 닉네임·사진을 함께 저장. 사진은 내 폴더의 파일만 가리킬 수 있어요.
-- p_avatar_path: null이면 사진 그대로, ''이면 사진 지우기
create or replace function public.update_my_profile(p_nickname text, p_avatar_path text default null)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(coalesce(p_nickname, ''));
  v_old text;
  v_new text;
begin
  if v_uid is null then
    raise exception '로그인이 필요해요.';
  end if;
  if char_length(v_name) < 1 or char_length(v_name) > 20 then
    raise exception '닉네임은 1~20자로 정해 주세요.';
  end if;
  select avatar_path into v_old from public.profiles where id = v_uid;
  v_new := case when p_avatar_path is null then v_old when p_avatar_path = '' then null else p_avatar_path end;
  if v_new is not null and v_new is distinct from v_old
     and (split_part(v_new, '/', 1) <> v_uid::text or v_new !~ '^[0-9a-f-]{36}/avatar-[A-Za-z0-9-]{1,60}\.jpg$') then
    raise exception '사진 주소가 올바르지 않아요.';
  end if;

  update public.profiles set nickname = v_name, avatar_path = v_new where id = v_uid;
  -- 글·댓글에 저장해 둔 이름도 맞춰요 (바뀐 경우만)
  update public.lost_posts set author_name = v_name where author_id = v_uid and author_name is distinct from v_name;
  update public.post_comments set author_name = v_name where author_id = v_uid and author_name is distinct from v_name;
  return json_build_object('nickname', v_name, 'avatar_path', v_new, 'old_avatar_path', case when v_old is distinct from v_new then v_old end);
end;
$$;
revoke execute on function public.update_my_profile(text, text) from public, anon, authenticated;
grant execute on function public.update_my_profile(text, text) to authenticated;

-- 2) 자전거 보관소 · 공기주입기 ----------------------------------------------
create table if not exists public.bike_spots (
  id             uuid primary key default gen_random_uuid(),
  source         text not null check (source in ('public', 'user')),
  -- 공공데이터 관리번호 (같은 장소를 다시 불러오면 덮어써요)
  public_id      text unique check (char_length(public_id) <= 80),
  name           text not null check (char_length(name) between 1 and 80),
  road_addr      text check (char_length(road_addr) <= 200),
  lot_addr       text check (char_length(lot_addr) <= 200),
  lat            double precision not null check (lat between 33 and 39),
  lng            double precision not null check (lng between 124 and 132),
  -- 보관소 정보 (공공데이터)
  is_parking     boolean not null default false,
  racks          int check (racks between 0 and 100000),
  install_year   int check (install_year between 1950 and 2100),
  install_shape  text check (char_length(install_shape) <= 40),
  has_shade      boolean,
  has_pump       boolean not null default false,
  pump_type      text check (char_length(pump_type) <= 40),
  has_repair     boolean,
  mgr_name       text check (char_length(mgr_name) <= 80),
  mgr_tel        text check (char_length(mgr_tel) <= 40),
  data_date      date,
  -- 회원이 알려 준 곳
  note           text check (char_length(note) <= 200),
  created_by     uuid references auth.users (id) on delete set null,
  -- 회원 확인 (최근 표시)
  ok_count       int not null default 0,
  broken_count   int not null default 0,
  gone_count     int not null default 0,
  last_ok_at     timestamptz,
  last_broken_at timestamptz,
  hidden         boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists bike_spots_geo_idx on public.bike_spots (lat, lng) where not hidden;
alter table public.bike_spots enable row level security;
drop policy if exists "anyone reads visible spots" on public.bike_spots;
create policy "anyone reads visible spots" on public.bike_spots for select to anon, authenticated using (not hidden);
revoke all on public.bike_spots from anon, authenticated;
grant select on public.bike_spots to anon, authenticated;

create table if not exists public.bike_spot_ratings (
  spot_id    uuid not null references public.bike_spots (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  kind       text not null check (kind in ('ok', 'broken', 'gone')),
  day        date not null default (now() at time zone 'Asia/Seoul')::date,
  created_at timestamptz not null default now(),
  primary key (spot_id, user_id, day)
);
alter table public.bike_spot_ratings enable row level security;
revoke all on public.bike_spot_ratings from anon, authenticated;

-- 근처 장소: 가까운 순 최대 300곳. p_kind: 'pump'(공기주입기) | 'parking'(보관소) | 'repair'(수리대) | 'all'
create or replace function public.nearby_bike_spots(p_lat double precision, p_lng double precision, p_radius_m int default 3000, p_kind text default 'all')
returns json
language plpgsql stable security definer set search_path = public as $$
declare
  v_r int := least(greatest(coalesce(p_radius_m, 3000), 100), 20000);
  v_dlat double precision := v_r / 111320.0;
  v_dlng double precision := v_r / (111320.0 * greatest(cos(radians(p_lat)), 0.2));
  v_out json;
begin
  if p_lat is null or p_lng is null then
    return '[]'::json;
  end if;
  with c as (
    select s.*, 2 * 6371008.8 * asin(least(1, sqrt(
             power(sin(radians(s.lat - p_lat) / 2), 2)
             + cos(radians(p_lat)) * cos(radians(s.lat)) * power(sin(radians(s.lng - p_lng) / 2), 2)))) as dist
      from public.bike_spots s
     where not s.hidden
       and s.lat between p_lat - v_dlat and p_lat + v_dlat
       and s.lng between p_lng - v_dlng and p_lng + v_dlng
       and case coalesce(p_kind, 'all')
             when 'pump' then s.has_pump
             when 'parking' then s.is_parking
             when 'repair' then coalesce(s.has_repair, false)
             else true end
  )
  select coalesce(json_agg(json_build_object(
           'id', id, 'source', source, 'name', name, 'road_addr', road_addr, 'lot_addr', lot_addr,
           'lat', lat, 'lng', lng, 'dist', round(dist),
           'is_parking', is_parking, 'racks', racks, 'install_year', install_year, 'install_shape', install_shape,
           'has_shade', has_shade, 'has_pump', has_pump, 'pump_type', pump_type, 'has_repair', has_repair,
           'mgr_name', mgr_name, 'mgr_tel', mgr_tel, 'data_date', data_date, 'note', note,
           'ok_count', ok_count, 'broken_count', broken_count, 'gone_count', gone_count,
           'last_ok_at', last_ok_at, 'last_broken_at', last_broken_at) order by dist), '[]'::json)
    into v_out
    from (select * from c where dist <= v_r order by dist limit 300) t;
  return v_out;
end;
$$;
revoke execute on function public.nearby_bike_spots(double precision, double precision, int, text) from public, anon, authenticated;
grant execute on function public.nearby_bike_spots(double precision, double precision, int, text) to anon, authenticated;

-- 회원이 공기주입기 알려 주기 (하루 10곳, 이용 제한 중이면 안 돼요)
create or replace function public.add_bike_spot(p_name text, p_lat double precision, p_lng double precision, p_note text default null, p_repair boolean default false)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_id uuid;
begin
  if v_uid is null then
    raise exception '로그인이 필요해요.';
  end if;
  if exists (select 1 from public.profiles where id = v_uid and suspended_at is not null and (suspended_until is null or suspended_until > now())) then
    raise exception '지금은 이용이 제한되어 있어요.';
  end if;
  if char_length(v_name) < 1 or char_length(v_name) > 80 then
    raise exception '장소 이름을 1~80자로 적어 주세요.';
  end if;
  if char_length(v_note) > 200 then
    raise exception '설명은 200자까지 쓸 수 있어요.';
  end if;
  if p_lat is null or p_lng is null or p_lat not between 33 and 39 or p_lng not between 124 and 132 then
    raise exception '국내 위치를 골라 주세요.';
  end if;
  if (select count(*) from public.bike_spots where created_by = v_uid and created_at > now() - interval '1 day') >= 10 then
    raise exception '하루에 10곳까지 알려 줄 수 있어요.';
  end if;
  insert into public.bike_spots (source, name, lat, lng, has_pump, has_repair, note, created_by, ok_count, last_ok_at)
  values ('user', v_name, p_lat, p_lng, true, coalesce(p_repair, false), v_note, v_uid, 1, now())
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.add_bike_spot(text, double precision, double precision, text, boolean) from public, anon, authenticated;
grant execute on function public.add_bike_spot(text, double precision, double precision, text, boolean) to authenticated;

-- 확인 남기기. 회원이 알려 준 곳이 '없어졌어요' 3번 이상이면 자동으로 숨겨요.
create or replace function public.rate_bike_spot(p_spot uuid, p_kind text)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_row public.bike_spots;
begin
  if v_uid is null then
    raise exception '로그인이 필요해요.';
  end if;
  if p_kind not in ('ok', 'broken', 'gone') then
    raise exception '알 수 없는 확인이에요.';
  end if;
  insert into public.bike_spot_ratings (spot_id, user_id, kind) values (p_spot, v_uid, p_kind)
  on conflict (spot_id, user_id, day) do nothing;
  if not found then
    raise exception '오늘은 이미 이 장소를 확인해 주셨어요.';
  end if;
  update public.bike_spots set
    ok_count = ok_count + (p_kind = 'ok')::int,
    broken_count = broken_count + (p_kind = 'broken')::int,
    gone_count = gone_count + (p_kind = 'gone')::int,
    last_ok_at = case when p_kind = 'ok' then now() else last_ok_at end,
    last_broken_at = case when p_kind = 'broken' then now() else last_broken_at end,
    hidden = hidden or (source = 'user' and p_kind = 'gone' and gone_count + 1 >= 3),
    updated_at = now()
  where id = p_spot and not hidden
  returning * into v_row;
  if v_row.id is null then
    raise exception '장소를 찾지 못했어요.';
  end if;
  return json_build_object('ok_count', v_row.ok_count, 'broken_count', v_row.broken_count, 'gone_count', v_row.gone_count,
                           'last_ok_at', v_row.last_ok_at, 'last_broken_at', v_row.last_broken_at, 'hidden', v_row.hidden);
end;
$$;
revoke execute on function public.rate_bike_spot(uuid, text) from public, anon, authenticated;
grant execute on function public.rate_bike_spot(uuid, text) to authenticated;

-- 관리자: 공공데이터 넣기 (한 번에 최대 500개, 같은 관리번호는 덮어쓰기). 넣은 개수를 돌려줘요.
create or replace function public.import_bike_spots(p_rows jsonb)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_n int;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_admin) then
    raise exception '관리자만 할 수 있어요.';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 500 then
    raise exception '한 번에 500개까지 넣을 수 있어요.';
  end if;
  insert into public.bike_spots (source, public_id, name, road_addr, lot_addr, lat, lng, is_parking, racks, install_year,
                                 install_shape, has_shade, has_pump, pump_type, has_repair, mgr_name, mgr_tel, data_date)
  select 'public', r.public_id, left(r.name, 80), left(r.road_addr, 200), left(r.lot_addr, 200), r.lat, r.lng, true,
         r.racks, r.install_year, left(r.install_shape, 40), r.has_shade, coalesce(r.has_pump, false), left(r.pump_type, 40),
         r.has_repair, left(r.mgr_name, 80), left(r.mgr_tel, 40), r.data_date
    from jsonb_to_recordset(p_rows) as r(public_id text, name text, road_addr text, lot_addr text, lat double precision, lng double precision,
                                         racks int, install_year int, install_shape text, has_shade boolean, has_pump boolean,
                                         pump_type text, has_repair boolean, mgr_name text, mgr_tel text, data_date date)
   where r.public_id is not null and char_length(r.public_id) <= 80
     and coalesce(btrim(r.name), '') <> ''
     and r.lat between 33 and 39 and r.lng between 124 and 132
     and (r.racks is null or r.racks between 0 and 100000)
     and (r.install_year is null or r.install_year between 1950 and 2100)
  on conflict (public_id) do update set
    name = excluded.name, road_addr = excluded.road_addr, lot_addr = excluded.lot_addr, lat = excluded.lat, lng = excluded.lng,
    racks = excluded.racks, install_year = excluded.install_year, install_shape = excluded.install_shape, has_shade = excluded.has_shade,
    has_pump = excluded.has_pump, pump_type = excluded.pump_type, has_repair = excluded.has_repair, mgr_name = excluded.mgr_name,
    mgr_tel = excluded.mgr_tel, data_date = excluded.data_date, updated_at = now();
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke execute on function public.import_bike_spots(jsonb) from public, anon, authenticated;
grant execute on function public.import_bike_spots(jsonb) to authenticated;

-- 관리자: 숨기기·다시 보이기 + 개수
create or replace function public.admin_set_bike_spot_hidden(p_spot uuid, p_hidden boolean)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_admin) then
    raise exception '관리자만 할 수 있어요.';
  end if;
  update public.bike_spots set hidden = coalesce(p_hidden, true), updated_at = now() where id = p_spot;
end;
$$;
revoke execute on function public.admin_set_bike_spot_hidden(uuid, boolean) from public, anon, authenticated;
grant execute on function public.admin_set_bike_spot_hidden(uuid, boolean) to authenticated;

create or replace function public.admin_bike_spot_counts()
returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_admin) then
    raise exception '관리자만 볼 수 있어요.';
  end if;
  return (select json_build_object(
    'public', count(*) filter (where source = 'public'),
    'public_pump', count(*) filter (where source = 'public' and has_pump),
    'user', count(*) filter (where source = 'user' and not hidden),
    'hidden', count(*) filter (where hidden),
    'broken', count(*) filter (where not hidden and last_broken_at is not null and (last_ok_at is null or last_broken_at > last_ok_at)),
    'last_import', max(updated_at) filter (where source = 'public'))
    from public.bike_spots);
end;
$$;
revoke execute on function public.admin_bike_spot_counts() from public, anon, authenticated;
grant execute on function public.admin_bike_spot_counts() to authenticated;

-- 3) 자전거 사고 잦은 곳 (도로교통공단 자전거사고 다발지역, data.go.kr) ---------------
--    지도에 주황 원으로 보여 주고, 길 안내 중 가까워지면 미리 알려 줘요.
create table if not exists public.bike_hazards (
  spot_cd      text not null check (char_length(spot_cd) <= 40),
  year         int not null check (year between 2000 and 2100),
  name         text not null check (char_length(name) <= 200),
  area_name    text check (char_length(area_name) <= 60),
  lat          double precision not null check (lat between 33 and 39),
  lng          double precision not null check (lng between 124 and 132),
  radius_m     int not null default 100 check (radius_m between 10 and 1000),
  accidents    int not null default 0,
  casualties   int not null default 0,
  deaths       int not null default 0,
  serious      int not null default 0,
  minor        int not null default 0,
  injured      int not null default 0,
  updated_at   timestamptz not null default now(),
  primary key (spot_cd, year)
);
create index if not exists bike_hazards_geo_idx on public.bike_hazards (lat, lng);
alter table public.bike_hazards enable row level security;
drop policy if exists "anyone reads hazards" on public.bike_hazards;
create policy "anyone reads hazards" on public.bike_hazards for select to anon, authenticated using (true);
revoke all on public.bike_hazards from anon, authenticated;
grant select on public.bike_hazards to anon, authenticated;

-- 지도 범위 안의 사고 잦은 곳 (가장 최근 해 자료만, 최대 300곳)
create or replace function public.bike_hazards_in_box(p_min_lat double precision, p_min_lng double precision, p_max_lat double precision, p_max_lng double precision)
returns json
language sql stable security definer set search_path = public as $$
  with y as (select max(year) as year from public.bike_hazards)
  select coalesce(json_agg(json_build_object(
           'id', h.spot_cd, 'year', h.year, 'name', h.name, 'lat', h.lat, 'lng', h.lng, 'radius_m', h.radius_m,
           'accidents', h.accidents, 'casualties', h.casualties, 'deaths', h.deaths, 'serious', h.serious) order by h.accidents desc), '[]'::json)
    from (select * from public.bike_hazards, y
           where bike_hazards.year = y.year
             and lat between p_min_lat and p_max_lat and lng between p_min_lng and p_max_lng
             and (p_max_lat - p_min_lat) <= 1.5 and (p_max_lng - p_min_lng) <= 1.5
           order by accidents desc limit 300) h;
$$;
revoke execute on function public.bike_hazards_in_box(double precision, double precision, double precision, double precision) from public, anon, authenticated;
grant execute on function public.bike_hazards_in_box(double precision, double precision, double precision, double precision) to anon, authenticated;

-- 관리자: 사고 잦은 곳 넣기. p_reset(마지막 묶음)이면, 그 해 자료가 있을 때만 다른 해 자료를 지워요.
create or replace function public.import_bike_hazards(p_year int, p_rows jsonb, p_reset boolean default false)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_n int;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_admin) then
    raise exception '관리자만 할 수 있어요.';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 2000 then
    raise exception '한 번에 2000개까지 넣을 수 있어요.';
  end if;
  insert into public.bike_hazards (spot_cd, year, name, area_name, lat, lng, radius_m, accidents, casualties, deaths, serious, minor, injured)
  select r.spot_cd, p_year, left(r.name, 200), left(r.area_name, 60), r.lat, r.lng, least(greatest(coalesce(r.radius_m, 100), 10), 1000),
         coalesce(r.accidents, 0), coalesce(r.casualties, 0), coalesce(r.deaths, 0), coalesce(r.serious, 0), coalesce(r.minor, 0), coalesce(r.injured, 0)
    from jsonb_to_recordset(p_rows) as r(spot_cd text, name text, area_name text, lat double precision, lng double precision, radius_m int,
                                         accidents int, casualties int, deaths int, serious int, minor int, injured int)
   where r.spot_cd is not null and char_length(r.spot_cd) <= 40 and coalesce(btrim(r.name), '') <> ''
     and r.lat between 33 and 39 and r.lng between 124 and 132
  on conflict (spot_cd, year) do update set
    name = excluded.name, area_name = excluded.area_name, lat = excluded.lat, lng = excluded.lng, radius_m = excluded.radius_m,
    accidents = excluded.accidents, casualties = excluded.casualties, deaths = excluded.deaths, serious = excluded.serious,
    minor = excluded.minor, injured = excluded.injured, updated_at = now();
  get diagnostics v_n = row_count;
  if p_reset and exists (select 1 from public.bike_hazards where year = p_year) then
    delete from public.bike_hazards where year <> p_year;
  end if;
  return v_n;
end;
$;
revoke execute on function public.import_bike_hazards(int, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.import_bike_hazards(int, jsonb, boolean) to authenticated;

-- 관리자 개수에 사고 잦은 곳도 함께
create or replace function public.admin_bike_hazard_counts()
returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_admin) then
    raise exception '관리자만 볼 수 있어요.';
  end if;
  return (select json_build_object('count', count(*), 'year', max(year), 'last_import', max(updated_at)) from public.bike_hazards);
end;
$$;
revoke execute on function public.admin_bike_hazard_counts() from public, anon, authenticated;
grant execute on function public.admin_bike_hazard_counts() to authenticated;
