-- 038: 회원이 알려 주는 장소를 공기주입기뿐 아니라 보관소·수리대까지
-- add_bike_spot_v2(): p_kind = 'pump'(공기주입기) | 'parking'(보관소) | 'repair'(수리대)
--   보관소는 보관 대수(선택)·지붕 여부, 함께 있는 것(공기주입기·수리대)도 고를 수 있어요.
--   하루 10곳까지, 이용 제한 중이면 안 돼요. (031의 add_bike_spot은 예전 화면을 위해 그대로 둬요)
-- 여러 번 실행해도 안전해요.

create or replace function public.add_bike_spot_v2(
  p_kind text, p_name text, p_lat double precision, p_lng double precision, p_note text default null,
  p_racks int default null, p_shade boolean default null, p_pump boolean default false, p_repair boolean default false
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_pump boolean := p_kind = 'pump' or coalesce(p_pump, false);
  v_id uuid;
begin
  if v_uid is null then
    raise exception '로그인이 필요해요.';
  end if;
  if p_kind not in ('pump', 'parking', 'repair') then
    raise exception '알려 줄 장소 종류를 골라 주세요.';
  end if;
  if exists (select 1 from public.profiles where id = v_uid and suspended_at is not null and (suspended_until is null or suspended_until > now())) then
    raise exception '지금은 이용이 제한되어 있어요.';
  end if;
  if char_length(v_name) < 1 or char_length(v_name) > 80 then
    raise exception '장소 이름을 1~80자로 적어 주세요.';
  end if;
  if char_length(v_note) > 200 then
    raise exception '설명은 200자까지 쓸 수 있어요.';
  end if;
  if p_racks is not null and p_racks not between 1 and 1000 then
    raise exception '보관 대수는 1~1000대로 적어 주세요.';
  end if;
  if p_lat is null or p_lng is null or p_lat not between 33 and 39 or p_lng not between 124 and 132 then
    raise exception '국내 위치를 골라 주세요.';
  end if;
  if (select count(*) from public.bike_spots where created_by = v_uid and created_at > now() - interval '1 day') >= 10 then
    raise exception '하루에 10곳까지 알려 줄 수 있어요.';
  end if;
  insert into public.bike_spots (source, name, lat, lng, is_parking, racks, has_shade, has_pump, has_repair, note, created_by, ok_count, last_ok_at)
  values ('user', v_name, p_lat, p_lng, p_kind = 'parking', case when p_kind = 'parking' then p_racks end,
          case when p_kind = 'parking' then p_shade end, v_pump, p_kind = 'repair' or coalesce(p_repair, false), v_note, v_uid,
          case when v_pump then 1 else 0 end, case when v_pump then now() end)
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.add_bike_spot_v2(text, text, double precision, double precision, text, int, boolean, boolean, boolean) from public, anon, authenticated;
grant execute on function public.add_bike_spot_v2(text, text, double precision, double precision, text, int, boolean, boolean, boolean) to authenticated;
