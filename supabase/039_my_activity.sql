-- 039: MY '나의 B-LOCK 활동' (1단계) + 받은 제보에 '도움이 됐어요'
-- 1) reports.thanked_at: 주인이 QR 발견 제보·알림에 '도움이 됐어요'를 누른 시각 (로그인한 제보자에게 알림)
--    thank_report(): 주인만, 한 번만 (취소 가능)
-- 2) my_activity(): 내 활동 숫자 (본인 것만)
--    helped    도와준 횟수     = 내가 보낸 QR 제보·알림 + 도난 경보 목격 제보
--    thanked   고맙다는 인정   = 주인이 '도움이 됐어요' 누른 QR 제보 + '도움 됨'으로 표시된 목격 제보
--    returned  되찾아 준 수    = 내가 발견 제보를 보낸 뒤 30일 안에 주인이 되찾은 이동수단 + 내가 도와서 끝난 도난 경보
--    recovered 되찾은 내 이동수단 (잃어버린 횟수는 일부러 보여 주지 않아요)
--    ride_km / ride_count 라이딩
-- 여러 번 실행해도 안전해요.

alter table public.reports add column if not exists thanked_at timestamptz;

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
revoke execute on function public.thank_report(uuid, boolean) from public, anon, authenticated;
grant execute on function public.thank_report(uuid, boolean) to authenticated;

create or replace function public.my_activity()
returns json
language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return null;
  end if;
  return json_build_object(
    'helped',
      (select count(*) from public.reports where reporter_id = v_uid)
      + (select count(*) from public.sightings where reporter_id = v_uid),
    'thanked',
      (select count(*) from public.reports where reporter_id = v_uid and thanked_at is not null)
      + (select count(*) from public.sightings s where s.reporter_id = v_uid
           and (s.status = 'useful' or exists (select 1 from public.alert_rewards ar where ar.sighting_id = s.id))),
    'returned',
      (select count(distinct x.vid) from (
         select r.vehicle_id as vid from public.reports r join public.vehicles v on v.id = r.vehicle_id
          where r.reporter_id = v_uid and r.kind = 'found'
            and v.last_recovered_at > r.created_at and v.last_recovered_at < r.created_at + interval '30 days'
         union
         select a.vehicle_id from public.theft_alerts a
          where a.status = 'resolved'
            and exists (select 1 from public.sightings s where s.alert_id = a.id and s.reporter_id = v_uid
                          and (s.status = 'useful' or exists (select 1 from public.alert_rewards ar where ar.sighting_id = s.id)))
       ) x),
    'recovered', (select count(*) from public.vehicles where owner_id = v_uid and deleted_at is null and last_recovered_at is not null),
    'vehicles', (select count(*) from public.vehicles where owner_id = v_uid and deleted_at is null),
    'ride_m', (select coalesce(sum(distance_m), 0) from public.rides where owner_id = v_uid),
    'ride_count', (select count(*) from public.rides where owner_id = v_uid),
    'since', (select created_at from public.profiles where id = v_uid)
  );
end;
$$;
revoke execute on function public.my_activity() from public, anon, authenticated;
grant execute on function public.my_activity() to authenticated;
