-- 035: 공공데이터 한 달마다 자동 갱신 · 자전거 사고 잦은 곳 최근 3년치 함께 보기
-- 1) 넣는 일은 안쪽 함수(_bike_spots_upsert, _bike_hazards_upsert)가 하고,
--    관리자 버튼(import_*)과 자동 갱신(cron_import_*)은 각자 확인만 한 뒤 안쪽 함수를 불러요.
--    자동 갱신은 로그인 대신 알림과 같은 비밀값(app_private.push_config.secret)으로 확인해요.
-- 2) 사고 잦은 곳: 최근 3년 자료를 남기고(그보다 오래된 것만 지움), 지도에는 3년치를 함께 보여 줘요.
-- 3) 예약 작업: 매달 2일 한국 시간 새벽 3시부터 몇 분 간격으로 사이트(/api/cron/public-data)를 불러요.
-- 여러 번 실행해도 안전해요.

-- 1) 안쪽 함수 --------------------------------------------------------------
create or replace function public._bike_spots_upsert(p_rows jsonb)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_n int;
begin
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
revoke execute on function public._bike_spots_upsert(jsonb) from public, anon, authenticated;

-- p_reset: 이 해 자료가 들어와 있으면, 이 해 기준 최근 3년보다 오래된 자료를 지워요
create or replace function public._bike_hazards_upsert(p_year int, p_rows jsonb, p_reset boolean)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_n int;
begin
  if p_year is null or p_year not between 2000 and 2100 then
    raise exception '연도를 확인해 주세요.';
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
    delete from public.bike_hazards where year < p_year - 2;
  end if;
  return v_n;
end;
$$;
revoke execute on function public._bike_hazards_upsert(int, jsonb, boolean) from public, anon, authenticated;

-- 관리자 버튼 (031과 이름·모양이 같아요)
create or replace function public.import_bike_spots(p_rows jsonb)
returns int
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_admin) then
    raise exception '관리자만 할 수 있어요.';
  end if;
  return public._bike_spots_upsert(p_rows);
end;
$$;
revoke execute on function public.import_bike_spots(jsonb) from public, anon, authenticated;
grant execute on function public.import_bike_spots(jsonb) to authenticated;

create or replace function public.import_bike_hazards(p_year int, p_rows jsonb, p_reset boolean default false)
returns int
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_admin) then
    raise exception '관리자만 할 수 있어요.';
  end if;
  return public._bike_hazards_upsert(p_year, p_rows, coalesce(p_reset, false));
end;
$$;
revoke execute on function public.import_bike_hazards(int, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.import_bike_hazards(int, jsonb, boolean) to authenticated;

-- 자동 갱신 (사이트 서버가 비밀값과 함께 불러요)
create or replace function public.cron_import_bike_spots(p_secret text, p_rows jsonb)
returns int
language plpgsql security definer set search_path = public as $$
begin
  if p_secret is null or not exists (select 1 from app_private.push_config where id = 1 and secret = p_secret) then
    raise exception 'unauthorized';
  end if;
  return public._bike_spots_upsert(p_rows);
end;
$$;
revoke execute on function public.cron_import_bike_spots(text, jsonb) from public, anon, authenticated;
grant execute on function public.cron_import_bike_spots(text, jsonb) to anon, authenticated;

create or replace function public.cron_import_bike_hazards(p_secret text, p_year int, p_rows jsonb, p_reset boolean)
returns int
language plpgsql security definer set search_path = public as $$
begin
  if p_secret is null or not exists (select 1 from app_private.push_config where id = 1 and secret = p_secret) then
    raise exception 'unauthorized';
  end if;
  return public._bike_hazards_upsert(p_year, p_rows, coalesce(p_reset, false));
end;
$$;
revoke execute on function public.cron_import_bike_hazards(text, int, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.cron_import_bike_hazards(text, int, jsonb, boolean) to anon, authenticated;

-- 2) 지도 범위 안의 사고 잦은 곳: 가장 최근 해부터 3년치 (최대 600곳, 화면에서 같은 곳끼리 묶어요)
create or replace function public.bike_hazards_in_box(p_min_lat double precision, p_min_lng double precision, p_max_lat double precision, p_max_lng double precision)
returns json
language sql stable security definer set search_path = public as $body$
  select coalesce(json_agg(json_build_object(
           'id', h.spot_cd || '-' || h.year, 'year', h.year, 'name', h.name, 'lat', h.lat, 'lng', h.lng, 'radius_m', h.radius_m,
           'accidents', h.accidents, 'casualties', h.casualties, 'deaths', h.deaths, 'serious', h.serious) order by h.year desc, h.accidents desc), '[]'::json)
    from (select b.* from public.bike_hazards b
           where b.year >= (select max(m.year) from public.bike_hazards m) - 2
             and b.lat between p_min_lat and p_max_lat and b.lng between p_min_lng and p_max_lng
             and (p_max_lat - p_min_lat) <= 1.5 and (p_max_lng - p_min_lng) <= 1.5
           order by b.year desc, b.accidents desc limit 600) h;
$body$;
revoke execute on function public.bike_hazards_in_box(double precision, double precision, double precision, double precision) from public, anon, authenticated;
grant execute on function public.bike_hazards_in_box(double precision, double precision, double precision, double precision) to anon, authenticated;

-- 관리자 개수: 몇 해 자료가 있는지도
create or replace function public.admin_bike_hazard_counts()
returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_admin) then
    raise exception '관리자만 볼 수 있어요.';
  end if;
  return (select json_build_object('count', count(*), 'year', max(year), 'first_year', min(year), 'last_import', max(updated_at)) from public.bike_hazards);
end;
$$;
revoke execute on function public.admin_bike_hazard_counts() from public, anon, authenticated;
grant execute on function public.admin_bike_hazard_counts() to authenticated;

-- 3) 예약 작업 -------------------------------------------------------------
-- 사이트 주소는 알림 설정(push_config.url)의 /api/push 를 /api/cron/public-data 로 바꿔서 써요.
create or replace function public.run_public_data_refresh(p_query text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_cfg record;
begin
  select c.secret, c.url into v_cfg from app_private.push_config c where c.id = 1;
  if v_cfg.url is null then
    raise notice 'run_public_data_refresh: app_private.push_config 가 비어 있어요.';
    return;
  end if;
  perform net.http_post(
    url := replace(v_cfg.url, '/api/push', '/api/cron/public-data') || '?' || p_query,
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_cfg.secret),
    timeout_milliseconds := 60000
  );
end;
$$;
revoke execute on function public.run_public_data_refresh(text) from public, anon, authenticated;

-- 매달 1일 18:00 UTC(= 2일 새벽 3시, 한국 시간)부터: 보관소 6묶음(5분 간격) → 사고 잦은 곳 3년(오래된 해부터, 10분 간격)
do $$
declare
  j record;
begin
  for j in select * from (values
    ('b-lock-data-spots-1', '0 18 1 * *', 'job=spots&page=1'),
    ('b-lock-data-spots-2', '5 18 1 * *', 'job=spots&page=41'),
    ('b-lock-data-spots-3', '10 18 1 * *', 'job=spots&page=81'),
    ('b-lock-data-spots-4', '15 18 1 * *', 'job=spots&page=121'),
    ('b-lock-data-spots-5', '20 18 1 * *', 'job=spots&page=161'),
    ('b-lock-data-spots-6', '25 18 1 * *', 'job=spots&page=201'),
    ('b-lock-data-hazards-2', '35 18 1 * *', 'job=hazards&offset=2'),
    ('b-lock-data-hazards-1', '45 18 1 * *', 'job=hazards&offset=1'),
    ('b-lock-data-hazards-0', '55 18 1 * *', 'job=hazards&offset=0')
  ) as t(name, sched, q) loop
    if exists (select 1 from cron.job where jobname = j.name) then
      perform cron.unschedule(j.name);
    end if;
    perform cron.schedule(j.name, j.sched, format('select public.run_public_data_refresh(%L)', j.q));
  end loop;
end;
$$;
