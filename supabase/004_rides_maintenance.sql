-- =====================================================================
-- B-LOCK 4차: 라이딩 기록 · 소모품 수명주기 · 정비 다이어리
-- schema.sql → 002 → 003 다음에 실행하세요. (여러 번 실행해도 안전)
--   - 라이딩을 마치면 거리·시간·경로를 저장하고, 탄 이동수단의 누적 거리와 소모품 거리에 자동으로 더함
--   - 소모품(타이어 공기압·체인 윤활·브레이크 패드·체인·타이어)은 이동수단마다 기본 주기로 자동 생성
--   - 정비 완료하면 그 소모품 거리를 0으로 되돌리고 날짜·비용·정비소·메모를 이력으로 남김
--   - 모두 주인만 볼 수 있음 (RLS)
-- =====================================================================

-- 1) 이동수단 누적 주행거리 (미터)
alter table public.vehicles add column if not exists odometer_m double precision not null default 0;

-- 2) 라이딩 기록 -----------------------------------------------------------
create table if not exists public.rides (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users (id) on delete cascade default auth.uid(),
  vehicle_id    uuid references public.vehicles (id) on delete set null,
  started_at    timestamptz not null,
  ended_at      timestamptz not null,
  moving_sec    integer not null check (moving_sec >= 0),          -- 실제로 움직인 시간
  elapsed_sec   integer not null check (elapsed_sec >= 0),         -- 일시정지를 뺀 전체 시간
  distance_m    double precision not null check (distance_m between 0 and 500000),
  max_speed_kmh real check (max_speed_kmh between 0 and 120),
  path          jsonb not null default '[]'::jsonb,                 -- [[위도, 경도], ...] (줄인 경로)
  created_at    timestamptz not null default now(),
  check (ended_at > started_at)
);
create index if not exists rides_owner_idx on public.rides (owner_id, started_at desc);
create index if not exists rides_vehicle_idx on public.rides (vehicle_id, started_at desc);

-- 3) 소모품 ---------------------------------------------------------------
create table if not exists public.vehicle_parts (
  id                uuid primary key default gen_random_uuid(),
  vehicle_id        uuid not null references public.vehicles (id) on delete cascade,
  owner_id          uuid not null references auth.users (id) on delete cascade,
  kind              text not null check (kind in ('tire_pressure', 'chain_lube', 'brake_pad', 'chain', 'tire')),
  interval_km       double precision check (interval_km is null or interval_km between 1 and 100000),
  interval_days     integer check (interval_days is null or interval_days between 1 and 3650),
  distance_m        double precision not null default 0,            -- 마지막 정비 뒤로 달린 거리
  last_serviced_at  timestamptz not null default now(),
  enabled           boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (vehicle_id, kind),
  check (interval_km is not null or interval_days is not null)
);
create index if not exists vehicle_parts_owner_idx on public.vehicle_parts (owner_id);

-- 실제 라이더 기준 기본 주기. 킥보드에는 체인이 없어서 체인 항목을 만들지 않아요.
create or replace function public.seed_vehicle_parts(p_vehicle uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
begin
  select id, owner_id, type into v from public.vehicles where id = p_vehicle;
  if v.id is null then
    return;
  end if;
  insert into public.vehicle_parts (vehicle_id, owner_id, kind, interval_km, interval_days)
  select v.id, v.owner_id, d.kind, d.km, d.days
  from (values
    ('tire_pressure', null::double precision, 14),
    ('chain_lube', 250, null::integer),
    ('brake_pad', 2000, null),
    ('chain', 3500, null),
    ('tire', 3500, null)
  ) as d(kind, km, days)
  where v.type <> 'kickboard' or d.kind not in ('chain_lube', 'chain')
  on conflict (vehicle_id, kind) do nothing;
end;
$$;
revoke all on function public.seed_vehicle_parts(uuid) from public;

create or replace function public.vehicles_seed_parts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.seed_vehicle_parts(new.id);
  return new;
end;
$$;
drop trigger if exists vehicles_seed_parts on public.vehicles;
create trigger vehicles_seed_parts after insert on public.vehicles
  for each row execute function public.vehicles_seed_parts();

-- 이미 등록된 이동수단에도 기본 소모품 만들기
do $$
declare
  r record;
begin
  for r in select id from public.vehicles loop
    perform public.seed_vehicle_parts(r.id);
  end loop;
end;
$$;

-- 사용자가 직접 바꿀 수 있는 건 주기와 사용 여부뿐 (거리·정비일은 함수로만 바뀜)
create or replace function public.vehicle_parts_guard()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.vehicle_id := old.vehicle_id;
    new.owner_id := old.owner_id;
    new.kind := old.kind;
    new.distance_m := old.distance_m;
    new.last_serviced_at := old.last_serviced_at;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists vehicle_parts_guard on public.vehicle_parts;
create trigger vehicle_parts_guard before update on public.vehicle_parts
  for each row execute function public.vehicle_parts_guard();

-- 4) 정비 다이어리 ----------------------------------------------------------
create table if not exists public.maintenance_logs (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users (id) on delete cascade default auth.uid(),
  vehicle_id    uuid not null references public.vehicles (id) on delete cascade,
  part_id       uuid references public.vehicle_parts (id) on delete set null,
  kind          text not null,
  serviced_on   date not null,
  cost          integer check (cost between 0 and 100000000),       -- 원
  shop          text check (char_length(shop) <= 60),
  memo          text check (char_length(memo) <= 500),
  distance_m    double precision not null default 0,                 -- 정비 직전까지 달린 거리
  created_at    timestamptz not null default now()
);
create index if not exists maintenance_logs_vehicle_idx on public.maintenance_logs (vehicle_id, serviced_on desc, created_at desc);

-- 5) 권한 -----------------------------------------------------------------
alter table public.rides enable row level security;
alter table public.vehicle_parts enable row level security;
alter table public.maintenance_logs enable row level security;

drop policy if exists "owner reads rides" on public.rides;
create policy "owner reads rides" on public.rides for select to authenticated using (owner_id = auth.uid());

drop policy if exists "owner reads parts" on public.vehicle_parts;
create policy "owner reads parts" on public.vehicle_parts for select to authenticated using (owner_id = auth.uid());
drop policy if exists "owner updates parts" on public.vehicle_parts;
create policy "owner updates parts" on public.vehicle_parts for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "owner reads logs" on public.maintenance_logs;
create policy "owner reads logs" on public.maintenance_logs for select to authenticated using (owner_id = auth.uid());
drop policy if exists "owner deletes logs" on public.maintenance_logs;
create policy "owner deletes logs" on public.maintenance_logs for delete to authenticated using (owner_id = auth.uid());

grant select on public.rides to authenticated;
grant select, update on public.vehicle_parts to authenticated;
grant select, delete on public.maintenance_logs to authenticated;

-- 6) 라이딩 저장: 기록 + 이동수단 누적거리 + 소모품 거리 한 번에 -----------------
create or replace function public.complete_ride(
  p_vehicle uuid,
  p_started_at timestamptz,
  p_ended_at timestamptz,
  p_moving_sec integer,
  p_elapsed_sec integer,
  p_distance_m double precision,
  p_max_speed_kmh real,
  p_path jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요해요.';
  end if;
  if not exists (select 1 from public.vehicles where id = p_vehicle and owner_id = auth.uid() and deleted_at is null) then
    raise exception '내 이동수단에만 기록할 수 있어요.';
  end if;
  if p_ended_at <= p_started_at or p_ended_at > now() + interval '5 minutes' or p_started_at < now() - interval '2 days' then
    raise exception '라이딩 시간이 올바르지 않아요.';
  end if;
  if p_elapsed_sec < 0 or p_moving_sec < 0 or p_moving_sec > p_elapsed_sec + 5
     or p_elapsed_sec > extract(epoch from (p_ended_at - p_started_at)) + 60 then
    raise exception '라이딩 시간이 올바르지 않아요.';
  end if;
  if p_distance_m < 0 or p_distance_m > 500000 then
    raise exception '주행 거리가 올바르지 않아요.';
  end if;
  -- 평균 시속 70km를 넘으면 GPS 오류로 보고 저장하지 않아요.
  if p_distance_m > 50 and (p_moving_sec = 0 or p_distance_m / p_moving_sec * 3.6 > 70) then
    raise exception '주행 기록이 비정상적이에요. GPS 상태를 확인해 주세요.';
  end if;
  if jsonb_typeof(coalesce(p_path, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_path, '[]'::jsonb)) > 5000 then
    raise exception '경로가 너무 길어요.';
  end if;
  if (select count(*) from public.rides where owner_id = auth.uid() and created_at > now() - interval '1 hour') >= 20 then
    raise exception '잠시 후 다시 시도해 주세요.';
  end if;

  insert into public.rides (owner_id, vehicle_id, started_at, ended_at, moving_sec, elapsed_sec, distance_m, max_speed_kmh, path)
  values (auth.uid(), p_vehicle, p_started_at, p_ended_at, p_moving_sec, p_elapsed_sec, p_distance_m,
          least(greatest(coalesce(p_max_speed_kmh, 0), 0), 120), coalesce(p_path, '[]'::jsonb))
  returning id into v_id;

  update public.vehicles set odometer_m = odometer_m + p_distance_m where id = p_vehicle;
  update public.vehicle_parts set distance_m = distance_m + p_distance_m, updated_at = now() where vehicle_id = p_vehicle;
  return v_id;
end;
$$;

-- 라이딩 삭제: 그 거리만큼 누적거리와 (그 라이딩 뒤로 정비하지 않은) 소모품 거리에서 뺌
create or replace function public.delete_ride(p_ride uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  select * into r from public.rides where id = p_ride and owner_id = auth.uid();
  if r.id is null then
    raise exception '삭제할 수 없는 기록이에요.';
  end if;
  if r.vehicle_id is not null then
    update public.vehicles set odometer_m = greatest(odometer_m - r.distance_m, 0) where id = r.vehicle_id;
    update public.vehicle_parts
       set distance_m = greatest(distance_m - r.distance_m, 0), updated_at = now()
     where vehicle_id = r.vehicle_id and last_serviced_at <= r.started_at;
  end if;
  delete from public.rides where id = p_ride;
end;
$$;

-- 7) 정비 완료: 이력 남기고 그 소모품 거리를 0으로 ----------------------------
create or replace function public.service_part(
  p_part uuid,
  p_serviced_on date,
  p_cost integer default null,
  p_shop text default null,
  p_memo text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  p record;
  v_id uuid;
  v_today date := (now() at time zone 'Asia/Seoul')::date;
begin
  select * into p from public.vehicle_parts where id = p_part and owner_id = auth.uid();
  if p.id is null then
    raise exception '내 소모품만 정비 기록을 남길 수 있어요.';
  end if;
  if p_serviced_on is null or p_serviced_on > v_today or p_serviced_on < date '2000-01-01' then
    raise exception '정비한 날짜를 확인해 주세요.';
  end if;
  if p_cost is not null and (p_cost < 0 or p_cost > 100000000) then
    raise exception '비용을 확인해 주세요.';
  end if;

  insert into public.maintenance_logs (owner_id, vehicle_id, part_id, kind, serviced_on, cost, shop, memo, distance_m)
  values (auth.uid(), p.vehicle_id, p.id, p.kind, p_serviced_on, p_cost,
          nullif(left(btrim(coalesce(p_shop, '')), 60), ''), nullif(left(btrim(coalesce(p_memo, '')), 500), ''), p.distance_m)
  returning id into v_id;

  -- 오늘 정비면 지금 시각, 지난 날짜면 그날 0시(한국 시간)부터 다시 셉니다.
  update public.vehicle_parts
     set distance_m = 0,
         last_serviced_at = case when p_serviced_on = v_today then now()
                                 else (p_serviced_on::timestamp at time zone 'Asia/Seoul') end,
         updated_at = now()
   where id = p.id;
  return v_id;
end;
$$;

revoke all on function public.complete_ride(uuid, timestamptz, timestamptz, integer, integer, double precision, real, jsonb) from public;
revoke all on function public.delete_ride(uuid) from public;
revoke all on function public.service_part(uuid, date, integer, text, text) from public;
grant execute on function public.complete_ride(uuid, timestamptz, timestamptz, integer, integer, double precision, real, jsonb) to authenticated;
grant execute on function public.delete_ride(uuid) to authenticated;
grant execute on function public.service_part(uuid, date, integer, text, text) to authenticated;
