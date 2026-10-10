-- 033: 화면에 보이는 데이터베이스 안내 문구 다듬기 (용어 통일: 양도 → 소유권 넘기기, 콜백 → 전화 요청, -요 말투)
-- 아래 함수들은 각 함수의 가장 최근 정의를 그대로 옮기고 문구만 바꿨어요. 동작은 같아요. 여러 번 실행해도 안전해요.

-- start_transfer (원본: 023_transfer_link_7days.sql)
create or replace function public.start_transfer(p_vehicle uuid, p_mode text default 'qr')
returns json
language plpgsql security definer set search_path = public as $$
declare
  v public.vehicles;
  v_token text;
  v_id uuid;
  v_mode text := case when p_mode = 'link' then 'link' else 'qr' end;
  v_exp timestamptz := now() + case when p_mode = 'link' then interval '7 days' else interval '10 minutes' end;
begin
  select * into v from public.vehicles where id = p_vehicle and owner_id = auth.uid() and deleted_at is null for update;
  if not found then
    raise exception '내 이동수단만 넘길 수 있어요.';
  end if;
  if v.status = 'searching' then
    raise exception '수색 중인 이동수단은 넘길 수 없어요. 찾은 뒤 상태를 바꿔 주세요.';
  end if;
  if exists (
    select 1 from public.vehicle_ownership_history
     where vehicle_id = p_vehicle and method = 'transfer' and started_at > now() - interval '24 hours'
  ) then
    raise exception '넘겨받은 지 24시간이 지나야 다시 넘길 수 있어요.';
  end if;
  if (select count(*) from public.ownership_transfers where from_user = auth.uid() and created_at > now() - interval '1 day') >= 10 then
    raise exception '소유권 넘기기는 하루 10번까지 시작할 수 있어요.';
  end if;
  -- 이전에 만든 대기 중 양도는 취소 (QR·링크 모두, 한 번에 하나만)
  update public.ownership_transfers set status = 'cancelled' where vehicle_id = p_vehicle and status = 'pending';
  v_token := public.random_token(18);
  insert into public.ownership_transfers (vehicle_id, from_user, token_hash, expires_at, mode)
  values (p_vehicle, auth.uid(), public.sha256_hex(v_token), v_exp, v_mode)
  returning id into v_id;
  return json_build_object('transfer_id', v_id, 'token', v_token, 'expires_at', v_exp, 'mode', v_mode);
end;
$$;

-- accept_transfer (원본: 022_lookup_code.sql)
create or replace function public.accept_transfer(p_token text, p_check text)
returns json
language plpgsql security definer set search_path = public as $$
declare
  t public.ownership_transfers;
  v public.vehicles;
  v_buyer uuid := auth.uid();
  v_check text := btrim(coalesce(p_check, ''));
  v_short text;
  v_sticker_count int;
  v_checked boolean := false;
begin
  if v_buyer is null then
    raise exception '로그인이 필요해요.';
  end if;
  select * into t from public.ownership_transfers where token_hash = public.sha256_hex(p_token) for update;
  if not found then
    raise exception '소유권 넘기기 QR을 찾을 수 없어요.';
  end if;
  if t.status <> 'pending' then
    raise exception '이미 처리된 소유권 넘기기예요.';
  end if;
  if t.expires_at <= now() then
    update public.ownership_transfers set status = 'expired' where id = t.id;
    raise exception '소유권 넘기기 QR 시간이 지났어요. 판매자에게 다시 만들어 달라고 해 주세요.';
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

  -- 실물 확인: 스티커가 있으면 숨은 스티커 코드(또는 QR 아래 조회 번호 8자리), 없으면 차대번호 전체
  select count(*) into v_sticker_count from public.stickers where vehicle_id = v.id;
  if v_sticker_count > 0 then
    v_short := regexp_replace(v_check, '\s', '', 'g');
    if not exists (
      select 1 from public.stickers
       where vehicle_id = v.id
         and (code = v_check or lookup_code = upper(regexp_replace(coalesce(v_check, ''), '[^A-Za-z0-9]', '', 'g')) or (char_length(v_short) = 8 and lower(left(code, 8)) = lower(v_short)))
    ) then
      raise exception '자전거에 붙은 스티커와 맞지 않아요. 숨은 스티커를 다시 찍거나, QR 아래 조회 번호 8자리를 확인해 주세요.';
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
    raise exception '이 계정은 최근 소유권 넘기기가 많아 확인이 필요해요. 문의하기로 알려 주세요.';
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
  perform public.send_push(t.from_user, '소유권 넘기기가 끝났어요', coalesce(v.name, '이동수단') || ' 소유권을 넘겼어요.', '/dashboard', 'transfer-' || t.id, 'all');

  return json_build_object('vehicle_id', v.id, 'completed_at', now(), 'sticker_checked', v_checked);
end;
$$;

-- check_vehicle (원본: 022_lookup_code.sql)
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
  v_norm text;
begin
  if v_raw = '' or char_length(v_raw) > 300 then raise exception 'QR 주소·조회 번호·차대번호 중 하나를 입력해 주세요.'; end if;
  -- QR 주소면 코드만
  v_code := substring(v_raw from '/scan/([A-Za-z0-9_-]{16,})');
  if v_code is null and v_raw ~ '^[A-Za-z0-9_-]{16,40}$' then v_code := v_raw; end if;

  if v_code is not null then
    v_method := 'qr';
    v_key := public.sha256_hex('qr:' || v_code);
    select * into v from public.vehicles where id = public.resolve_vehicle(v_code) and deleted_at is null;
  elsif regexp_replace(v_raw, '\s', '', 'g') ~ '^[A-Za-z0-9_-]{8}$' or upper(regexp_replace(coalesce(v_raw, ''), '[^A-Za-z0-9]', '', 'g')) ~ '^[A-Z0-9]{8}$' then
    -- QR 아래에 적힌 조회 번호 (코드 앞 8자리, 띄어쓰기 무시)
    v_method := 'code';
    v_code := regexp_replace(v_raw, '\s', '', 'g');
    v_norm := upper(regexp_replace(coalesce(v_raw, ''), '[^A-Za-z0-9]', '', 'g'));
    v_key := public.sha256_hex('code:' || v_norm);
    select vv.* into v from public.vehicles vv
     where vv.deleted_at is null
       and (vv.lookup_code = v_norm
            or vv.id in (select s.vehicle_id from public.stickers s where (s.lookup_code = v_norm or lower(left(s.code, 8)) = lower(v_code)) and s.vehicle_id is not null)
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
      perform public.send_push(v.owner_id, '🔎 누군가 내 ' || coalesce(nullif(v.name, ''), '이동수단') || '을(를) 조회했어요',
        case v_method when 'serial' then '차대번호로' when 'code' then '조회 번호로' else 'QR로' end
          || ' 도난 여부를 확인했어요. 중고로 거래되는 중일 수 있어요. 눌러서 조회 기록을 확인해 보세요.',
        '/vehicles/' || v.id || '/reports#lookups', 'lookup-' || v.id, 'reports');
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

-- submit_sighting (원본: 019_polish.sql)
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
    if p_url is null or p_url !~* '^https?://[^\s]+$' then raise exception '매물 주소(https://…)를 붙여 넣어 주세요.'; end if;
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

-- submit_report_v2 (원본: 019_polish.sql)
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
  if v_mode = 'callback' and char_length(btrim(coalesce(p_contact, ''))) < 4 then raise exception '전화 받을 번호를 적어 주세요.'; end if;
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

-- update_reward (원본: 019_polish.sql)
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
    raise exception '지금은 이 동작을 할 수 없어요. (''못 받았어요''는 되찾은 지 3일 뒤부터 누를 수 있어요)';
  end if;
end;
$$;

-- lost_posts_before_write (원본: 012_review_fixes.sql)
create or replace function public.lost_posts_before_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_check boolean;
begin
  if tg_op = 'INSERT' then
    new.author_id := auth.uid();
    new.author_name := coalesce((select nullif(nickname, '') from public.profiles where id = auth.uid()), '회원');
    new.comment_count := 0;
    new.status := 'open';
    new.resolved_at := null;
    -- 작성 시각은 서버가 정해요 (보내온 값으로 맨 위에 고정하거나 작성 제한을 피하지 못하게)
    new.created_at := now();
    new.updated_at := now();
    new.deleted_at := null;
    if (select count(*) from public.lost_posts where author_id = auth.uid() and created_at > now() - interval '1 hour') >= 5 then
      raise exception '글은 1시간에 5개까지 올릴 수 있어요. 잠시 후 다시 시도해 주세요.';
    end if;
    v_check := true;
  else
    new.author_id := old.author_id;
    if new.author_name is distinct from old.author_name
       and new.author_name is distinct from (select nullif(nickname, '') from public.profiles where id = old.author_id) then
      new.author_name := old.author_name;
    end if;
    if current_setting('blocklock.counting', true) is distinct from 'on' then
      new.comment_count := old.comment_count;
    end if;
    new.created_at := old.created_at;
    if current_setting('blocklock.backfill', true) is distinct from 'on' then
      if new.status = 'resolved' and old.status is distinct from 'resolved' then
        new.resolved_at := now();
      elsif new.status = 'open' then
        new.resolved_at := null;
      else
        new.resolved_at := old.resolved_at;
      end if;
      new.updated_at := now();
    end if;
    -- 지우는 순간: 지도 위치는 바로 지우고, 글에 올린 사진은 정리 대기열로
    if new.deleted_at is not null and old.deleted_at is null then
      new.lost_lat := null;
      new.lost_lng := null;
      if old.image_bucket = 'community-images' then
        perform public.enqueue_cleanup('community-images', old.image_path);
      end if;
      new.image_path := null;
      new.image_bucket := null;
      return new;  -- 지울 때는 이동수단·사진 검사가 필요 없어요
    end if;
    v_check := new.vehicle_id is distinct from old.vehicle_id
            or new.image_path is distinct from old.image_path
            or new.image_bucket is distinct from old.image_bucket;
  end if;

  if new.image_path is null then
    new.image_bucket := null;
  end if;

  if v_check then
    if new.vehicle_id is not null and not exists (
      select 1 from public.vehicles v where v.id = new.vehicle_id and v.owner_id = new.author_id
    ) then
      raise exception '내 이동수단만 연결할 수 있어요.';
    end if;
    if new.image_path is not null then
      if new.image_bucket = 'vehicle-images' then
        if not exists (select 1 from public.vehicles v where v.id = new.vehicle_id and v.image_path = new.image_path) then
          raise exception '사진 경로가 올바르지 않아요. 사진을 다시 골라 주세요.';
        end if;
      elsif new.image_bucket = 'community-images' then
        if new.image_path !~ ('^' || new.author_id::text || '/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$') then
          raise exception '사진 경로가 올바르지 않아요. 사진을 다시 골라 주세요.';
        end if;
      else
        raise exception '사진 경로가 올바르지 않아요. 사진을 다시 골라 주세요.';
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- post_comments_before_insert (원본: 012_review_fixes.sql)
create or replace function public.post_comments_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.author_id := auth.uid();
  new.author_name := coalesce((select nullif(nickname, '') from public.profiles where id = auth.uid()), '회원');
  new.deleted_at := null;
  new.created_at := now();
  new.body := btrim(new.body);
  new.location_text := nullif(btrim(new.location_text), '');
  if not exists (select 1 from public.lost_posts p where p.id = new.post_id and p.deleted_at is null) then
    raise exception '삭제되었거나 없는 글이에요.';
  end if;
  if (select count(*) from public.post_comments where author_id = auth.uid() and created_at > now() - interval '10 minutes') >= 30 then
    raise exception '댓글을 너무 많이 남겼어요. 잠시 후 다시 시도해 주세요.';
  end if;
  if new.image_path is not null and new.image_path !~ ('^' || auth.uid()::text || '/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$') then
    raise exception '사진 경로가 올바르지 않아요. 사진을 다시 골라 주세요.';
  end if;
  return new;
end;
$$;
