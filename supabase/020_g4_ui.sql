-- 020_g4_ui: QR을 찍은 사람에게 진행 중인 도난 경보를 이어 주기
-- (여러 번 실행해도 안전: create or replace)
--
-- 도난 경보가 걸린 이동수단의 QR을 찍으면 /scan 화면에서 '도난 경보 보기'와 약속한 사례금을 보여줘요.
-- 그래야 바로 옆에 있는 사람이 경보 화면에서 목격 제보를 남기고 사례금 대상이 될 수 있어요.
-- 돌려주는 것은 경보 번호와 사례금뿐이에요 (정확한 위치·소유자 정보 없음).
-- 경보 화면(get_alert)과 같은 기준: 진행 중(open)이고 기한이 남은 경보, 지운 이동수단 제외.
-- 숨김(hidden)·취소·만료·해결된 경보는 status가 'open'이 아니라서 자연히 빠져요.

create or replace function public.get_alert_by_token(p_token text)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object('alert_id', a.id, 'bounty_amount', a.bounty_amount)
    from public.theft_alerts a
    join public.vehicles v on v.id = a.vehicle_id
   where p_token ~ '^[A-Za-z0-9_-]{16,64}$'
     and v.id = public.resolve_vehicle(p_token)
     and v.deleted_at is null
     and a.status = 'open'
     and a.expires_at > now()
   order by a.created_at desc
   limit 1;
$$;

revoke execute on function public.get_alert_by_token(text) from public;
grant execute on function public.get_alert_by_token(text) to anon, authenticated;
