-- =====================================================================
-- B-LOCK 19차: 다듬기 (018 다음에 실행, 여러 번 실행해도 안전)
-- =====================================================================

-- 카카오톡 미리보기용: 안심거래 인증 요약 (조회 수를 올리지 않음)
create or replace function public.get_trade_preview(p_token text)
returns json
language sql stable security definer set search_path = public as $$
  select case
    when l.id is null then json_build_object('valid', false, 'reason', 'not_found')
    when v.deleted_at is not null then json_build_object('valid', false, 'reason', 'deleted')
    when v.owner_id <> l.owner_id then json_build_object('valid', false, 'reason', 'transferred')
    when l.revoked_at is not null then json_build_object('valid', false, 'reason', 'revoked')
    when l.expires_at <= now() then json_build_object('valid', false, 'reason', 'expired')
    when v.status = 'searching' then json_build_object('valid', false, 'reason', 'flagged')
    else json_build_object(
      'valid', true,
      'vehicle', json_build_object('type', v.type, 'brand', v.brand, 'model', v.model, 'color', v.color, 'image_path', v.image_path),
      'owned_since', v.owned_since,
      'searching_count', v.searching_count,
      'serial_last4', v.serial_last4,
      'transfer_count', (select count(*) from public.vehicle_ownership_history h where h.vehicle_id = v.id and h.method = 'transfer'),
      'maintenance_count', (select count(*) from public.maintenance_logs m where m.vehicle_id = v.id))
  end
  from (select 1) one
  left join public.trade_links l on l.token = p_token
  left join public.vehicles v on v.id = l.vehicle_id;
$$;
revoke execute on function public.get_trade_preview(text) from public;
grant execute on function public.get_trade_preview(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 점검 반영 (014·016·018 함수 최신본)
-- ---------------------------------------------------------------------
alter table public.alert_rewards add column if not exists unpaid_reported_at timestamptz;
update public.alert_rewards set unpaid_reported_at = coalesce(unpaid_reported_at, created_at) where status = 'unpaid_reported';

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
  update public.theft_alerts set status = 'expired' where vehicle_id = p_vehicle and status = 'open' and expires_at <= now();
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
       and exists (select 1 from public.push_subscriptions ps where ps.user_id = p.id)
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
  if v.deleted_at is not null and not v_owner then return null; end if;
  return json_build_object(
    'id', a.id, 'status', case when a.status = 'open' and a.expires_at <= now() then 'expired' else a.status end,
    'is_owner', v_owner,
    'lost_at', a.lost_at, 'place_label', a.place_label,
    'lat', case when v_owner then a.lat else a.public_lat end,
    'lng', case when v_owner then a.lng else a.public_lng end,
    'radius_m', a.radius_m, 'marks', a.marks, 'police_reported', a.police_report_no is not null,
    'bounty_amount', a.bounty_amount,
    'owner_unpaid', (select count(*) from public.alert_rewards r where r.owner_id = a.owner_id and r.unpaid_reported_at is not null and r.status <> 'confirmed'), 'recipients', case when v_owner then a.recipients else null end,
    'expires_at', a.expires_at, 'resolved_at', a.resolved_at, 'created_at', a.created_at,
    'vehicle', json_build_object('id', case when v_owner then v.id else null end, 'type', v.type, 'brand', v.brand, 'model', v.model,
                                 'color', v.color, 'description', v.description, 'image_path', v.image_path,
                                 'has_sticker', exists (select 1 from public.stickers s where s.vehicle_id = v.id),
                                 'has_serial', v.serial_hash is not null)
  );
end;
$$;

create or replace function public.nearby_alerts(p_lat double precision, p_lng double precision, p_km int default 5)
returns table (id uuid, distance_m int, lost_at timestamptz, place_label text, marks text, bounty_amount int, police_reported boolean,
               type text, brand text, model text, color text, image_path text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select a.id, public.distance_m(p_lat, p_lng, a.public_lat, a.public_lng)::int, a.lost_at, a.place_label, a.marks, a.bounty_amount,
         a.police_report_no is not null, v.type, v.brand, v.model, v.color, v.image_path, a.created_at
    from public.theft_alerts a
    join public.vehicles v on v.id = a.vehicle_id
   where a.status = 'open' and a.expires_at > now() and v.deleted_at is null
     and (p_lat is null or public.distance_m(p_lat, p_lng, a.public_lat, a.public_lng) <= least(greatest(p_km, 1), 30) * 1000)
     and (auth.uid() is null or not public.has_blocked(auth.uid(), a.owner_id))
   order by case when p_lat is null then 0 else public.distance_m(p_lat, p_lng, a.public_lat, a.public_lng) end, a.created_at desc
   limit 50;
$$;

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
    if public.distance_m(a.lat, a.lng, p_lat, p_lng) > 30000 then raise exception '경보 지점에서 너무 멀어요 (30km 이내만).'; end if;
    v_dist := (round(public.distance_m(a.public_lat, a.public_lng, p_lat, p_lng) / 100) * 100)::int;
    if v_dist > 999999 then raise exception '경보 지점에서 너무 멀어요 (30km 이내만).'; end if;
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
  v_left int := 0;
  v_amt int;
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
  elsif v.serial_hash is not null then
    if public.sha256_hex('b-lock-serial:' || upper(regexp_replace(v_check, '[^A-Za-z0-9]', '', 'g'))) <> v.serial_hash then raise exception '차대번호가 맞지 않아요.'; end if;
  end if;

  select array_agg(id) into v_ids from public.sightings
   where alert_id = p_alert and id = any (coalesce(p_reward_sightings, '{}')) and status <> 'false';
  v_n := coalesce(array_length(v_ids, 1), 0);
  if v_n > 5 then raise exception '도움 된 제보는 5개까지 고를 수 있어요.'; end if;
  v_each := case when v_n > 0 and a.bounty_amount is not null then (a.bounty_amount / v_n / 1000) * 1000 else 0 end;

  v_left := case when v_n > 0 and a.bounty_amount is not null then a.bounty_amount - v_each * v_n else 0 end;
  update public.theft_alerts set status = 'resolved', resolved_at = now() where id = p_alert;
  update public.vehicles set status = 'recovered' where id = v.id and status = 'searching';
  for s in select * from public.sightings where id = any (coalesce(v_ids, '{}')) loop
    update public.sightings set status = 'useful' where id = s.id;
    v_amt := v_each + case when v_left >= 1000 then 1000 else 0 end;
    v_left := greatest(v_left - 1000, 0);
    insert into public.alert_rewards (alert_id, sighting_id, reporter_id, owner_id, amount)
    values (p_alert, s.id, s.reporter_id, a.owner_id, v_amt) on conflict do nothing;
    perform public.send_push(s.reporter_id, '덕분에 찾았어요 🙌',
      '제보가 회수에 도움이 됐어요.' || case when v_amt > 0 then ' 약속한 사례금 ' || v_amt || '원을 받으면 앱에서 확인을 눌러 주세요.' else '' end,
      '/alerts/' || p_alert, 'resolved-' || p_alert, 'all');
  end loop;
  return json_build_object('status', 'resolved', 'rewarded', v_n, 'each', v_each);
end;
$$;

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
    update public.alert_rewards set status = 'unpaid_reported', unpaid_reported_at = coalesce(unpaid_reported_at, now()) where id = r.id;
  else
    raise exception '지금은 이 동작을 할 수 없어요. (못 받았어요는 회수 3일 뒤부터)';
  end if;
end;
$$;

create or replace function public.get_user_trust(p_users uuid[])
returns table (user_id uuid, member_since timestamptz, helped_count int, false_count int, identity_verified boolean, unpaid_count int)
language sql stable security definer set search_path = public as $$
  select p.id,
         p.created_at,
         (select count(distinct s.alert_id)::int from public.sightings s where s.reporter_id = p.id and s.status = 'useful'),
         (select count(*)::int from public.sightings s where s.reporter_id = p.id and s.status = 'false'),
         p.identity_verified,
         (select count(*)::int from public.alert_rewards r where r.owner_id = p.id and r.unpaid_reported_at is not null and r.status <> 'confirmed')
    from public.profiles p
   where p.id = any (p_users[1:50]) and auth.uid() is not null;
$$;

create or replace function public.submit_report_v2(
  p_token text, p_kind text, p_description text, p_latitude double precision, p_longitude double precision,
  p_location_text text, p_image_path text, p_contact text, p_contact_mode text
)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_vehicle uuid;
  v_id uuid;
  v_desc text := btrim(coalesce(p_description, ''));
  v_mode text := coalesce(p_contact_mode, 'chat');
  v_finder text;
begin
  select id into v_vehicle from public.vehicles where id = public.resolve_vehicle(p_token) and deleted_at is null;
  if v_vehicle is null then raise exception '등록되지 않았거나 사용할 수 없는 QR이에요.'; end if;
  if p_kind not in ('found', 'contact') then raise exception '제보 종류가 올바르지 않아요.'; end if;
  if v_mode not in ('chat', 'callback', 'none') then raise exception '연락 방법이 올바르지 않아요.'; end if;
  if v_mode = 'callback' and char_length(btrim(coalesce(p_contact, ''))) < 4 then raise exception '콜백 받을 번호를 적어 주세요.'; end if;
  if p_latitude is not null and (p_latitude not between -90 and 90 or p_longitude not between -180 and 180) then
    raise exception '위치가 올바르지 않아요.';
  end if;
  if v_desc = '' then
    if p_kind = 'found' and (p_latitude is not null or nullif(btrim(coalesce(p_location_text, '')), '') is not null) then
      v_desc := case when p_image_path is null then '📍 이 위치에서 봤어요 (위치만 알림)' else '📍 이 위치에서 봤어요 (사진 첨부)' end;
    else
      raise exception '전할 말을 적어 주세요.';
    end if;
  end if;
  if (select count(*) from public.reports where vehicle_id = v_vehicle and created_at > now() - interval '10 minutes') >= 20 then
    raise exception '잠시 후 다시 시도해 주세요.';
  end if;
  if p_image_path is not null and p_image_path !~ '^reports/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$' then
    raise exception '사진 경로가 올바르지 않아요.';
  end if;
  if v_mode = 'chat' then v_finder := public.random_token(18); end if;

  insert into public.reports (vehicle_id, reporter_id, kind, latitude, longitude, location_text, description, image_path, contact, contact_mode, finder_token_hash)
  values (v_vehicle, auth.uid(), p_kind, p_latitude, p_longitude, nullif(btrim(coalesce(p_location_text, '')), ''), left(v_desc, 1000), p_image_path,
          case when v_mode = 'callback' then left(btrim(p_contact), 100) end,
          v_mode, case when v_finder is null then null else public.sha256_hex(v_finder) end)
  returning id into v_id;
  return json_build_object('report_id', v_id, 'finder_token', v_finder);
end;
$$;

create or replace function public.owner_send(p_report uuid, p_body text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  r public.reports;
  v_subs jsonb;
begin
  select rp.* into r from public.reports rp join public.vehicles v on v.id = rp.vehicle_id
   where rp.id = p_report and v.owner_id = auth.uid() and v.deleted_at is null;
  if not found then raise exception '내 이동수단의 제보에만 답장할 수 있어요.'; end if;
  if r.contact_mode <> 'chat' then raise exception '발견자가 대화를 원하지 않았어요.'; end if;
  if r.created_at < now() - interval '14 days' then raise exception '대화가 끝났어요 (14일).'; end if;
  if char_length(btrim(coalesce(p_body, ''))) = 0 then raise exception '메시지를 적어 주세요.'; end if;
  if (select count(*) from public.report_messages where report_id = r.id and sender = 'owner' and created_at > now() - interval '10 minutes') >= 20 then
    raise exception '잠시 후 다시 보내 주세요.';
  end if;
  insert into public.report_messages (report_id, sender, body) values (r.id, 'owner', left(btrim(p_body), 500));
  select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)) into v_subs
    from public.report_finder_subs s where s.report_id = r.id;
  perform public.send_push_subs(v_subs, '💬 주인이 답장했어요', left(btrim(p_body), 100), '/r#rid=' || r.id, 'chat-' || r.id);
end;
$$;

create or replace function public.finder_subscribe(p_finder text, p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  r public.reports;
begin
  select * into r from public.reports where finder_token_hash = public.sha256_hex(coalesce(p_finder, ''));
  if not found then raise exception '대화를 찾을 수 없어요.'; end if;
  if r.created_at < now() - interval '14 days' then raise exception '대화가 끝났어요.'; end if;
  if p_endpoint !~ '^https://' or char_length(p_endpoint) > 1000 or char_length(p_p256dh) > 200 or char_length(p_auth) > 100 then
    raise exception '알림 정보가 올바르지 않아요.';
  end if;
  if (select count(*) from public.report_finder_subs where report_id = r.id) >= 3 then
    delete from public.report_finder_subs where report_id = r.id and endpoint = (select endpoint from public.report_finder_subs where report_id = r.id order by created_at limit 1);
  end if;
  insert into public.report_finder_subs (report_id, endpoint, p256dh, auth) values (r.id, p_endpoint, p_p256dh, p_auth)
  on conflict (report_id, endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth;
end;
$$;

create or replace function public.check_vehicle(p_input text)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_raw text := btrim(coalesce(p_input, ''));
  v_code text;
  v_serial text;
  v_method text;
  v_key text;
  v public.vehicles;
  v_alert uuid;
  v_result text;
  v_token text;
  v_limited boolean;
begin
  if v_raw = '' or char_length(v_raw) > 300 then raise exception 'QR 주소·조회 번호·차대번호 중 하나를 입력해 주세요.'; end if;
  -- QR 주소면 코드만
  v_code := substring(v_raw from '/scan/([A-Za-z0-9_-]{16,})');
  if v_code is null and v_raw ~ '^[A-Za-z0-9_-]{16,40}$' then v_code := v_raw; end if;

  if v_code is not null then
    v_method := 'qr';
    v_key := public.sha256_hex('qr:' || v_code);
    select * into v from public.vehicles where id = public.resolve_vehicle(v_code) and deleted_at is null;
  elsif regexp_replace(v_raw, '\s', '', 'g') ~ '^[A-Za-z0-9_-]{8}$' then
    -- QR 아래에 적힌 조회 번호 (코드 앞 8자리, 띄어쓰기 무시)
    v_method := 'code';
    v_code := regexp_replace(v_raw, '\s', '', 'g');
    v_key := public.sha256_hex('code:' || v_code);
    select vv.* into v from public.vehicles vv
     where vv.deleted_at is null
       and (vv.id in (select s.vehicle_id from public.stickers s where lower(left(s.code, 8)) = lower(v_code) and s.vehicle_id is not null)
            or lower(left(vv.qr_token, 8)) = lower(v_code))
     order by (vv.status = 'searching') desc
     limit 1;
  else
    v_method := 'serial';
    v_serial := upper(regexp_replace(v_raw, '[^A-Za-z0-9]', '', 'g'));
    if char_length(v_serial) < 5 then raise exception '차대번호는 5자 이상이에요.'; end if;
    v_key := public.sha256_hex('b-lock-serial:' || v_serial);
    select * into v from public.vehicles where serial_hash = v_key and deleted_at is null limit 1;
  end if;

  -- QR·조회 번호로 못 찾았으면 차대번호로도 찾아봐요 (8자리 차대번호 등)
  if v.id is null and v_method <> 'serial' then
    v_serial := upper(regexp_replace(v_raw, '[^A-Za-z0-9]', '', 'g'));
    if char_length(v_serial) >= 5 then
      select * into v from public.vehicles where serial_hash = public.sha256_hex('b-lock-serial:' || v_serial) and deleted_at is null limit 1;
      if v.id is not null then v_method := 'serial'; end if;
    end if;
  end if;
  -- 같은 값을 너무 많이 조회하면 결과는 주되 기록·알림은 건너뛰어요 (남이 조회를 막지 못하게)
  v_limited := (select count(*) from public.vehicle_lookups where key_hash = v_key and created_at > now() - interval '1 hour') >= 30
            or (select count(*) from public.vehicle_lookups where created_at > now() - interval '1 minute') >= 300;

  if v.id is null then
    v_result := 'none';
  elsif v.status = 'searching' then
    v_result := 'stolen';
    select id into v_alert from public.theft_alerts where vehicle_id = v.id and status = 'open' limit 1;
    v_token := v.qr_token;  -- '주인에게 몰래 알리기'(익명 제보)용
    if not v_limited and (v.last_lookup_push_at is null or v.last_lookup_push_at < now() - interval '30 minutes') then
      update public.vehicles set last_lookup_push_at = now() where id = v.id;
      perform public.send_push(v.owner_id, '🔎 누군가 당신의 ' || coalesce(nullif(v.name, ''), '이동수단') || '을(를) 조회했어요',
        case v_method when 'serial' then '차대번호로' when 'code' then '조회 번호로' else 'QR로' end
          || ' 도난 여부를 확인했어요. 중고로 거래되는 중일 수 있어요. 발견 제보가 오면 바로 알려 드릴게요.',
        '/vehicles/' || v.id || '/reports', 'lookup-' || v.id, 'reports');
    end if;
  else
    v_result := 'registered';
  end if;

  if not v_limited then
    insert into public.vehicle_lookups (key_hash, method, vehicle_id, result) values (v_key, v_method, v.id, v_result);
  end if;

  return json_build_object(
    'result', v_result,
    'method', v_method,
    'vehicle', case when v.id is null then null else json_build_object(
      'type', v.type, 'brand', v.brand, 'model', v.model, 'color', v.color,
      'image_path', case when v_result = 'stolen' then v.image_path end,
      'registered_at', date_trunc('month', v.created_at),
      'serial_registered', v.serial_hash is not null,
      'transfer_count', (select count(*) from public.vehicle_ownership_history h where h.vehicle_id = v.id and h.method = 'transfer')
    ) end,
    'alert_id', v_alert,
    'report_token', v_token
  );
end;
$$;

create or replace function public.vehicles_guard()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.serial_hash := null;
      new.serial_last4 := null;
      new.searching_count := 0;
      new.last_recovered_at := null;
      new.owned_since := now();
      new.created_at := now();
      new.qr_token := public.random_token(18);
      new.odometer_m := 0;
      new.deleted_at := null;
      new.status := 'active';
    else
      new.owner_id := old.owner_id;
      new.qr_token := old.qr_token;
      new.created_at := old.created_at;
      new.serial_hash := old.serial_hash;
      new.serial_last4 := old.serial_last4;
      new.searching_count := old.searching_count;
      new.last_recovered_at := old.last_recovered_at;
      new.owned_since := old.owned_since;
      new.odometer_m := old.odometer_m;
    end if;
  end if;
  if tg_op = 'INSERT' then
    if new.status = 'searching' then
      new.searching_count := 1;
    end if;
  else
    if new.status = 'searching' and old.status is distinct from 'searching' then
      new.searching_count := old.searching_count + 1;
    elsif old.status = 'searching' and new.status = 'recovered' then
      new.last_recovered_at := now();
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.peek_transfer(p_token text)
returns json
language plpgsql security definer set search_path = public as $$
declare
  t public.ownership_transfers;
  v public.vehicles;
  v_nick text;
  v_sticker boolean;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요해요.';
  end if;
  select * into t from public.ownership_transfers where token_hash = public.sha256_hex(p_token);
  if not found then
    return json_build_object('status', 'not_found');
  end if;
  if t.status = 'pending' and t.expires_at <= now() then
    update public.ownership_transfers set status = 'expired' where id = t.id;
    t.status := 'expired';
  end if;
  if t.status <> 'pending' then
    return json_build_object('status', t.status, 'mine', t.to_user = auth.uid());
  end if;
  if t.from_user = auth.uid() then
    return json_build_object('status', 'self');
  end if;
  select * into v from public.vehicles where id = t.vehicle_id;
  select nickname into v_nick from public.profiles where id = t.from_user;
  select exists (select 1 from public.stickers s where s.vehicle_id = v.id) into v_sticker;
  return json_build_object(
    'status', 'pending',
    'vehicle', json_build_object('type', v.type, 'name', v.name, 'brand', v.brand, 'model', v.model, 'color', v.color, 'image_path', v.image_path),
    'has_serial', v.serial_hash is not null,
    'requires_sticker', v_sticker,
    'seller', public.mask_nickname(v_nick),
    'expires_at', t.expires_at
  );
end;
$$;

create or replace function public.accept_transfer(p_token text, p_check text)
returns json
language plpgsql security definer set search_path = public as $$
declare
  t public.ownership_transfers;
  v public.vehicles;
  v_buyer uuid := auth.uid();
  v_check text := btrim(coalesce(p_check, ''));
  v_sticker_count int;
  v_checked boolean := false;
begin
  if v_buyer is null then
    raise exception '로그인이 필요해요.';
  end if;
  select * into t from public.ownership_transfers where token_hash = public.sha256_hex(p_token) for update;
  if not found then
    raise exception '양도 QR을 찾을 수 없어요.';
  end if;
  if t.status <> 'pending' then
    raise exception '이미 처리된 양도예요.';
  end if;
  if t.expires_at <= now() then
    update public.ownership_transfers set status = 'expired' where id = t.id;
    raise exception '양도 QR 시간이 지났어요. 판매자에게 다시 만들어 달라고 해 주세요.';
  end if;
  if t.from_user = v_buyer then
    raise exception '내 이동수단은 나에게 넘길 수 없어요.';
  end if;
  select * into v from public.vehicles where id = t.vehicle_id for update;
  if v.id is null or v.deleted_at is not null or v.owner_id <> t.from_user then
    update public.ownership_transfers set status = 'cancelled' where id = t.id;
    raise exception '더 이상 넘길 수 없는 이동수단이에요.';
  end if;
  if v.status = 'searching' then
    raise exception '수색 중인 이동수단은 받을 수 없어요.';
  end if;

  -- 실물 확인: 스티커가 있으면 숨은 스티커 코드, 없으면 차대번호 끝 4자리
  select count(*) into v_sticker_count from public.stickers where vehicle_id = v.id;
  if v_sticker_count > 0 then
    if not exists (select 1 from public.stickers where vehicle_id = v.id and code = v_check) then
      raise exception '자전거에 붙은 스티커와 맞지 않아요. 숨은 스티커를 다시 찍어 주세요.';
    end if;
    v_checked := true;
  elsif v.serial_hash is not null then
    if public.sha256_hex('b-lock-serial:' || upper(regexp_replace(v_check, '[^A-Za-z0-9]', '', 'g'))) <> v.serial_hash then
      raise exception '프레임에 새겨진 차대번호와 맞지 않아요.';
    end if;
    v_checked := true;
  end if;

  if (select count(*) from public.vehicle_ownership_history
       where owner_id = t.from_user and method = 'transfer' and started_at > now() - interval '30 days') >= 4
     or (select count(*) from public.ownership_transfers
       where from_user = t.from_user and status = 'completed' and completed_at > now() - interval '30 days') >= 4 then
    raise exception '이 계정은 최근 양도가 많아 확인이 필요해요. 문의하기로 알려 주세요.';
  end if;

  -- 소유권 이전 (전 주인이 출력해 둔 QR·적어 둔 스티커 위치는 무효)
  update public.vehicles
     set owner_id = v_buyer,
         qr_token = public.random_token(18),
         sticker_spot = null,
         purchased_on = null,
         purchase_place = null,
         image_path = null,
         owned_since = now(),
         status = 'active'
   where id = v.id;
  update public.stickers set claimed_by = v_buyer where vehicle_id = v.id;
  -- 사진 파일은 이전 주인 폴더에 있어서 정리 대기열로 (새 주인이 새로 올려요)
  if v.image_path is not null then
    insert into public.storage_cleanup_queue (bucket, path) values ('vehicle-images', v.image_path) on conflict do nothing;
  end if;
  -- 정비 이력은 기기와 함께
  update public.vehicle_parts set owner_id = v_buyer where vehicle_id = v.id;
  update public.maintenance_logs set owner_id = v_buyer where vehicle_id = v.id;
  -- 넘기지 않는 것: 라이딩 경로(전 주인 위치), 발견 제보(제보자 연락처), 분실 글 연결
  update public.rides set vehicle_id = null where vehicle_id = v.id;
  delete from public.reports where vehicle_id = v.id;
  -- 이동수단 사진을 쓰던 분실 글은 사진도 떼요 (사진은 이제 새 주인 것)
  update public.lost_posts
     set vehicle_id = null,
         image_path = case when image_bucket = 'vehicle-images' then null else image_path end,
         image_bucket = case when image_bucket = 'vehicle-images' then null else image_bucket end
   where vehicle_id = v.id;
  update public.trade_links set revoked_at = now() where vehicle_id = v.id and revoked_at is null;
  update public.ownership_transfers set status = 'cancelled' where vehicle_id = v.id and status = 'pending' and id <> t.id;

  update public.vehicle_ownership_history set ended_at = now() where vehicle_id = v.id and ended_at is null;
  insert into public.vehicle_ownership_history (vehicle_id, owner_id, method) values (v.id, v_buyer, 'transfer');
  update public.ownership_transfers
     set status = 'completed', to_user = v_buyer, completed_at = now(), sticker_checked = v_checked
   where id = t.id;

  perform public.send_push(v_buyer, '소유권을 받았어요', coalesce(v.name, '이동수단') || '이(가) 내 이동수단에 추가됐어요. 스티커를 새로 숨기고 위치를 적어 두세요.',
                           '/vehicles/' || v.id, 'transfer-' || t.id, 'all');
  perform public.send_push(t.from_user, '양도가 끝났어요', coalesce(v.name, '이동수단') || ' 소유권을 넘겼어요.', '/dashboard', 'transfer-' || t.id, 'all');

  return json_build_object('vehicle_id', v.id, 'completed_at', now(), 'sticker_checked', v_checked);
end;
$$;

-- 정리 대기열의 증거·목격 사진은 관리자가 읽을 수 있어야 저장소에서 실제로 지워져요
drop policy if exists "admins read queued sighting images" on storage.objects;
create policy "admins read queued sighting images" on storage.objects for select to authenticated using (
  bucket_id in ('sighting-images', 'evidence') and public.is_admin()
  and exists (select 1 from public.storage_cleanup_queue q where q.bucket = bucket_id and q.path = name)
);

create or replace function public.remove_push_endpoints(p_secret text, p_endpoints text[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret text;
  v_count integer;
begin
  select secret into v_secret from app_private.push_config where id = 1;
  if v_secret is null or p_secret is null or p_secret <> v_secret then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_endpoints is null or cardinality(p_endpoints) = 0 then
    return 0;
  end if;
  if cardinality(p_endpoints) > 500 then
    raise exception 'too many endpoints';
  end if;
  delete from public.push_subscriptions where endpoint = any(p_endpoints);
  get diagnostics v_count = row_count;
  delete from public.report_finder_subs where endpoint = any(p_endpoints);
  return v_count;
end;
$$;

-- 주인 화면용 제보 목록: 제보자 아이디 대신 신뢰 정보만
create or replace function public.owner_alert_sightings(p_alert uuid)
returns table (id uuid, kind text, lat double precision, lng double precision, distance_m int, photo_path text, listing_url text, price int,
               note text, seen_at timestamptz, status text, created_at timestamptz,
               member_since timestamptz, helped_count int, false_count int, identity_verified boolean)
language sql stable security definer set search_path = public as $$
  select s.id, s.kind, s.lat, s.lng,
         case when s.lat is null then null else public.distance_m(a.lat, a.lng, s.lat, s.lng)::int end,
         s.photo_path, s.listing_url, s.price, s.note, s.seen_at, s.status, s.created_at,
         t.member_since, t.helped_count, t.false_count, t.identity_verified
    from public.sightings s
    join public.theft_alerts a on a.id = s.alert_id
    cross join lateral public.get_user_trust(array[s.reporter_id]) t
   where s.alert_id = p_alert and a.owner_id = auth.uid()
   order by s.created_at desc;
$$;
revoke execute on function public.owner_alert_sightings(uuid) from public, anon;
grant execute on function public.owner_alert_sightings(uuid) to authenticated;

-- 이동수단을 지우거나 수색을 끝내면 진행 중 경보도 끝내기
create or replace function public.vehicles_close_alerts()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    update public.theft_alerts set status = 'cancelled', resolved_at = now() where vehicle_id = new.id and status in ('open', 'hidden');
  elsif old.status = 'searching' and new.status <> 'searching' then
    update public.theft_alerts set status = case when new.status = 'recovered' then 'resolved' else 'cancelled' end, resolved_at = now()
     where vehicle_id = new.id and status in ('open', 'hidden');
  end if;
  return new;
end;
$$;
drop trigger if exists vehicles_close_alerts on public.vehicles;
create trigger vehicles_close_alerts after update of deleted_at, status on public.vehicles
  for each row execute function public.vehicles_close_alerts();
revoke execute on function public.vehicles_close_alerts() from public, anon, authenticated;

-- 관리자 '문제없음': 같은 이동수단에 새 경보가 열려 있으면 친절하게 막기
create or replace function public.admin_set_alert_status(p_alert uuid, p_status text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_vehicle uuid;
begin
  if not public.is_admin() then raise exception '관리자만 바꿀 수 있어요.'; end if;
  if p_status not in ('open', 'hidden', 'cancelled') then raise exception '상태가 올바르지 않아요.'; end if;
  select vehicle_id into v_vehicle from public.theft_alerts where id = p_alert;
  if p_status = 'open' and exists (select 1 from public.theft_alerts where vehicle_id = v_vehicle and status = 'open' and id <> p_alert) then
    raise exception '이 이동수단에는 이미 새 경보가 진행 중이에요. 이 경보는 끝내기를 눌러 주세요.';
  end if;
  update public.theft_alerts set status = p_status, flag_count = case when p_status = 'open' then 0 else flag_count end where id = p_alert;
  if p_status = 'open' then delete from public.alert_flags where alert_id = p_alert; end if;
end;
$$;
