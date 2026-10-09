-- 029: 개인 맞춤 설정
-- 1) 사례금: 1천 원 단위로 1천~100만 원까지 직접 정해요 (예전: 5천 원 단위 5천~5만 원)
-- 2) 가림 장소 반경: 100m~3km 사이 아무 값 (예전: 200·300·500·1000m 중에서)
-- 3) 공유할 때 출발·도착 근처를 가리는 거리: 0~1km (기본 300m), set_share_trim()
-- 여러 번 실행해도 안전해요.

alter table public.theft_alerts drop constraint if exists theft_alerts_bounty_amount_check;
alter table public.theft_alerts add constraint theft_alerts_bounty_amount_check
  check (bounty_amount is null or (bounty_amount between 1000 and 1000000 and bounty_amount % 1000 = 0));

-- 알림 문구: 금액을 그대로 (예: 사례금 35,000원)
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
              || case when p_bounty is not null then ' · 사례금 ' || to_char(p_bounty, 'FM9,999,999') || '원' else '' end
              || '. 비슷한 걸 보면 알려 주세요.';
    perform public.send_push(r.id, v_title, v_body, '/alerts/' || v_id, 'alert-' || v_id, 'all');
    v_sent := v_sent + 1;
  end loop;
  update public.theft_alerts set recipients = v_sent where id = v_id;
  return json_build_object('alert_id', v_id, 'recipients', v_sent, 'radius_m', v_radius);
end;
$$;

alter table public.privacy_zones drop constraint if exists privacy_zones_radius_m_check;
alter table public.privacy_zones add constraint privacy_zones_radius_m_check check (radius_m between 100 and 3000);

alter table public.profiles add column if not exists share_trim_m int not null default 300 check (share_trim_m between 0 and 1000);

create or replace function public.set_share_trim(p_m int)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception '로그인이 필요해요.';
  end if;
  if p_m is null or p_m < 0 or p_m > 1000 then
    raise exception '0~1000m 사이로 정해 주세요.';
  end if;
  update public.profiles set share_trim_m = p_m where id = auth.uid();
end;
$$;
revoke execute on function public.set_share_trim(int) from public, anon;
grant execute on function public.set_share_trim(int) to authenticated;
