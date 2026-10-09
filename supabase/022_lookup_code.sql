-- =====================================================================
-- B-LOCK 22차: 읽기 쉬운 조회 번호 (021 다음에 실행, 여러 번 실행해도 안전)
--   - 스티커·이동수단마다 대문자·숫자 8자리 조회 번호 (헷갈리는 0·O·1·I·L 제외), 예: K8YU RQT2
--   - 입력할 때 소문자·띄어쓰기·하이픈은 무시. 예전 방식(코드 앞 8자리)도 계속 받아요
-- =====================================================================

create or replace function public.gen_lookup_code()
returns text language sql volatile set search_path = public as $$
  select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', (get_byte(b, i) % 31) + 1, 1), '' order by i)
    from (select extensions.gen_random_bytes(8) as b) x, generate_series(0, 7) i;
$$;
-- 기본값으로 쓰여서 등록하는 사람(authenticated) 권한으로도 실행돼야 해요
grant execute on function public.gen_lookup_code() to authenticated;

alter table public.stickers add column if not exists lookup_code text;
alter table public.vehicles add column if not exists lookup_code text;

-- 이미 있는 스티커·이동수단에 번호 채우기 (겹치면 다시 뽑기)
do $fill$
declare r record; c text;
begin
  for r in select code from public.stickers where lookup_code is null loop
    loop
      c := public.gen_lookup_code();
      exit when not exists (select 1 from public.stickers where lookup_code = c) and not exists (select 1 from public.vehicles where lookup_code = c);
    end loop;
    update public.stickers set lookup_code = c where code = r.code;
  end loop;
  for r in select id from public.vehicles where lookup_code is null loop
    loop
      c := public.gen_lookup_code();
      exit when not exists (select 1 from public.stickers where lookup_code = c) and not exists (select 1 from public.vehicles where lookup_code = c);
    end loop;
    update public.vehicles set lookup_code = c where id = r.id;
  end loop;
end
$fill$;

alter table public.stickers alter column lookup_code set default public.gen_lookup_code();
alter table public.vehicles alter column lookup_code set default public.gen_lookup_code();
create unique index if not exists stickers_lookup_code_key on public.stickers (lookup_code);
create unique index if not exists vehicles_lookup_code_key on public.vehicles (lookup_code);

create or replace function public.resolve_theft_alert(p_alert uuid, p_check text, p_reward_sightings uuid[], p_sticker_missing boolean default false)
returns json
language plpgsql security definer set search_path = public as $$
declare
  a public.theft_alerts;
  v public.vehicles;
  v_check text := btrim(coalesce(p_check, ''));
  v_compact text := regexp_replace(btrim(coalesce(p_check, '')), '\s', '', 'g');
  v_missing boolean := false;
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
  -- 지난 경보를 끝내는데 같은 이동수단에 새 경보가 진행 중이면, 아래 '회수 완료'가 경보 확인에 걸려요. 새 경보에서 끝내게 안내해요
  if a.status <> 'open' and exists (select 1 from public.theft_alerts where vehicle_id = a.vehicle_id and status = 'open' and id <> p_alert) then
    raise exception '이 이동수단에 새로 보낸 경보가 진행 중이에요. 그 경보 화면에서 ''찾았어요''를 눌러 주세요.';
  end if;
  select * into v from public.vehicles where id = a.vehicle_id;
  -- 실물 회수 증명: 숨은 스티커(코드 전체 또는 QR 아래 조회 번호 8자리) 또는 차대번호 전체
  if exists (select 1 from public.stickers where vehicle_id = v.id) then
    if coalesce(p_sticker_missing, false) then
      -- 도둑이 스티커를 떼어 간 경우: 차대번호를 등록했으면 그걸로 확인하고, 없으면 확인 없이 끝내되 기록으로 남겨요
      if v.serial_hash is not null
         and public.sha256_hex('b-lock-serial:' || upper(regexp_replace(v_check, '[^A-Za-z0-9]', '', 'g'))) <> v.serial_hash then
        raise exception '차대번호가 맞지 않아요. 스티커가 없으면 프레임에 새겨진 차대번호 전체를 넣어 주세요.';
      end if;
      v_missing := true;
    elsif not exists (
      select 1 from public.stickers
       where vehicle_id = v.id
         and (code = v_check or lookup_code = upper(regexp_replace(coalesce(v_check, ''), '[^A-Za-z0-9]', '', 'g')) or (char_length(v_compact) = 8 and lower(left(code, 8)) = lower(v_compact)))
    ) then
      raise exception '되찾은 이동수단의 숨은 스티커를 찍거나, 스티커 QR 아래 조회 번호 8자리를 넣어 주세요.';
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
  -- 경보를 먼저 끝내야 아래 이동수단 '회수 완료'가 경보 확인(vehicles_close_alerts)에 걸리지 않아요
  update public.theft_alerts set status = 'resolved', resolved_at = now(), sticker_missing = v_missing where id = p_alert;
  update public.vehicles set status = 'recovered' where id = v.id and status = 'searching';
  for s in select * from public.sightings where id = any (coalesce(v_ids, '{}')) loop
    update public.sightings set status = 'useful' where id = s.id;
    v_amt := v_each + case when v_left >= 1000 then 1000 else 0 end;
    v_left := greatest(v_left - 1000, 0);
    -- 사례금은 지금처럼 '아직 안 보냄'으로 시작해서 주인이 '보냈어요'를 눌러야 해요
    insert into public.alert_rewards (alert_id, sighting_id, reporter_id, owner_id, amount)
    values (p_alert, s.id, s.reporter_id, a.owner_id, v_amt) on conflict do nothing;
    perform public.send_push(s.reporter_id, '덕분에 찾았어요 🙌',
      '제보가 회수에 도움이 됐어요.' || case when v_amt > 0 then ' 약속한 사례금 ' || v_amt || '원을 받으면 앱에서 확인을 눌러 주세요.' else '' end,
      '/alerts/' || p_alert, 'resolved-' || p_alert, 'all');
  end loop;
  return json_build_object('status', 'resolved', 'rewarded', v_n, 'each', v_each, 'sticker_missing', v_missing);
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
      perform public.send_push(v.owner_id, '🔎 누군가 당신의 ' || coalesce(nullif(v.name, ''), '이동수단') || '을(를) 조회했어요',
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

create or replace function public.unlink_sticker(p_vehicle uuid, p_code text, p_reuse boolean default false)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_code text := regexp_replace(coalesce(p_code, ''), '\s', '', 'g');
  v_target text;
  v_n int;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요해요.';
  end if;
  if not exists (select 1 from public.vehicles where id = p_vehicle and owner_id = auth.uid() and deleted_at is null) then
    raise exception '내 이동수단의 스티커만 연결을 끊을 수 있어요.';
  end if;
  if char_length(v_code) < 8 then
    raise exception '스티커를 찾을 수 없어요. 새로고침해 주세요.';
  end if;
  select count(*), min(code) into v_n, v_target
    from public.stickers
   where vehicle_id = p_vehicle
     and (code = v_code or lookup_code = upper(regexp_replace(coalesce(v_code, ''), '[^A-Za-z0-9]', '', 'g')) or (char_length(v_code) = 8 and left(code, 8) = v_code));
  if v_n = 0 then
    raise exception '이 이동수단에 연결된 스티커가 아니에요. 새로고침해 주세요.';
  end if;
  if v_n > 1 then
    raise exception '조회 번호가 같은 스티커가 여러 장이에요. 문의하기로 알려 주세요.';
  end if;
  if coalesce(p_reuse, false) then
    update public.stickers set vehicle_id = null, claimed_by = null, claimed_at = null where code = v_target;
  else
    delete from public.stickers where code = v_target;
  end if;
end;
$$;

-- 조회 번호는 사용자가 정하거나 바꿀 수 없게 (등록할 때 서버가 정해요)
create or replace function public.vehicles_lookup_code_guard()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.lookup_code := public.gen_lookup_code();
    else
      new.lookup_code := old.lookup_code;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists vehicles_lookup_code_guard on public.vehicles;
create trigger vehicles_lookup_code_guard before insert or update on public.vehicles
  for each row execute function public.vehicles_lookup_code_guard();
revoke execute on function public.vehicles_lookup_code_guard() from public, anon, authenticated;
