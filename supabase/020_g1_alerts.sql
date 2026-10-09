-- =====================================================================
-- B-LOCK 20차 (도난 경보 점검 반영): 019 다음에 실행, 여러 번 실행해도 안전
--   - '회수 완료'·'찾았어요'로 진행 중 경보를 몰래 끝내지 않기 (경보 화면에서 끝내기)
--   - 숨은 스티커가 떼어졌을 때도 경보를 '찾았어요'로 끝내기 + 조회 번호 8자리로 확인
--   - 내 경보·제보 모아보기 (끝난 경보의 사례금 '보냈어요'·'받았어요'까지)
--   - 구매 전 조회 기록을 주인이 보기 + 조회 알림이 그 기록으로 열리게
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) 스티커 없이 끝낸 경보 표시
-- ---------------------------------------------------------------------
alter table public.theft_alerts add column if not exists sticker_missing boolean not null default false;

-- ---------------------------------------------------------------------
-- 2) 경보 끝내기 (019 최신본 + 조회 번호 8자리 + '스티커가 없어졌어요')
--    인자가 늘어서 예전 3개짜리는 지워요 (같은 이름이 둘이면 앱에서 호출할 때 헷갈려요)
-- ---------------------------------------------------------------------
drop function if exists public.resolve_theft_alert(uuid, text, uuid[]);
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
  select * into v from public.vehicles where id = a.vehicle_id;
  -- 실물 회수 증명: 숨은 스티커(코드 전체 또는 QR 아래 조회 번호 8자리) 또는 차대번호 전체
  if exists (select 1 from public.stickers where vehicle_id = v.id) then
    if coalesce(p_sticker_missing, false) then
      -- 도둑이 스티커를 떼어 간 경우: 확인 없이 끝내되 기록으로 남겨요
      v_missing := true;
    elsif not exists (
      select 1 from public.stickers
       where vehicle_id = v.id
         and (code = v_check or (char_length(v_compact) = 8 and lower(left(code, 8)) = lower(v_compact)))
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
revoke execute on function public.resolve_theft_alert(uuid, text, uuid[], boolean) from public, anon;
grant execute on function public.resolve_theft_alert(uuid, text, uuid[], boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 3) 이동수단을 지우거나 수색을 끝내면 경보도 끝내기 (019 최신본)
--    진행 중인 경보가 있으면 '회수 완료'만 눌러서 경보를 끝내지 못하게 해요.
--    경보 화면의 '찾았어요'(resolve_theft_alert)는 경보를 먼저 끝내서 여기에 걸리지 않아요.
-- ---------------------------------------------------------------------
create or replace function public.vehicles_close_alerts()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    update public.theft_alerts set status = 'cancelled', resolved_at = now() where vehicle_id = new.id and status in ('open', 'hidden');
  elsif old.status = 'searching' and new.status <> 'searching' then
    if exists (select 1 from public.theft_alerts where vehicle_id = new.id and status = 'open') then
      raise exception '도난 경보가 진행 중이에요. 경보 화면에서 ''찾았어요''를 눌러 도움 준 분을 골라 주세요.';
    end if;
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

-- ---------------------------------------------------------------------
-- 4) 내 경보·제보 모아보기 (/alerts#mine)
--    내가 보낸 경보(모든 상태) + 내가 목격 제보를 보냈거나 사례금 기록이 있는 경보.
--    제보자 쪽은 경보 화면(get_alert)이 열리는 것만 (숨김·삭제된 이동수단 제외).
-- ---------------------------------------------------------------------
create or replace function public.my_alert_activity()
returns table (id uuid, role text, status text, lost_at timestamptz, place_label text, bounty_amount int,
               type text, brand text, model text, color text, image_path text, vehicle_name text,
               sighting_count int, new_sightings int, reward_todo int, created_at timestamptz, resolved_at timestamptz)
language sql stable security definer set search_path = public as $$
  with mine as (
    select a.id as alert_id, 'owner'::text as role from public.theft_alerts a where a.owner_id = auth.uid()
    union
    select s.alert_id, 'reporter'::text from public.sightings s where s.reporter_id = auth.uid()
    union
    select r.alert_id, 'reporter'::text from public.alert_rewards r where r.reporter_id = auth.uid()
  )
  select a.id, m.role,
         case when a.status = 'open' and a.expires_at <= now() then 'expired' else a.status end,
         a.lost_at, a.place_label, a.bounty_amount,
         v.type, v.brand, v.model, v.color, v.image_path,
         case when m.role = 'owner' then v.name end,
         -- 주인: 들어온 제보 전체 / 제보자: 내가 보낸 제보
         (select count(*)::int from public.sightings s where s.alert_id = a.id and (m.role = 'owner' or s.reporter_id = auth.uid())),
         case when m.role = 'owner' then (select count(*)::int from public.sightings s where s.alert_id = a.id and s.status = 'new') else 0 end,
         -- 할 일: 주인은 아직 안 보낸·못 받음 신고된 사례금, 제보자는 받았는지 확인할 사례금
         (select count(*)::int from public.alert_rewards r
           where r.alert_id = a.id and r.amount > 0
             and case when m.role = 'owner' then r.owner_id = auth.uid() and r.status in ('pending', 'unpaid_reported')
                      else r.reporter_id = auth.uid() and r.status in ('pending', 'paid') end),
         a.created_at, a.resolved_at
    from mine m
    join public.theft_alerts a on a.id = m.alert_id
    join public.vehicles v on v.id = a.vehicle_id
   where auth.uid() is not null
     and (m.role = 'owner' or (a.status <> 'hidden' and v.deleted_at is null))
   order by a.created_at desc
   limit 30;
$$;
revoke execute on function public.my_alert_activity() from public, anon;
grant execute on function public.my_alert_activity() to authenticated;

-- ---------------------------------------------------------------------
-- 5) 구매 전 조회 기록 (주인만, 시간·방법만)
--    지금 주인이 된 뒤의 최근 90일, 30건까지. 누가 조회했는지는 저장하지 않아요.
-- ---------------------------------------------------------------------
create index if not exists vehicle_lookups_vehicle_idx on public.vehicle_lookups (vehicle_id, created_at desc);

create or replace function public.owner_vehicle_lookups(p_vehicle uuid)
returns table (method text, stolen boolean, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select l.method, l.result = 'stolen', l.created_at
    from public.vehicle_lookups l
    join public.vehicles v on v.id = l.vehicle_id
   where l.vehicle_id = p_vehicle
     and v.owner_id = auth.uid()
     and v.deleted_at is null
     and l.created_at >= coalesce(v.owned_since, v.created_at)
     and l.created_at > now() - interval '90 days'
   order by l.created_at desc
   limit 30;
$$;
revoke execute on function public.owner_vehicle_lookups(uuid) from public, anon;
grant execute on function public.owner_vehicle_lookups(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 6) 구매 전 도난 조회 (019 최신본): 주인 알림이 '받은 제보·대화'의 조회 기록으로 열려요
-- ---------------------------------------------------------------------
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
revoke execute on function public.check_vehicle(text) from public;
grant execute on function public.check_vehicle(text) to anon, authenticated;
