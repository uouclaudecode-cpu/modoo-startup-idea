-- =====================================================================
-- B-LOCK 5차: 코드 검토에서 찾은 문제 고치기 (004 다음에 실행, 여러 번 실행해도 안전)
--   1) 같은 라이딩을 두 번 저장해도(응답이 끊겨 다시 누른 경우) 한 번만 반영
--   2) 라이딩 저장·삭제가 소모품에 같은 기준(마지막 정비 이후 시작한 라이딩)으로 더하고 빼기
--   3) 라이딩 동시 삭제 시 거리를 두 번 빼지 않기
--   4) 지난 날짜로 정비를 기록하면 그날 이후 달린 거리는 남기기 / 더 오래된 기록은 현재 상태를 덮지 않기
--   5) 이동수단 종류를 바꾸면 소모품 항목도 맞추기 (킥보드는 체인 항목 끄기)
--   6) 안에서만 쓰는 함수는 밖(anon·authenticated)에서 부를 수 없게
-- =====================================================================

-- 1) 한 사람이 같은 시각에 시작한 라이딩은 하나뿐
create unique index if not exists rides_owner_started_uniq on public.rides (owner_id, started_at);

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
  -- 이미 저장된 라이딩이면 그대로 돌려줘요 (거리를 두 번 더하지 않음)
  select id into v_id from public.rides where owner_id = auth.uid() and started_at = p_started_at;
  if v_id is not null then
    return v_id;
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
  -- 2) 정비 뒤에 시작한 라이딩만 그 소모품 거리에 더해요 (delete_ride 와 같은 기준)
  update public.vehicle_parts
     set distance_m = distance_m + p_distance_m, updated_at = now()
   where vehicle_id = p_vehicle and last_serviced_at <= p_started_at;
  return v_id;
end;
$$;

-- 3) 먼저 지우고 지운 행으로 계산 → 동시에 두 번 불러도 한 번만 뺌
create or replace function public.delete_ride(p_ride uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.rides%rowtype;
begin
  delete from public.rides where id = p_ride and owner_id = auth.uid() returning * into r;
  if not found then
    raise exception '삭제할 수 없는 기록이에요.';
  end if;
  if r.vehicle_id is not null then
    update public.vehicles set odometer_m = greatest(odometer_m - r.distance_m, 0) where id = r.vehicle_id;
    update public.vehicle_parts
       set distance_m = greatest(distance_m - r.distance_m, 0), updated_at = now()
     where vehicle_id = r.vehicle_id and last_serviced_at <= r.started_at;
  end if;
end;
$$;

-- 4) 정비 완료
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
  v_new_ts timestamptz;
  v_since double precision;
  v_shop text := nullif(left(btrim(coalesce(p_shop, '')), 60), '');
  v_memo text := nullif(left(btrim(coalesce(p_memo, '')), 500), '');
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

  -- 오늘 정비면 지금 시각, 지난 날짜면 그날 0시(한국 시간)부터 다시 셉니다.
  v_new_ts := case when p_serviced_on = v_today then now() else (p_serviced_on::timestamp at time zone 'Asia/Seoul') end;

  -- 지금 상태보다 더 예전 정비를 뒤늦게 적는 경우: 다이어리에만 남기고 현재 거리는 그대로
  if v_new_ts < p.last_serviced_at then
    insert into public.maintenance_logs (owner_id, vehicle_id, part_id, kind, serviced_on, cost, shop, memo, distance_m)
    values (auth.uid(), p.vehicle_id, p.id, p.kind, p_serviced_on, p_cost, v_shop, v_memo, 0)
    returning id into v_id;
    return v_id;
  end if;

  -- 정비한 날 이후에 시작한 라이딩 거리는 새 주기로 이어서 셉니다.
  select coalesce(sum(r.distance_m), 0) into v_since
  from public.rides r where r.vehicle_id = p.vehicle_id and r.started_at >= v_new_ts;

  insert into public.maintenance_logs (owner_id, vehicle_id, part_id, kind, serviced_on, cost, shop, memo, distance_m)
  values (auth.uid(), p.vehicle_id, p.id, p.kind, p_serviced_on, p_cost, v_shop, v_memo, greatest(p.distance_m - v_since, 0))
  returning id into v_id;

  update public.vehicle_parts
     set distance_m = v_since, last_serviced_at = v_new_ts, updated_at = now()
   where id = p.id;
  return v_id;
end;
$$;

-- 5) 종류를 바꾸면 소모품 항목 맞추기
create or replace function public.vehicles_reseed_parts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.seed_vehicle_parts(new.id);  -- 없는 항목만 새로 만듦
  update public.vehicle_parts
     set enabled = (new.type <> 'kickboard'), updated_at = now()
   where vehicle_id = new.id and kind in ('chain_lube', 'chain');
  return new;
end;
$$;
drop trigger if exists vehicles_reseed_parts on public.vehicles;
create trigger vehicles_reseed_parts after update of type on public.vehicles
  for each row when (old.type is distinct from new.type)
  execute function public.vehicles_reseed_parts();

-- 6) 안에서만 쓰는 함수: Supabase 기본 권한으로 anon·authenticated에 열려 있을 수 있어 명시적으로 닫기
revoke execute on function public.seed_vehicle_parts(uuid) from anon, authenticated;
revoke execute on function public.resolve_vehicle(text) from anon, authenticated;
revoke execute on function public.vehicles_reseed_parts() from anon, authenticated;
grant execute on function public.complete_ride(uuid, timestamptz, timestamptz, integer, integer, double precision, real, jsonb) to authenticated;
grant execute on function public.delete_ride(uuid) to authenticated;
grant execute on function public.service_part(uuid, date, integer, text, text) to authenticated;
revoke execute on function public.complete_ride(uuid, timestamptz, timestamptz, integer, integer, double precision, real, jsonb) from anon;
revoke execute on function public.delete_ride(uuid) from anon;
revoke execute on function public.service_part(uuid, date, integer, text, text) from anon;
