-- =====================================================================
-- B-LOCK 14차: 도난 경보(근처 사용자에게 알림) · 목격/중고 매물 제보 · 약속형 현상금 · 신뢰 정보
-- (013 다음에 실행, 여러 번 실행해도 안전)
--   - 돈은 B-LOCK이 맡지 않아요(약속형). 지급 여부와 확인만 기록하고 평판에 반영해요.
--   - 알림 받을 위치는 본인이 고른 '관심 동네' 한 곳 (약 1km 단위로 반올림해 저장, 실시간 추적 없음)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) 프로필: 도난 경보 설정 · 본인인증 표시(관리자만 바꿈)
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists alert_opt_in boolean not null default false;
alter table public.profiles add column if not exists alert_lat double precision;
alter table public.profiles add column if not exists alert_lng double precision;
alter table public.profiles add column if not exists alert_area_label text check (char_length(alert_area_label) <= 60);
alter table public.profiles add column if not exists alert_radius_m int not null default 2000 check (alert_radius_m between 500 and 3000);
alter table public.profiles add column if not exists alert_quiet boolean not null default true;
alter table public.profiles add column if not exists identity_verified boolean not null default false;
alter table public.profiles add column if not exists last_alert_push_at timestamptz;
grant update (alert_opt_in, alert_radius_m, alert_quiet) on public.profiles to authenticated;

-- 두 지점 사이 거리 (m)
create or replace function public.distance_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision language sql immutable as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ));
$$;

-- 관심 동네 저장 (약 1km 단위로 반올림)
create or replace function public.set_alert_area(p_lat double precision, p_lng double precision, p_label text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception '로그인이 필요해요.'; end if;
  if p_lat is null or p_lng is null then
    update public.profiles set alert_lat = null, alert_lng = null, alert_area_label = null, alert_opt_in = false where id = auth.uid();
    return;
  end if;
  if p_lat not between 33 and 39 or p_lng not between 124 and 132 then
    raise exception '국내 위치만 고를 수 있어요.';
  end if;
  update public.profiles
     set alert_lat = round(p_lat::numeric, 2)::double precision,
         alert_lng = round(p_lng::numeric, 2)::double precision,
         alert_area_label = nullif(left(btrim(coalesce(p_label, '')), 60), ''),
         alert_opt_in = true
   where id = auth.uid();
end;
$$;

-- ---------------------------------------------------------------------
-- 2) 도난 경보
-- ---------------------------------------------------------------------
create table if not exists public.theft_alerts (
  id                uuid primary key default gen_random_uuid(),
  vehicle_id        uuid not null references public.vehicles (id) on delete cascade,
  owner_id          uuid not null references auth.users (id) on delete cascade,
  status            text not null default 'open' check (status in ('open', 'resolved', 'cancelled', 'expired', 'hidden')),
  lost_at           timestamptz not null,
  lat               double precision not null,
  lng               double precision not null,
  public_lat        double precision not null,
  public_lng        double precision not null,
  place_label       text check (char_length(place_label) <= 100),
  radius_m          int not null default 1000 check (radius_m between 500 and 3000),
  marks             text check (char_length(marks) <= 300),
  police_report_no  text check (char_length(police_report_no) <= 40),
  bounty_amount     int check (bounty_amount is null or (bounty_amount between 5000 and 50000 and bounty_amount % 5000 = 0)),
  recipients        int not null default 0,
  flag_count        int not null default 0,
  expires_at        timestamptz not null,
  resolved_at       timestamptz,
  created_at        timestamptz not null default now()
);
create unique index if not exists one_open_alert on public.theft_alerts (vehicle_id) where status = 'open';
create index if not exists theft_alerts_open_idx on public.theft_alerts (status, created_at desc);
alter table public.theft_alerts enable row level security;
drop policy if exists "owner reads alerts" on public.theft_alerts;
create policy "owner reads alerts" on public.theft_alerts for select to authenticated using (owner_id = auth.uid() or public.is_admin());
revoke all on public.theft_alerts from anon, authenticated;
grant select on public.theft_alerts to authenticated;

create table if not exists public.theft_alert_deliveries (
  alert_id  uuid not null references public.theft_alerts (id) on delete cascade,
  user_id   uuid not null references auth.users (id) on delete cascade,
  sent_at   timestamptz not null default now(),
  primary key (alert_id, user_id)
);
create index if not exists alert_deliveries_user_idx on public.theft_alert_deliveries (user_id, sent_at desc);
alter table public.theft_alert_deliveries enable row level security;
revoke all on public.theft_alert_deliveries from anon, authenticated;

create table if not exists public.alert_flags (
  alert_id   uuid not null references public.theft_alerts (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  reason     text check (char_length(reason) <= 200),
  created_at timestamptz not null default now(),
  primary key (alert_id, user_id)
);
alter table public.alert_flags enable row level security;
revoke all on public.alert_flags from anon, authenticated;

-- ---------------------------------------------------------------------
-- 3) 목격 제보 (거리에서 봤어요 / 중고 매물에서 봤어요)
-- ---------------------------------------------------------------------
create table if not exists public.sightings (
  id           uuid primary key default gen_random_uuid(),
  alert_id     uuid not null references public.theft_alerts (id) on delete cascade,
  reporter_id  uuid not null references auth.users (id) on delete cascade default auth.uid(),
  kind         text not null check (kind in ('street', 'listing')),
  lat          double precision,
  lng          double precision,
  accuracy_m   int,
  distance_m   int,
  photo_path   text,
  listing_url  text check (char_length(listing_url) <= 500),
  price        int check (price is null or price between 0 and 100000000),
  note         text check (char_length(note) <= 300),
  seen_at      timestamptz not null default now(),
  status       text not null default 'new' check (status in ('new', 'useful', 'false', 'duplicate')),
  created_at   timestamptz not null default now()
);
create index if not exists sightings_alert_idx on public.sightings (alert_id, created_at desc);
create index if not exists sightings_reporter_idx on public.sightings (reporter_id, created_at desc);
alter table public.sightings enable row level security;
drop policy if exists "parties read sightings" on public.sightings;
create policy "parties read sightings" on public.sightings for select to authenticated using (
  reporter_id = auth.uid()
  or public.is_admin()
  or exists (select 1 from public.theft_alerts a where a.id = alert_id and a.owner_id = auth.uid())
);
revoke all on public.sightings from anon, authenticated;
grant select on public.sightings to authenticated;

-- 사진: 비공개 버킷 (제보자 본인 폴더에 올리고, 경보 주인·관리자만 봄)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sighting-images', 'sighting-images', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
drop policy if exists "sighting images upload own folder" on storage.objects;
create policy "sighting images upload own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'sighting-images' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "sighting images read" on storage.objects;
create policy "sighting images read" on storage.objects for select to authenticated using (
  bucket_id = 'sighting-images' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin()
    or exists (select 1 from public.sightings s join public.theft_alerts a on a.id = s.alert_id where s.photo_path = name and a.owner_id = auth.uid())
  )
);
drop policy if exists "sighting images delete own" on storage.objects;
create policy "sighting images delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'sighting-images' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------
-- 4) 약속형 현상금 지급 기록
-- ---------------------------------------------------------------------
create table if not exists public.alert_rewards (
  id            uuid primary key default gen_random_uuid(),
  alert_id      uuid not null references public.theft_alerts (id) on delete cascade,
  sighting_id   uuid not null references public.sightings (id) on delete cascade,
  reporter_id   uuid not null references auth.users (id) on delete cascade,
  owner_id      uuid not null references auth.users (id) on delete cascade,
  amount        int not null default 0,
  status        text not null default 'pending' check (status in ('pending', 'paid', 'confirmed', 'unpaid_reported')),
  paid_at       timestamptz,
  confirmed_at  timestamptz,
  created_at    timestamptz not null default now(),
  unique (alert_id, sighting_id)
);
alter table public.alert_rewards enable row level security;
drop policy if exists "parties read rewards" on public.alert_rewards;
create policy "parties read rewards" on public.alert_rewards for select to authenticated
  using (reporter_id = auth.uid() or owner_id = auth.uid() or public.is_admin());
revoke all on public.alert_rewards from anon, authenticated;
grant select on public.alert_rewards to authenticated;

-- ---------------------------------------------------------------------
-- 5) 신뢰 정보: 가입 기간 · 도와준 횟수 · 허위 표시 · 본인인증 · 현상금 미지급
-- ---------------------------------------------------------------------
create or replace function public.get_user_trust(p_users uuid[])
returns table (user_id uuid, member_since timestamptz, helped_count int, false_count int, identity_verified boolean, unpaid_count int)
language sql stable security definer set search_path = public as $$
  select p.id,
         p.created_at,
         (select count(distinct s.alert_id)::int from public.sightings s where s.reporter_id = p.id and s.status = 'useful'),
         (select count(*)::int from public.sightings s where s.reporter_id = p.id and s.status = 'false'),
         p.identity_verified,
         (select count(*)::int from public.alert_rewards r where r.owner_id = p.id and r.status = 'unpaid_reported')
    from public.profiles p
   where p.id = any (p_users[1:50]) and auth.uid() is not null;
$$;

-- ---------------------------------------------------------------------
-- 6) 경보 보내기
-- ---------------------------------------------------------------------
create or replace function public.create_theft_alert(
  p_vehicle uuid, p_lost_at timestamptz, p_lat double precision, p_lng double precision, p_place text,
  p_radius int, p_marks text, p_police text, p_bounty int
)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v public.vehicles;
  v_radius int;
  v_id uuid;
  v_sent int := 0;
  v_quiet boolean := extract(hour from now() at time zone 'Asia/Seoul') >= 23 or extract(hour from now() at time zone 'Asia/Seoul') < 7;
  r record;
  v_title text;
  v_body text;
begin
  select * into v from public.vehicles where id = p_vehicle and owner_id = auth.uid() and deleted_at is null for update;
  if not found then raise exception '내 이동수단만 경보를 보낼 수 있어요.'; end if;
  if exists (select 1 from public.theft_alerts where vehicle_id = p_vehicle and status = 'open') then
    raise exception '이미 경보가 진행 중이에요.';
  end if;
  if (select count(*) from public.theft_alerts where owner_id = auth.uid() and created_at > now() - interval '30 days') >= 2 then
    raise exception '도난 경보는 30일에 2번까지 보낼 수 있어요. 급하면 문의하기로 알려 주세요.';
  end if;
  if p_lat is null or p_lng is null or p_lat not between 33 and 39 or p_lng not between 124 and 132 then
    raise exception '잃어버린 곳을 지도에서 골라 주세요.';
  end if;
  if p_lost_at is null or p_lost_at > now() + interval '5 minutes' or p_lost_at < now() - interval '7 days' then
    raise exception '잃어버린 시각은 최근 7일 안으로 적어 주세요.';
  end if;
  -- 경찰 신고 번호가 있으면 3km까지, 없으면 1km
  v_radius := least(greatest(coalesce(p_radius, 1000), 500), case when nullif(btrim(coalesce(p_police, '')), '') is null then 1000 else 3000 end);
  -- 등록 하루 안 된 기기는 1km 고정 (남의 자전거를 등록해 경보를 내는 악용 줄이기)
  if v.created_at > now() - interval '24 hours' then v_radius := least(v_radius, 1000); end if;

  insert into public.theft_alerts (vehicle_id, owner_id, lost_at, lat, lng, public_lat, public_lng, place_label, radius_m, marks, police_report_no, bounty_amount, expires_at)
  values (p_vehicle, auth.uid(), p_lost_at, p_lat, p_lng, round(p_lat::numeric, 3)::double precision, round(p_lng::numeric, 3)::double precision,
          nullif(left(btrim(coalesce(p_place, '')), 100), ''), v_radius, nullif(left(btrim(coalesce(p_marks, '')), 300), ''),
          nullif(left(btrim(coalesce(p_police, '')), 40), ''), p_bounty, now() + interval '72 hours')
  returning id into v_id;

  update public.vehicles set status = 'searching' where id = p_vehicle;
  update public.trade_links set revoked_at = now() where vehicle_id = p_vehicle and revoked_at is null;
  update public.ownership_transfers set status = 'cancelled' where vehicle_id = p_vehicle and status = 'pending';

  v_title := '🚨 근처에서 ' || coalesce(nullif(concat_ws(' ', v.color, v.brand), ''), '') || case v.type when 'kickboard' then ' 킥보드' when 'bicycle' then ' 자전거' else ' 이동수단' end || ' 도난';
  -- 받는 사람: 알림을 켠 근처 사람 (본인·차단 관계 제외, 하루 3건·30분 1건, 조용한 시간 존중), 가까운 순 300명
  for r in
    select p.id, public.distance_m(p_lat, p_lng, p.alert_lat, p.alert_lng) as d
      from public.profiles p
     where p.alert_opt_in and p.alert_lat is not null
       and p.id <> auth.uid()
       and p.alert_lat between p_lat - 0.05 and p_lat + 0.05
       and p.alert_lng between p_lng - 0.06 and p_lng + 0.06
       and public.distance_m(p_lat, p_lng, p.alert_lat, p.alert_lng) <= least(v_radius, p.alert_radius_m) + 700  -- 관심 동네는 약 1km 반올림이라 여유
       and not (p.alert_quiet and v_quiet)
       and (p.last_alert_push_at is null or p.last_alert_push_at < now() - interval '30 minutes')
       and (select count(*) from public.theft_alert_deliveries d where d.user_id = p.id and d.sent_at > now() - interval '1 day') < 3
       and not public.has_blocked(p.id, auth.uid())
       and not public.has_blocked(auth.uid(), p.id)
     order by d
     limit 300
  loop
    insert into public.theft_alert_deliveries (alert_id, user_id) values (v_id, r.id) on conflict do nothing;
    update public.profiles set last_alert_push_at = now() where id = r.id;
    v_body := '약 ' || case when r.d < 1000 then (round(r.d / 100) * 100)::int || 'm' else round((r.d / 1000)::numeric, 1) || 'km' end || ' 거리'
              || coalesce(' · ' || nullif(left(btrim(coalesce(p_marks, '')), 40), ''), '')
              || case when p_bounty is not null then ' · 사례금 ' || (p_bounty / 10000.0)::numeric(4,1) || '만 원' else '' end
              || '. 비슷한 걸 보면 알려 주세요.';
    perform public.send_push(r.id, v_title, v_body, '/alerts/' || v_id, 'alert-' || v_id, 'all');
    v_sent := v_sent + 1;
  end loop;
  update public.theft_alerts set recipients = v_sent where id = v_id;
  return json_build_object('alert_id', v_id, 'recipients', v_sent, 'radius_m', v_radius);
end;
$$;

-- 공개 카드 (누구나). 주인이면 정확한 위치까지
create or replace function public.get_alert(p_alert uuid)
returns json
language plpgsql stable security definer set search_path = public as $$
declare
  a public.theft_alerts;
  v public.vehicles;
  v_owner boolean;
begin
  select * into a from public.theft_alerts where id = p_alert;
  if not found or (a.status = 'hidden' and a.owner_id is distinct from auth.uid() and not public.is_admin()) then
    return null;
  end if;
  select * into v from public.vehicles where id = a.vehicle_id;
  v_owner := a.owner_id = auth.uid();
  return json_build_object(
    'id', a.id, 'status', case when a.status = 'open' and a.expires_at <= now() then 'expired' else a.status end,
    'is_owner', v_owner,
    'lost_at', a.lost_at, 'place_label', a.place_label,
    'lat', case when v_owner then a.lat else a.public_lat end,
    'lng', case when v_owner then a.lng else a.public_lng end,
    'radius_m', a.radius_m, 'marks', a.marks, 'police_reported', a.police_report_no is not null,
    'bounty_amount', a.bounty_amount, 'recipients', case when v_owner then a.recipients else null end,
    'expires_at', a.expires_at, 'resolved_at', a.resolved_at, 'created_at', a.created_at,
    'vehicle', json_build_object('id', case when v_owner then v.id else null end, 'type', v.type, 'brand', v.brand, 'model', v.model,
                                 'color', v.color, 'description', v.description, 'image_path', v.image_path,
                                 'has_sticker', exists (select 1 from public.stickers s where s.vehicle_id = v.id),
                                 'has_serial', v.serial_hash is not null)
  );
end;
$$;

-- 근처 진행 중 경보 (좌표는 저장하지 않음)
create or replace function public.nearby_alerts(p_lat double precision, p_lng double precision, p_km int default 5)
returns table (id uuid, distance_m int, lost_at timestamptz, place_label text, marks text, bounty_amount int, police_reported boolean,
               type text, brand text, model text, color text, image_path text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select a.id, public.distance_m(p_lat, p_lng, a.public_lat, a.public_lng)::int, a.lost_at, a.place_label, a.marks, a.bounty_amount,
         a.police_report_no is not null, v.type, v.brand, v.model, v.color, v.image_path, a.created_at
    from public.theft_alerts a
    join public.vehicles v on v.id = a.vehicle_id
   where a.status = 'open' and a.expires_at > now()
     and (p_lat is null or public.distance_m(p_lat, p_lng, a.public_lat, a.public_lng) <= least(greatest(p_km, 1), 30) * 1000)
     and (auth.uid() is null or not public.has_blocked(auth.uid(), a.owner_id))
   order by case when p_lat is null then 0 else public.distance_m(p_lat, p_lng, a.public_lat, a.public_lng) end, a.created_at desc
   limit 50;
$$;

-- 이상한 경보 신고 (3명이면 숨김)
create or replace function public.flag_alert(p_alert uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  if auth.uid() is null then raise exception '로그인이 필요해요.'; end if;
  insert into public.alert_flags (alert_id, user_id, reason) values (p_alert, auth.uid(), left(p_reason, 200)) on conflict do nothing;
  select count(*) into v_n from public.alert_flags where alert_id = p_alert;
  update public.theft_alerts set flag_count = v_n, status = case when v_n >= 3 and status = 'open' then 'hidden' else status end where id = p_alert;
end;
$$;

-- ---------------------------------------------------------------------
-- 7) 목격 제보 보내기 · 표시
-- ---------------------------------------------------------------------
create or replace function public.submit_sighting(
  p_alert uuid, p_kind text, p_lat double precision, p_lng double precision, p_accuracy int,
  p_photo text, p_url text, p_price int, p_note text, p_seen_at timestamptz
)
returns json
language plpgsql security definer set search_path = public as $$
declare
  a public.theft_alerts;
  v_uid uuid := auth.uid();
  v_dist int;
  v_id uuid;
begin
  if v_uid is null then raise exception '로그인해야 제보할 수 있어요.'; end if;
  select * into a from public.theft_alerts where id = p_alert;
  if not found or a.status <> 'open' or a.expires_at <= now() then raise exception '이미 끝난 경보예요.'; end if;
  if a.owner_id = v_uid then raise exception '내 경보에는 제보할 수 없어요.'; end if;
  if public.has_blocked(a.owner_id, v_uid) then raise exception '제보할 수 없어요.'; end if;
  if (select count(*) from public.sightings where reporter_id = v_uid and created_at > now() - interval '1 hour') >= 5 then
    raise exception '제보는 1시간에 5번까지 보낼 수 있어요.';
  end if;
  if (select count(*) from public.sightings where reporter_id = v_uid and alert_id = p_alert) >= 3 then
    raise exception '한 경보에는 3번까지 제보할 수 있어요.';
  end if;
  if p_photo is not null and p_photo !~ ('^' || v_uid::text || '/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$') then
    raise exception '사진 경로가 올바르지 않아요.';
  end if;
  if p_kind = 'street' then
    if p_lat is null or p_lng is null then raise exception '본 곳의 위치가 필요해요.'; end if;
    if coalesce(p_accuracy, 9999) > 150 then raise exception '위치가 정확하지 않아요. 밖에서 다시 시도해 주세요.'; end if;
    v_dist := public.distance_m(a.lat, a.lng, p_lat, p_lng)::int;
    if v_dist > 30000 then raise exception '경보 지점에서 너무 멀어요 (30km 이내만).'; end if;
    if p_seen_at is null or p_seen_at < now() - interval '3 hours' or p_seen_at > now() + interval '5 minutes' then
      raise exception '본 시각은 3시간 안이어야 해요.';
    end if;
  elsif p_kind = 'listing' then
    if p_url is null or p_url !~* '^https?://[^\s]+$' then raise exception '매물 주소(https://…)를 붙여넣어 주세요.'; end if;
  else
    raise exception '제보 종류가 올바르지 않아요.';
  end if;

  insert into public.sightings (alert_id, reporter_id, kind, lat, lng, accuracy_m, distance_m, photo_path, listing_url, price, note, seen_at)
  values (p_alert, v_uid, p_kind, p_lat, p_lng, p_accuracy, v_dist, p_photo, p_url, p_price, nullif(left(btrim(coalesce(p_note, '')), 300), ''),
          coalesce(p_seen_at, now()))
  returning id into v_id;

  perform public.send_push(a.owner_id,
    case when p_kind = 'listing' then '중고 매물 제보가 왔어요' else '목격 제보가 왔어요' end,
    case when p_kind = 'listing' then '비슷한 매물을 봤다는 제보예요. 직접 거래하러 가지 말고 확인해 주세요.'
         else '경보 지점에서 약 ' || case when v_dist < 1000 then v_dist || 'm' else round((v_dist / 1000.0)::numeric, 1) || 'km' end || ' 떨어진 곳이에요.' end,
    '/alerts/' || p_alert, 'sighting-' || v_id, 'reports');
  return json_build_object('sighting_id', v_id, 'distance_m', v_dist);
end;
$$;

create or replace function public.mark_sighting(p_sighting uuid, p_status text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('new', 'useful', 'false', 'duplicate') then raise exception '상태가 올바르지 않아요.'; end if;
  update public.sightings s set status = p_status
    from public.theft_alerts a
   where s.id = p_sighting and a.id = s.alert_id and a.owner_id = auth.uid();
  if not found then raise exception '내 경보의 제보만 표시할 수 있어요.'; end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 8) 회수 완료 · 취소 · 사례금 기록
-- ---------------------------------------------------------------------
create or replace function public.resolve_theft_alert(p_alert uuid, p_check text, p_reward_sightings uuid[])
returns json
language plpgsql security definer set search_path = public as $$
declare
  a public.theft_alerts;
  v public.vehicles;
  v_check text := btrim(coalesce(p_check, ''));
  v_ids uuid[];
  v_n int;
  v_each int;
  s record;
begin
  select * into a from public.theft_alerts where id = p_alert and owner_id = auth.uid() for update;
  if not found then raise exception '내 경보만 끝낼 수 있어요.'; end if;
  if a.status not in ('open', 'expired', 'hidden') then raise exception '이미 끝난 경보예요.'; end if;
  select * into v from public.vehicles where id = a.vehicle_id;
  -- 실물 회수 증명: 숨은 스티커 또는 차대번호 끝 4자리
  if exists (select 1 from public.stickers where vehicle_id = v.id) then
    if not exists (select 1 from public.stickers where vehicle_id = v.id and code = v_check) then
      raise exception '되찾은 자전거의 숨은 스티커를 찍어 주세요.';
    end if;
  elsif v.serial_last4 is not null then
    if upper(v_check) <> v.serial_last4 then raise exception '차대번호 끝 4자리가 맞지 않아요.'; end if;
  end if;

  select array_agg(id) into v_ids from public.sightings
   where alert_id = p_alert and id = any (coalesce(p_reward_sightings, '{}')) and status <> 'false';
  v_n := coalesce(array_length(v_ids, 1), 0);
  v_each := case when v_n > 0 and a.bounty_amount is not null then (a.bounty_amount / v_n / 1000) * 1000 else 0 end;

  update public.theft_alerts set status = 'resolved', resolved_at = now() where id = p_alert;
  update public.vehicles set status = 'recovered' where id = v.id and status = 'searching';
  for s in select * from public.sightings where id = any (coalesce(v_ids, '{}')) loop
    update public.sightings set status = 'useful' where id = s.id;
    insert into public.alert_rewards (alert_id, sighting_id, reporter_id, owner_id, amount)
    values (p_alert, s.id, s.reporter_id, a.owner_id, v_each) on conflict do nothing;
    perform public.send_push(s.reporter_id, '덕분에 찾았어요 🙌',
      '제보가 회수에 도움이 됐어요.' || case when v_each > 0 then ' 약속한 사례금 ' || v_each || '원을 받으면 앱에서 확인을 눌러 주세요.' else '' end,
      '/alerts/' || p_alert, 'resolved-' || p_alert, 'all');
  end loop;
  return json_build_object('status', 'resolved', 'rewarded', v_n, 'each', v_each);
end;
$$;

create or replace function public.cancel_theft_alert(p_alert uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.theft_alerts set status = 'cancelled', resolved_at = now()
   where id = p_alert and owner_id = auth.uid() and status in ('open', 'expired', 'hidden');
  if not found then raise exception '내 진행 중 경보만 취소할 수 있어요.'; end if;
end;
$$;

-- 사례금: 주인 '보냈어요' → 제보자 '받았어요' / '못 받았어요'
create or replace function public.update_reward(p_reward uuid, p_action text)
returns void
language plpgsql security definer set search_path = public as $$
declare r public.alert_rewards;
begin
  select * into r from public.alert_rewards where id = p_reward for update;
  if not found then raise exception '기록을 찾을 수 없어요.'; end if;
  if p_action = 'paid' and r.owner_id = auth.uid() and r.status in ('pending', 'unpaid_reported') then
    update public.alert_rewards set status = 'paid', paid_at = now() where id = r.id;
    perform public.send_push(r.reporter_id, '사례금을 보냈대요', '받았다면 앱에서 확인을 눌러 주세요.', '/alerts/' || r.alert_id, 'reward-' || r.id, 'all');
  elsif p_action = 'confirm' and r.reporter_id = auth.uid() and r.status in ('pending', 'paid', 'unpaid_reported') then
    update public.alert_rewards set status = 'confirmed', confirmed_at = now() where id = r.id;
  elsif p_action = 'unpaid' and r.reporter_id = auth.uid() and r.status in ('pending', 'paid') and r.created_at < now() - interval '3 days' then
    update public.alert_rewards set status = 'unpaid_reported' where id = r.id;
  else
    raise exception '지금은 이 동작을 할 수 없어요. (못 받았어요는 회수 3일 뒤부터)';
  end if;
end;
$$;

-- 72시간 지난 경보 정리
create or replace function public.expire_theft_alerts()
returns void language sql security definer set search_path = public as $$
  update public.theft_alerts set status = 'expired' where status = 'open' and expires_at <= now();
$$;
do $$
begin
  perform cron.unschedule('b-lock-expire-alerts') where exists (select 1 from cron.job where jobname = 'b-lock-expire-alerts');
  perform cron.schedule('b-lock-expire-alerts', '*/10 * * * *', 'select public.expire_theft_alerts()');
end;
$$;

-- 탈퇴: 경보·제보는 auth.users 삭제로 함께 지워짐 (cascade). 제보 사진은 정리 대기열로
create or replace function public.sightings_after_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.photo_path is not null then
    insert into public.storage_cleanup_queue (bucket, path) values ('sighting-images', old.photo_path) on conflict do nothing;
  end if;
  return old;
end;
$$;
alter table public.storage_cleanup_queue drop constraint if exists storage_cleanup_queue_bucket_check;
alter table public.storage_cleanup_queue add constraint storage_cleanup_queue_bucket_check
  check (bucket in ('vehicle-images', 'community-images', 'community-secret', 'report-images', 'sighting-images', 'evidence'));
drop trigger if exists sightings_after_delete on public.sightings;
create trigger sightings_after_delete after delete on public.sightings for each row execute function public.sightings_after_delete();
drop policy if exists "admins delete queued sighting images" on storage.objects;
create policy "admins delete queued sighting images" on storage.objects for delete to authenticated using (
  bucket_id in ('sighting-images', 'evidence') and public.is_admin()
  and exists (select 1 from public.storage_cleanup_queue q where q.bucket = bucket_id and q.path = name)
);

-- ---------------------------------------------------------------------
-- 9) 권한
-- ---------------------------------------------------------------------
revoke execute on function public.distance_m(double precision, double precision, double precision, double precision) from public, anon, authenticated;
revoke execute on function public.expire_theft_alerts() from public, anon, authenticated;
revoke execute on function public.sightings_after_delete() from public, anon, authenticated;
revoke execute on function public.set_alert_area(double precision, double precision, text) from public, anon;
grant execute on function public.set_alert_area(double precision, double precision, text) to authenticated;
revoke execute on function public.create_theft_alert(uuid, timestamptz, double precision, double precision, text, int, text, text, int) from public, anon;
grant execute on function public.create_theft_alert(uuid, timestamptz, double precision, double precision, text, int, text, text, int) to authenticated;
revoke execute on function public.get_alert(uuid) from public;
grant execute on function public.get_alert(uuid) to anon, authenticated;
revoke execute on function public.nearby_alerts(double precision, double precision, int) from public;
grant execute on function public.nearby_alerts(double precision, double precision, int) to anon, authenticated;
revoke execute on function public.flag_alert(uuid, text) from public, anon;
grant execute on function public.flag_alert(uuid, text) to authenticated;
revoke execute on function public.submit_sighting(uuid, text, double precision, double precision, int, text, text, int, text, timestamptz) from public, anon;
grant execute on function public.submit_sighting(uuid, text, double precision, double precision, int, text, text, int, text, timestamptz) to authenticated;
revoke execute on function public.mark_sighting(uuid, text) from public, anon;
grant execute on function public.mark_sighting(uuid, text) to authenticated;
revoke execute on function public.resolve_theft_alert(uuid, text, uuid[]) from public, anon;
grant execute on function public.resolve_theft_alert(uuid, text, uuid[]) to authenticated;
revoke execute on function public.cancel_theft_alert(uuid) from public, anon;
grant execute on function public.cancel_theft_alert(uuid) to authenticated;
revoke execute on function public.update_reward(uuid, text) from public, anon;
grant execute on function public.update_reward(uuid, text) to authenticated;
revoke execute on function public.get_user_trust(uuid[]) from public, anon;
grant execute on function public.get_user_trust(uuid[]) to authenticated;

-- 돈을 요구하는 댓글: 쓴 사람의 신뢰 정보만 (아이디는 드러내지 않음)
create or replace function public.get_comment_author_trust(p_comment uuid)
returns table (member_since timestamptz, helped_count int, false_count int, identity_verified boolean, unpaid_count int)
language sql stable security definer set search_path = public as $$
  select t.member_since, t.helped_count, t.false_count, t.identity_verified, t.unpaid_count
    from public.post_comments c
    cross join lateral public.get_user_trust(array[c.author_id]) t
   where c.id = p_comment and c.deleted_at is null and public.post_visible(c.post_id);
$$;
revoke execute on function public.get_comment_author_trust(uuid) from public, anon;
grant execute on function public.get_comment_author_trust(uuid) to authenticated;
