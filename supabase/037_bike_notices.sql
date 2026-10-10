-- 037: QR로 '주인에게 알리기' (사유 골라서 한 번에)
-- 1) reports.reason: 고른 사유 (예: move = 통행에 방해돼요), notice_count: 같은 사유를 알려 준 사람 수
--    reporter_device: 보낸 기기 (같은 기기가 너무 자주 보내지 못하게, 해시로만 저장)
-- 2) send_bike_notice(): 로그인 없이도 보낼 수 있어요.
--    - 같은 이동수단·같은 사유가 최근에 이미 왔으면(급한 사유 10분, 나머지 24시간) 새로 알리지 않고 '함께 알려 준 사람 수'만 올려요
--    - 같은 기기는 한 이동수단에 1시간에 5번까지
-- 3) vehicles.notice_muted_until: 주인이 '알림 잠시 끄기'를 누르면 그때까지 휴대폰 알림만 쉬어요 (받은 목록에는 그대로 쌓여요)
--    급한 사유(잠금 풀림·누가 가져가려 함·만지고 있음)와 발견 제보는 끄지 않아요.
-- 4) reports_push(): 사유가 있으면 사유에 맞는 제목으로 알려요.
-- 여러 번 실행해도 안전해요.

alter table public.reports add column if not exists reason text;
alter table public.reports add column if not exists notice_count int not null default 1;
alter table public.reports add column if not exists reporter_device text check (char_length(reporter_device) <= 64);
alter table public.vehicles add column if not exists notice_muted_until timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'reports_reason_check') then
    alter table public.reports add constraint reports_reason_check check (reason is null or reason in (
      'move', 'entrance', 'no_parking', 'long_parked',
      'fallen', 'rain', 'flat', 'broken', 'light_on', 'key_left', 'item_left',
      'unlocked', 'taking', 'tampering',
      'nice', 'other'));
  end if;
end;
$$;
create index if not exists reports_notice_idx on public.reports (vehicle_id, reason, created_at desc) where reason is not null;

-- 사유 이름 (알림 제목·받은 목록에 쓰는 말). 화면 쪽 목록은 src/lib/notices.ts 와 같아요.
create or replace function public.notice_label(p_reason text)
returns text
language sql immutable as $$
  select case p_reason
    when 'move' then '🚧 통행에 방해돼요'
    when 'entrance' then '🚪 출입구·통로를 막고 있어요'
    when 'no_parking' then '🚫 주차 금지 구역이에요'
    when 'long_parked' then '🕸️ 오래 세워 둔 것 같아요'
    when 'fallen' then '↘️ 넘어져 있어요'
    when 'rain' then '🌧️ 비를 맞고 있어요'
    when 'flat' then '🛞 타이어 바람이 빠졌어요'
    when 'broken' then '🔧 부품이 망가졌거나 떨어졌어요'
    when 'light_on' then '💡 라이트가 켜져 있어요'
    when 'key_left' then '🔑 열쇠·배터리가 꽂혀 있어요'
    when 'item_left' then '🎒 헬멧·가방을 두고 갔어요'
    when 'unlocked' then '🔓 잠금이 풀려 있어요'
    when 'taking' then '🚨 누가 가져가려는 것 같아요'
    when 'tampering' then '⚠️ 누가 자물쇠·부품을 만지고 있어요'
    when 'nice' then '👍 멋있어요!'
    else '💬 알려 드릴 게 있어요'
  end;
$$;

create or replace function public.notice_urgent(p_reason text)
returns boolean
language sql immutable as $$
  select p_reason in ('unlocked', 'taking', 'tampering');
$$;

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
revoke execute on function public.send_bike_notice(text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.send_bike_notice(text, text, text, text, text, text) to anon, authenticated;

-- 주인: QR 알림 잠시 끄기 (p_hours 0이면 다시 켜기, 최대 7일)
create or replace function public.set_notice_mute(p_vehicle uuid, p_hours int)
returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  v_until timestamptz := case when coalesce(p_hours, 0) <= 0 then null else now() + make_interval(hours => least(p_hours, 168)) end;
begin
  update public.vehicles set notice_muted_until = v_until
   where id = p_vehicle and owner_id = auth.uid() and deleted_at is null;
  if not found then raise exception '내 이동수단만 바꿀 수 있어요.'; end if;
  return v_until;
end;
$$;
revoke execute on function public.set_notice_mute(uuid, int) from public, anon, authenticated;
grant execute on function public.set_notice_mute(uuid, int) to authenticated;

-- 알림: 사유가 있으면 사유에 맞는 제목으로 (008의 reports_push 최신본)
create or replace function public.reports_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
begin
  select id, owner_id, name, notice_muted_until into v from public.vehicles where id = new.vehicle_id;
  if v.id is null then
    return null;
  end if;
  if new.reason is not null then
    -- 주인이 잠시 꺼 둔 동안은 급하지 않은 알림은 휴대폰으로 보내지 않아요 (받은 목록에는 남아요)
    if v.notice_muted_until > now() and not public.notice_urgent(new.reason) then
      return null;
    end if;
    perform public.send_push(
      v.owner_id,
      case when public.notice_urgent(new.reason) then '🚨 [급해요] ' || v.name else v.name end || ' · ' || public.notice_label(new.reason),
      coalesce(nullif(btrim(substr(new.description, char_length(public.notice_label(new.reason)) + 4)), ''), 'QR을 찍은 분이 알려 줬어요. 눌러서 확인해 보세요.'),
      '/vehicles/' || v.id || '/reports#r-' || new.id,
      -- 급한 알림은 따로 울리고, 나머지는 사유별로 묶어요
      'notice-' || v.id || '-' || new.reason,
      'reports'
    );
    return null;
  end if;
  perform public.send_push(
    v.owner_id,
    case when new.kind = 'contact' then '💬 ' || v.name || ' 연락 요청이 왔어요'
         else '🚨 ' || v.name || ' 발견 제보가 왔어요' end,
    concat_ws(' · ', '📍 ' || new.location_text, left(new.description, 100)),
    '/vehicles/' || v.id || '/reports',
    -- 같은 이동수단 제보는 알림 하나로 묶고 새로 올 때마다 다시 울려요 (도배 방지)
    'report-' || v.id,
    'reports'
  );
  return null;
exception when others then
  raise notice 'reports_push 실패: %', sqlerrm;
  return null;
end;
$$;
drop trigger if exists reports_push on public.reports;
create trigger reports_push after insert on public.reports
  for each row execute function public.reports_push();
