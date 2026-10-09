-- 025: 중고 매물 확인 · 안심거래 화면에 정비 이력 보이기
-- 1) match_stolen_listing(p_text): 판매 글(제목·설명)과 지금 수색 중인 도난 경보를 브랜드·모델·색상으로 비교
-- 2) get_trade_verification: 정비 기록 최근 6건(항목·달·그때까지 거리·정비한 곳)과 소모품 상태를 함께 돌려줘요
--    (비용·메모는 보여 주지 않아요)
-- 여러 번 실행해도 안전해요.

create or replace function public.match_stolen_listing(p_text text)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_t text := lower(regexp_replace(left(coalesce(p_text, ''), 4000), '\s', '', 'g'));
  v_out json;
begin
  if char_length(v_t) < 2 then
    return '[]'::json;
  end if;
  with c as (
    select a.id as alert_id, a.lost_at, a.place_label, a.bounty_amount,
           v.type, v.brand, v.model, v.color, v.image_path,
           lower(regexp_replace(coalesce(v.brand, ''), '\s', '', 'g')) as b,
           lower(regexp_replace(coalesce(v.model, ''), '\s', '', 'g')) as m,
           lower(regexp_replace(coalesce(v.color, ''), '\s', '', 'g')) as co
      from public.theft_alerts a
      join public.vehicles v on v.id = a.vehicle_id
     where a.status = 'open' and a.expires_at > now() and v.deleted_at is null
  ), s as (
    select c.*,
           (char_length(b) >= 2 and position(b in v_t) > 0) as hit_b,
           (char_length(m) >= 3 and position(m in v_t) > 0) as hit_m,
           (char_length(co) >= 2 and position(co in v_t) > 0) as hit_c
      from c
  )
  select coalesce(json_agg(json_build_object(
           'alert_id', alert_id, 'lost_at', lost_at, 'place_label', place_label, 'bounty_amount', bounty_amount,
           'vehicle', json_build_object('type', type, 'brand', brand, 'model', model, 'color', color, 'image_path', image_path),
           'matched', array_remove(array[case when hit_b then 'brand' end, case when hit_m then 'model' end, case when hit_c then 'color' end], null)
         ) order by (hit_m::int * 3 + hit_b::int * 2 + hit_c::int) desc, lost_at desc), '[]'::json)
    into v_out
    from (select * from s where hit_m or (hit_b and hit_c)
           order by (hit_m::int * 3 + hit_b::int * 2 + hit_c::int) desc, lost_at desc limit 5) x;
  return v_out;
end;
$$;
revoke execute on function public.match_stolen_listing(text) from public;
grant execute on function public.match_stolen_listing(text) to anon, authenticated;

create or replace function public.get_trade_verification(p_token text)
returns json
language plpgsql security definer set search_path = public as $$
declare
  l public.trade_links;
  v public.vehicles;
  v_nick text;
  v_member timestamptz;
  v_transfers int;
  v_sticker boolean;
  v_logs int;
  v_recent json;
  v_parts json;
  v_warn text[] := '{}';
begin
  select * into l from public.trade_links where token = p_token;
  if not found then
    return json_build_object('valid', false, 'reason', 'not_found');
  end if;
  select * into v from public.vehicles where id = l.vehicle_id;
  if v.id is null or v.deleted_at is not null then
    return json_build_object('valid', false, 'reason', 'deleted');
  end if;
  if v.owner_id <> l.owner_id then
    return json_build_object('valid', false, 'reason', 'transferred');
  end if;
  if l.revoked_at is not null then
    return json_build_object('valid', false, 'reason', 'revoked');
  end if;
  if l.expires_at <= now() then
    return json_build_object('valid', false, 'reason', 'expired');
  end if;
  if v.status = 'searching' then
    return json_build_object('valid', false, 'reason', 'flagged');
  end if;

  update public.trade_links set view_count = view_count + 1 where id = l.id;

  select p.nickname, p.created_at into v_nick, v_member from public.profiles p where p.id = v.owner_id;
  select count(*) into v_transfers from public.vehicle_ownership_history where vehicle_id = v.id and method = 'transfer';
  select exists (select 1 from public.stickers s where s.vehicle_id = v.id) into v_sticker;
  select count(*) into v_logs from public.maintenance_logs where vehicle_id = v.id;
  select coalesce(json_agg(x order by x.serviced_on desc), '[]'::json) into v_recent from (
    select kind, date_trunc('month', serviced_on)::date as serviced_on, round(distance_m)::bigint as distance_m, shop
      from public.maintenance_logs where vehicle_id = v.id
     order by serviced_on desc, created_at desc limit 6
  ) x;
  select coalesce(json_agg(json_build_object('kind', kind, 'interval_km', interval_km, 'interval_days', interval_days,
                                             'distance_m', round(distance_m)::bigint, 'last_serviced_at', last_serviced_at)), '[]'::json)
    into v_parts from public.vehicle_parts where vehicle_id = v.id and enabled;

  if v.created_at > now() - interval '14 days' then v_warn := array_append(v_warn, 'NEW_REGISTRATION'); end if;
  if v.owned_since > now() - interval '30 days' and v_transfers > 0 then v_warn := array_append(v_warn, 'RECENT_TRANSFER'); end if;
  if v.serial_hash is null then v_warn := array_append(v_warn, 'NO_SERIAL'); end if;

  return json_build_object(
    'valid', true,
    'vehicle', json_build_object('type', v.type, 'brand', v.brand, 'model', v.model, 'color', v.color, 'image_path', v.image_path),
    'registered_at', v.created_at,
    'owned_since', v.owned_since,
    'transfer_count', v_transfers,
    'searching_count', v.searching_count,
    'last_recovered_at', v.last_recovered_at,
    'serial_last4', v.serial_last4,
    'sticker_attached', v_sticker,
    'maintenance_count', v_logs,
    'maintenance_recent', v_recent,
    'parts', v_parts,
    'odometer_m', v.odometer_m,
    'seller', json_build_object('masked_nickname', public.mask_nickname(v_nick), 'member_since', v_member),
    'warnings', v_warn,
    'check_code', l.check_code,
    'expires_at', l.expires_at,
    'checked_at', now()
  );
end;
$$;
revoke execute on function public.get_trade_verification(text) from public;
grant execute on function public.get_trade_verification(text) to anon, authenticated;
