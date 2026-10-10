-- 040: 점검 후 고친 것 (여러 번 실행해도 안전해요)
-- 1) 알림 문구 다듬기: '을(를)'·'이(가)' 없이 자연스럽게, '자전거' → '이동수단', 사례금 알림은 실제 버튼 이름('받았어요')으로
-- 2) '도움이 됐어요': 내가 내 이동수단에 보낸 제보에는 누를 수 없게 (칭호 부풀리기 막기)
-- 3) QR 알림 '함께 알려 준 사람': 같은 기기가 같은 사유를 여러 번 눌러도 한 번만 세게

create table if not exists public.report_notice_devices (
  report_id uuid not null references public.reports(id) on delete cascade,
  device text not null,
  created_at timestamptz not null default now(),
  primary key (report_id, device)
);
alter table public.report_notice_devices enable row level security;
revoke all on public.report_notice_devices from anon, authenticated;

create or replace function public.send_bike_notice(
  p_token text, p_reason text, p_note text default null, p_image_path text default null,
  p_contact_mode text default 'chat', p_device text default null
)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_vehicle uuid;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_mode text := case when p_contact_mode = 'chat' then 'chat' else 'none' end;
  v_device text := case when nullif(btrim(coalesce(p_device, '')), '') is null then null else public.sha256_hex(left(p_device, 100)) end;
  v_window interval;
  v_existing record;
  v_finder text;
  v_id uuid;
begin
  select id into v_vehicle from public.vehicles where id = public.resolve_vehicle(p_token) and deleted_at is null;
  if v_vehicle is null then raise exception '등록되지 않았거나 사용할 수 없는 QR이에요.'; end if;
  if p_reason is null or p_reason not in ('move', 'entrance', 'no_parking', 'long_parked', 'fallen', 'rain', 'flat', 'broken',
                                          'light_on', 'key_left', 'item_left', 'unlocked', 'taking', 'tampering', 'nice', 'other') then
    raise exception '알릴 내용을 골라 주세요.';
  end if;
  if p_reason = 'other' and v_note is null then raise exception '주인에게 전할 말을 적어 주세요.'; end if;
  if char_length(v_note) > 100 then raise exception '전할 말은 100자까지 쓸 수 있어요.'; end if;
  if p_image_path is not null and p_image_path !~ '^reports/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$' then
    raise exception '사진 경로가 올바르지 않아요.';
  end if;
  -- 주인이 자기 이동수단에 보내는 건 막아요
  if auth.uid() is not null and exists (select 1 from public.vehicles where id = v_vehicle and owner_id = auth.uid()) then
    raise exception '내 이동수단에는 보낼 수 없어요.';
  end if;
  -- 같은 기기: 이 이동수단에 1시간에 5번까지 / 전체: 10분에 20번까지
  if v_device is not null and (select count(*) from public.reports
        where vehicle_id = v_vehicle and reporter_device = v_device and created_at > now() - interval '1 hour') >= 5 then
    raise exception '조금 뒤에 다시 알려 주세요.';
  end if;
  if (select count(*) from public.reports where vehicle_id = v_vehicle and created_at > now() - interval '10 minutes') >= 20 then
    raise exception '잠시 후 다시 시도해 주세요.';
  end if;

  -- 같은 사유가 최근에 이미 왔으면 '함께 알려 준 사람'만 늘려요 (직접 쓰기·사진·급한 사유는 짧게)
  v_window := case when public.notice_urgent(p_reason) then interval '10 minutes' else interval '24 hours' end;
  if p_reason <> 'other' and p_image_path is null then
    select id, notice_count into v_existing from public.reports
     where vehicle_id = v_vehicle and reason = p_reason and created_at > now() - v_window
       and (reporter_device is distinct from v_device or v_device is null)
     order by created_at desc limit 1;
    if v_existing.id is not null then
      -- 같은 기기는 한 번만 세요 (계속 눌러서 '함께 알려 준 사람'을 부풀리지 못하게)
      if v_device is not null then
        insert into public.report_notice_devices (report_id, device) values (v_existing.id, v_device) on conflict do nothing;
        if not found then
          return json_build_object('merged', true, 'count', v_existing.notice_count, 'again', true);
        end if;
      end if;
      update public.reports set notice_count = notice_count + 1 where id = v_existing.id;
      return json_build_object('merged', true, 'count', v_existing.notice_count + 1);
    end if;
    -- 같은 기기가 같은 사유를 또 누른 경우는 조용히 끝내요
    if v_device is not null and exists (select 1 from public.reports where vehicle_id = v_vehicle and reason = p_reason
                                          and reporter_device = v_device and created_at > now() - v_window) then
      return json_build_object('merged', true, 'count', 1, 'again', true);
    end if;
  end if;

  if v_mode = 'chat' then v_finder := public.random_token(18); end if;
  insert into public.reports (vehicle_id, reporter_id, kind, reason, description, image_path, contact_mode, finder_token_hash, reporter_device)
  values (v_vehicle, auth.uid(), 'contact', p_reason, left(concat_ws(' · ', public.notice_label(p_reason), v_note), 1000), p_image_path,
          v_mode, case when v_finder is null then null else public.sha256_hex(v_finder) end, v_device)
  returning id into v_id;
  return json_build_object('merged', false, 'report_id', v_id, 'finder_token', v_finder);
end;
$$;

create or replace function public.thank_report(p_report uuid, p_thanked boolean default true)
returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_at timestamptz;
begin
  select rp.id, rp.reporter_id, rp.thanked_at, v.owner_id, v.name into r
    from public.reports rp join public.vehicles v on v.id = rp.vehicle_id
   where rp.id = p_report;
  if r.id is null or r.owner_id is distinct from auth.uid() then
    raise exception '내 이동수단에 온 제보만 표시할 수 있어요.';
  end if;
  -- 내가 내 이동수단에 보낸 제보는 '도움'으로 세지 않아요
  if r.reporter_id = auth.uid() then
    raise exception '내가 보낸 제보에는 표시할 수 없어요.';
  end if;
  v_at := case when coalesce(p_thanked, true) then coalesce(r.thanked_at, now()) end;
  update public.reports set thanked_at = v_at where id = p_report;
  -- 처음 고맙다고 했을 때만 (로그인해서 보낸 사람에게) 알려요
  if v_at is not null and r.thanked_at is null and r.reporter_id is not null then
    perform public.send_push(r.reporter_id, '💛 내 제보가 도움이 됐어요', coalesce(r.name, '이동수단') || ' 주인이 고맙다고 했어요. MY에서 내 활동을 볼 수 있어요.',
                             '/dashboard#activity', 'thanks-' || p_report, 'all');
  end if;
  return v_at;
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
      raise exception '이동수단에 붙은 스티커와 맞지 않아요. 숨은 스티커를 다시 찍거나, QR 아래 조회 번호 8자리를 확인해 주세요.';
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

  perform public.send_push(v_buyer, '소유권을 받았어요', coalesce(v.name, '이동수단') || ', 이제 내 이동수단이에요. 스티커를 새로 숨기고 위치를 적어 두세요.',
                           '/vehicles/' || v.id, 'transfer-' || t.id, 'all');
  perform public.send_push(t.from_user, '소유권 넘기기가 끝났어요', coalesce(v.name, '이동수단') || ' 소유권을 넘겼어요.', '/dashboard', 'transfer-' || t.id, 'all');

  return json_build_object('vehicle_id', v.id, 'completed_at', now(), 'sticker_checked', v_checked);
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
      perform public.send_push(v.owner_id, '🔎 누군가 내 ' || coalesce(nullif(v.name, ''), '이동수단') || ' 정보를 조회했어요',
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

create or replace function public.update_reward(p_reward uuid, p_action text)
returns void
language plpgsql security definer set search_path = public as $$
declare r public.alert_rewards;
begin
  select * into r from public.alert_rewards where id = p_reward for update;
  if not found then raise exception '기록을 찾을 수 없어요.'; end if;
  if p_action = 'paid' and r.owner_id = auth.uid() and r.status in ('pending', 'unpaid_reported') then
    update public.alert_rewards set status = 'paid', paid_at = now() where id = r.id;
    perform public.send_push(r.reporter_id, '사례금을 보냈대요', '받았다면 앱에서 ''받았어요''를 눌러 주세요.', '/alerts/' || r.alert_id, 'reward-' || r.id, 'all');
  elsif p_action = 'confirm' and r.reporter_id = auth.uid() and r.status in ('pending', 'paid', 'unpaid_reported') then
    update public.alert_rewards set status = 'confirmed', confirmed_at = now() where id = r.id;
  elsif p_action = 'unpaid' and r.reporter_id = auth.uid() and r.status in ('pending', 'paid') and r.created_at < now() - interval '3 days' then
    update public.alert_rewards set status = 'unpaid_reported', unpaid_reported_at = coalesce(unpaid_reported_at, now()) where id = r.id;
  else
    raise exception '지금은 이 동작을 할 수 없어요. (''못 받았어요''는 되찾은 지 3일 뒤부터 누를 수 있어요)';
  end if;
end;
$$;
