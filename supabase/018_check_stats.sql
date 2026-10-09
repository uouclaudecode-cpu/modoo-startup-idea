-- =====================================================================
-- B-LOCK 18차: 구매 전 도난 조회 · 공개 통계 · 도난 다발 지도 (017 다음에 실행, 여러 번 실행해도 안전)
--   - 조회 방법: QR(주소/코드 전체) · QR 아래 '조회 번호'(코드 앞 8자리) · 차대번호
--   - 결과: 도난 신고 중 / 등록됨 / 기록 없음 (주인 정보 없음)
--   - 도난 신고 중인 이동수단이 조회되면 주인에게 알림 (30분에 한 번)
-- =====================================================================

alter table public.vehicles add column if not exists last_lookup_push_at timestamptz;

create table if not exists public.vehicle_lookups (
  id          bigint generated always as identity primary key,
  key_hash    text not null,             -- 조회한 값의 해시 (원래 값은 저장 안 함)
  method      text not null check (method in ('qr', 'code', 'serial')),
  vehicle_id  uuid references public.vehicles (id) on delete set null,
  result      text not null check (result in ('stolen', 'registered', 'none')),
  created_at  timestamptz not null default now()
);
create index if not exists vehicle_lookups_key_idx on public.vehicle_lookups (key_hash, created_at desc);
create index if not exists vehicle_lookups_time_idx on public.vehicle_lookups (created_at desc);
alter table public.vehicle_lookups enable row level security;
revoke all on public.vehicle_lookups from anon, authenticated;

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
       and (vv.id in (select s.vehicle_id from public.stickers s where left(s.code, 8) = v_code and s.vehicle_id is not null)
            or left(vv.qr_token, 8) = v_code)
     limit 1;
  else
    v_method := 'serial';
    v_serial := upper(regexp_replace(v_raw, '[^A-Za-z0-9]', '', 'g'));
    if char_length(v_serial) < 5 then raise exception '차대번호는 5자 이상이에요.'; end if;
    v_key := public.sha256_hex('b-lock-serial:' || v_serial);
    select * into v from public.vehicles where serial_hash = v_key and deleted_at is null limit 1;
  end if;

  -- 같은 값을 짧은 시간에 너무 많이 조회하지 못하게
  if (select count(*) from public.vehicle_lookups where key_hash = v_key and created_at > now() - interval '1 hour') >= 30
     or (select count(*) from public.vehicle_lookups where created_at > now() - interval '1 minute') >= 300 then
    raise exception '조회가 너무 많아요. 잠시 후 다시 시도해 주세요.';
  end if;

  if v.id is null then
    v_result := 'none';
  elsif v.status = 'searching' then
    v_result := 'stolen';
    select id into v_alert from public.theft_alerts where vehicle_id = v.id and status = 'open' limit 1;
    v_token := v.qr_token;  -- '주인에게 몰래 알리기'(익명 제보)용
    if v.last_lookup_push_at is null or v.last_lookup_push_at < now() - interval '30 minutes' then
      update public.vehicles set last_lookup_push_at = now() where id = v.id;
      perform public.send_push(v.owner_id, '🔎 누군가 당신의 ' || coalesce(nullif(v.name, ''), '이동수단') || '을(를) 조회했어요',
        case v_method when 'serial' then '차대번호로' when 'code' then '조회 번호로' else 'QR로' end
          || ' 도난 여부를 확인했어요. 중고로 거래되는 중일 수 있어요. 발견 제보가 오면 바로 알려 드릴게요.',
        '/vehicles/' || v.id || '/reports', 'lookup-' || v.id, 'reports');
    end if;
  else
    v_result := 'registered';
  end if;

  insert into public.vehicle_lookups (key_hash, method, vehicle_id, result) values (v_key, v_method, v.id, v_result);

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

-- 공개 통계 (발표·지자체 제안용, 개인 정보 없음)
create or replace function public.public_stats()
returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'vehicles', (select count(*) from public.vehicles where deleted_at is null),
    'stickers', (select count(*) from public.stickers where vehicle_id is not null),
    'users', (select count(*) from public.profiles),
    'alerts', (select count(*) from public.theft_alerts where status not in ('hidden', 'cancelled')),
    'recovered', (select count(*) from public.theft_alerts where status = 'resolved'),
    'found_reports', (select count(*) from public.reports where kind = 'found'),
    'lookups', (select count(*) from public.vehicle_lookups),
    'lookups_stolen', (select count(*) from public.vehicle_lookups where result = 'stolen'),
    'sightings', (select count(*) from public.sightings)
  );
$$;

-- 도난 다발 지도: 최근 1년 경보를 약 500m 칸으로 묶어 개수만 (정확한 위치 없음)
create or replace function public.theft_cells(p_days int default 365)
returns table (lat double precision, lng double precision, n int, recovered int)
language sql stable security definer set search_path = public as $$
  select round((a.lat / 0.0045)::numeric)::double precision * 0.0045 as lat,
         round((a.lng / 0.0055)::numeric)::double precision * 0.0055 as lng,
         count(*)::int,
         count(*) filter (where a.status = 'resolved')::int
    from public.theft_alerts a
   where a.status not in ('hidden', 'cancelled')
     and a.created_at > now() - make_interval(days => least(greatest(coalesce(p_days, 365), 7), 730))
   group by 1, 2
   order by 3 desc
   limit 300;
$$;

revoke execute on function public.check_vehicle(text) from public;
grant execute on function public.check_vehicle(text) to anon, authenticated;
revoke execute on function public.public_stats() from public;
grant execute on function public.public_stats() to anon, authenticated;
revoke execute on function public.theft_cells(int) from public;
grant execute on function public.theft_cells(int) to anon, authenticated;
