-- =====================================================================
-- B-LOCK 24차: 라이딩·정비 강화 (023 다음에 실행, 여러 번 실행해도 안전)
--   1) 앱 없이 탄 거리 직접 더하기 (소모품 계산에 반영)
--   2) 마지막 주차 위치 (찾아가기 · 도난 경보에 자동 입력)
--   3) 자전거 종류 (로드·MTB·하이브리드·미니벨로·전기자전거·접이식·어린이)
--   4) 라이딩 배터리 기록 (전기자전거·킥보드: 1회 충전 주행거리 계산)
-- =====================================================================

-- 3) 자전거 종류
alter table public.vehicles add column if not exists subtype text
  check (subtype is null or subtype in ('road', 'mtb', 'hybrid', 'minivelo', 'ebike', 'folding', 'kids', 'other'));

-- 4) 배터리
alter table public.rides add column if not exists battery_start smallint check (battery_start is null or battery_start between 0 and 100);
alter table public.rides add column if not exists battery_end smallint check (battery_end is null or battery_end between 0 and 100);

create or replace function public.set_ride_battery(p_ride uuid, p_start int, p_end int)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_start is not null and (p_start < 0 or p_start > 100) or p_end is not null and (p_end < 0 or p_end > 100) then
    raise exception '배터리는 0~100%%로 적어 주세요.';
  end if;
  if p_start is not null and p_end is not null and p_end > p_start then
    raise exception '도착 배터리가 출발보다 많을 수 없어요.';
  end if;
  update public.rides set battery_start = p_start, battery_end = p_end where id = p_ride and owner_id = auth.uid();
  if not found then raise exception '내 라이딩 기록만 바꿀 수 있어요.'; end if;
end;
$$;

-- 1) 앱 없이 탄 거리
create table if not exists public.manual_distance_logs (
  id          uuid primary key default gen_random_uuid(),
  vehicle_id  uuid not null references public.vehicles (id) on delete cascade,
  owner_id    uuid not null references auth.users (id) on delete cascade,
  distance_m  double precision not null check (distance_m > 0 and distance_m <= 300000),
  note        text check (char_length(note) <= 100),
  created_at  timestamptz not null default now()
);
create index if not exists manual_distance_vehicle_idx on public.manual_distance_logs (vehicle_id, created_at desc);
alter table public.manual_distance_logs enable row level security;
drop policy if exists "owner reads manual distance" on public.manual_distance_logs;
create policy "owner reads manual distance" on public.manual_distance_logs for select to authenticated using (owner_id = auth.uid());
revoke all on public.manual_distance_logs from anon, authenticated;
grant select on public.manual_distance_logs to authenticated;

create or replace function public.add_manual_distance(p_vehicle uuid, p_km numeric, p_note text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_m double precision := round(coalesce(p_km, 0) * 1000);
begin
  if not exists (select 1 from public.vehicles where id = p_vehicle and owner_id = auth.uid() and deleted_at is null) then
    raise exception '내 이동수단에만 더할 수 있어요.';
  end if;
  if v_m < 100 or v_m > 300000 then
    raise exception '거리는 0.1~300km로 적어 주세요.';
  end if;
  if (select count(*) from public.manual_distance_logs where owner_id = auth.uid() and created_at > now() - interval '1 day') >= 10 then
    raise exception '하루에 10번까지 더할 수 있어요.';
  end if;
  insert into public.manual_distance_logs (vehicle_id, owner_id, distance_m, note)
  values (p_vehicle, auth.uid(), v_m, nullif(left(btrim(coalesce(p_note, '')), 100), ''));
  update public.vehicles set odometer_m = odometer_m + v_m where id = p_vehicle;
  update public.vehicle_parts set distance_m = distance_m + v_m, updated_at = now() where vehicle_id = p_vehicle;
end;
$$;

-- 2) 마지막 주차 위치 (이동수단마다 하나, 본인만 봄)
create table if not exists public.parking_spots (
  vehicle_id  uuid primary key references public.vehicles (id) on delete cascade,
  owner_id    uuid not null references auth.users (id) on delete cascade,
  lat         double precision not null check (lat between -90 and 90),
  lng         double precision not null check (lng between -180 and 180),
  accuracy_m  int,
  note        text check (char_length(note) <= 100),
  parked_at   timestamptz not null default now()
);
alter table public.parking_spots enable row level security;
drop policy if exists "owner reads parking" on public.parking_spots;
create policy "owner reads parking" on public.parking_spots for select to authenticated using (owner_id = auth.uid());
drop policy if exists "owner deletes parking" on public.parking_spots;
create policy "owner deletes parking" on public.parking_spots for delete to authenticated using (owner_id = auth.uid());
revoke all on public.parking_spots from anon, authenticated;
grant select, delete on public.parking_spots to authenticated;

create or replace function public.save_parking(p_vehicle uuid, p_lat double precision, p_lng double precision, p_accuracy int, p_note text default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.vehicles where id = p_vehicle and owner_id = auth.uid() and deleted_at is null) then
    raise exception '내 이동수단만 저장할 수 있어요.';
  end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception '위치가 올바르지 않아요.';
  end if;
  insert into public.parking_spots (vehicle_id, owner_id, lat, lng, accuracy_m, note, parked_at)
  values (p_vehicle, auth.uid(), p_lat, p_lng, p_accuracy, nullif(left(btrim(coalesce(p_note, '')), 100), ''), now())
  on conflict (vehicle_id) do update
    set owner_id = excluded.owner_id, lat = excluded.lat, lng = excluded.lng, accuracy_m = excluded.accuracy_m,
        note = excluded.note, parked_at = excluded.parked_at;
end;
$$;

-- 소유권이 넘어가면 이전 주인의 주차 위치는 지워요
create or replace function public.vehicles_clear_parking()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.owner_id is distinct from old.owner_id then
    delete from public.parking_spots where vehicle_id = new.id;
  end if;
  return new;
end;
$$;
drop trigger if exists vehicles_clear_parking on public.vehicles;
create trigger vehicles_clear_parking after update of owner_id on public.vehicles
  for each row execute function public.vehicles_clear_parking();

revoke execute on function public.vehicles_clear_parking() from public, anon, authenticated;
revoke execute on function public.set_ride_battery(uuid, int, int) from public, anon;
grant execute on function public.set_ride_battery(uuid, int, int) to authenticated;
revoke execute on function public.add_manual_distance(uuid, numeric, text) from public, anon;
grant execute on function public.add_manual_distance(uuid, numeric, text) to authenticated;
revoke execute on function public.save_parking(uuid, double precision, double precision, int, text) from public, anon;
grant execute on function public.save_parking(uuid, double precision, double precision, int, text) to authenticated;
