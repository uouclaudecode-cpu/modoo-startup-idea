-- 030: 점검 반영
-- 1) 판매 글 비교 헛경고 줄이기
--    - 브랜드는 단어 경계에서만 (예: '카카오톡'·'퀄리티'·'올리브'·'delivery'·'trekking'에 걸리지 않게)
--    - 흔한 낱말과 겹치는 별칭(카카오·퀄리·리브·liv)은 빼요
--    - 짧은 모델명(5글자 미만, 숫자뿐)은 브랜드도 같아야 경고
--    - 색상도 하이픈·점을 같은 방식으로 지워 비교
--    - 관리자가 숨긴 경보의 이동수단은 보여 주지 않아요
-- 2) 관리자 구역 통계: 되찾은 이동수단을 한 번만 세는 'recovered'
-- 여러 번 실행해도 안전해요.

create or replace function public.brand_aliases(p_brand text)
returns text[]
language sql immutable set search_path = public as $$
  with b as (select lower(regexp_replace(coalesce(p_brand, ''), '[\s\-_.]', '', 'g')) as k),
  groups(names) as (values
    (array['삼천리', 'samchuly', 'samchully', '삼천리자전거']),
    (array['첼로', 'cello']),
    (array['알톤', 'alton']),
    (array['자이언트', 'giant']),
    (array['스페셜라이즈드', 'specialized']),
    (array['트렉', 'trek']),
    (array['캐논데일', 'cannondale']),
    (array['메리다', 'merida']),
    (array['스캇', '스콧', 'scott']),
    (array['비앙키', 'bianchi']),
    (array['브롬톤', 'brompton']),
    (array['tern']),
    (array['다혼', 'dahon']),
    (array['콜나고', 'colnago']),
    (array['피나렐로', 'pinarello']),
    (array['써벨로', '서벨로', 'cervelo']),
    (array['캐니언', '캐년', 'canyon']),
    (array['큐브', 'cube']),
    (array['엘파마', 'elfama']),
    (array['나인봇', '세그웨이', 'ninebot', 'segway']),
    (array['샤오미', 'xiaomi']),
    (array['듀얼트론', 'dualtron']),
    (array['인모션', 'inmotion']),
    (array['퀄리스포츠', 'qualisports'])
  )
  select coalesce(
    (select g.names from groups g, b where b.k = any (g.names) limit 1),
    array[(select k from b)]
  );
$$;
revoke execute on function public.brand_aliases(text) from public, anon, authenticated;

-- 글(공백 유지)에 낱말이 단어 경계에서 나오는지
--   영문·숫자: 앞뒤 모두 경계 / 한글: 앞만 경계 (뒤에는 조사가 붙어요)
create or replace function public.listing_has_word(p_text text, p_word text)
returns boolean
language sql immutable set search_path = public as $$
  select case
    when p_word is null or char_length(p_word) < 2 then false
    when p_word ~ '^[a-z0-9]+$' then p_text ~ ('(^|[^a-z0-9])' || p_word || '($|[^a-z0-9])')
    when p_word ~ '^[가-힣a-z0-9]+$' then p_text ~ ('(^|[^가-힣])' || p_word)
    else position(p_word in p_text) > 0
  end;
$$;
revoke execute on function public.listing_has_word(text, text) from public, anon, authenticated;

create or replace function public.match_stolen_listing(p_text text)
returns json
language plpgsql security definer set search_path = public as $$
declare
  -- 공백 유지(단어 경계용) / 공백 제거(모델명용)
  v_sp text := regexp_replace(regexp_replace(lower(left(coalesce(p_text, ''), 4000)), '[\-_.]', '', 'g'), '[^0-9a-z가-힣]+', ' ', 'g');
  v_ns text := replace(v_sp, ' ', '');
  v_out json;
begin
  if char_length(v_ns) < 2 then
    return '[]'::json;
  end if;
  with c as (
    select v.id as vehicle_id, v.type, v.brand, v.model, v.color, v.image_path,
           public.brand_aliases(v.brand) as bs,
           lower(regexp_replace(coalesce(v.model, ''), '[\s\-_.]', '', 'g')) as m,
           lower(regexp_replace(coalesce(v.color, ''), '[\s\-_.]', '', 'g')) as co,
           a.id as alert_id, a.lost_at, a.place_label, a.bounty_amount, a.status as alert_status,
           (select p.id from public.lost_posts p
             where p.vehicle_id = v.id and p.deleted_at is null and p.status = 'open'
             order by p.created_at desc limit 1) as post_id
      from public.vehicles v
      left join lateral (
        select * from public.theft_alerts t where t.vehicle_id = v.id
         order by t.created_at desc limit 1
      ) a on true
     where v.status = 'searching' and v.deleted_at is null
       and (a.id is null or a.status <> 'hidden')
  ), s as (
    select c.*,
           exists (select 1 from unnest(bs) x where public.listing_has_word(v_sp, x)) as hit_b,
           (char_length(m) >= 3 and position(m in v_ns) > 0) as hit_m,
           (char_length(m) >= 5 and m !~ '^[0-9]+[a-z]?$') as strong_m,
           (char_length(co) >= 2 and position(co in v_ns) > 0) as hit_c
      from c
  ), hits as (
    select *, (hit_m::int * 3 + hit_b::int * 2 + hit_c::int) as score
      from s
     where (hit_m and strong_m) or (hit_m and hit_b) or (hit_b and hit_c)
     order by score desc, lost_at desc nulls last
     limit 5
  )
  select coalesce(json_agg(json_build_object(
           'alert_id', case when alert_status in ('open', 'expired') then alert_id end,
           'post_id', post_id, 'lost_at', lost_at, 'place_label', place_label, 'bounty_amount', bounty_amount,
           'alert_open', alert_status = 'open',
           'vehicle', json_build_object('type', type, 'brand', brand, 'model', model, 'color', color, 'image_path', image_path),
           'matched', array_remove(array[case when hit_b then 'brand' end, case when hit_m then 'model' end, case when hit_c then 'color' end], null)
         ) order by score desc, lost_at desc nulls last), '[]'::json)
    into v_out
    from hits;
  return v_out;
end;
$$;
revoke execute on function public.match_stolen_listing(text) from public;
grant execute on function public.match_stolen_listing(text) to anon, authenticated;

create or replace function public.admin_area_stats()
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_out json;
begin
  if not public.is_admin() then
    raise exception '관리자만 볼 수 있어요.';
  end if;
  select coalesce(json_agg(json_build_object(
    'id', a.id, 'name', a.name, 'note', a.note, 'lat', a.lat, 'lng', a.lng, 'radius_m', a.radius_m, 'created_at', a.created_at,
    'active_vehicles', (
      select count(distinct vid) from (
        select p.vehicle_id as vid from public.parking_spots p
         where public.distance_m(a.lat, a.lng, p.lat, p.lng) <= a.radius_m
        union
        select r.vehicle_id from public.rides r
         where r.vehicle_id is not null and jsonb_array_length(r.path) > 0
           and public.distance_m(a.lat, a.lng, (r.path -> 0 ->> 0)::float8, (r.path -> 0 ->> 1)::float8) <= a.radius_m
      ) u
      join public.vehicles v on v.id = u.vid and v.deleted_at is null
    ),
    'rides_30d', (
      select count(*) from public.rides r
       where r.started_at > now() - interval '30 days' and jsonb_array_length(r.path) > 0
         and public.distance_m(a.lat, a.lng, (r.path -> 0 ->> 0)::float8, (r.path -> 0 ->> 1)::float8) <= a.radius_m
    ),
    'alerts_total', (select count(*) from public.theft_alerts t where t.status <> 'hidden' and public.distance_m(a.lat, a.lng, t.lat, t.lng) <= a.radius_m),
    'alerts_30d', (select count(*) from public.theft_alerts t where t.status <> 'hidden' and t.created_at > now() - interval '30 days' and public.distance_m(a.lat, a.lng, t.lat, t.lng) <= a.radius_m),
    'alerts_resolved', (select count(*) from public.theft_alerts t where t.status = 'resolved' and public.distance_m(a.lat, a.lng, t.lat, t.lng) <= a.radius_m),
    'lost_posts', (select count(*) from public.lost_posts l where l.deleted_at is null and l.lost_lat is not null and public.distance_m(a.lat, a.lng, l.lost_lat, l.lost_lng) <= a.radius_m),
    'lost_resolved', (select count(*) from public.lost_posts l where l.deleted_at is null and l.status = 'resolved' and l.lost_lat is not null and public.distance_m(a.lat, a.lng, l.lost_lat, l.lost_lng) <= a.radius_m),
    'finder_reports', (select count(*) from public.reports rp where rp.latitude is not null and public.distance_m(a.lat, a.lng, rp.latitude, rp.longitude) <= a.radius_m),
    'finder_reports_30d', (select count(*) from public.reports rp where rp.latitude is not null and rp.created_at > now() - interval '30 days' and public.distance_m(a.lat, a.lng, rp.latitude, rp.longitude) <= a.radius_m),
    -- 되찾은 이동수단 수: 경보 회수와 분실 글 해결이 같은 이동수단이면 한 번만 세요
    'recovered', (
      select count(*) from (
        select t.vehicle_id::text as k from public.theft_alerts t
         where t.status = 'resolved' and public.distance_m(a.lat, a.lng, t.lat, t.lng) <= a.radius_m
        union
        select coalesce(l.vehicle_id::text, 'post:' || l.id::text) from public.lost_posts l
         where l.deleted_at is null and l.status = 'resolved' and l.lost_lat is not null
           and public.distance_m(a.lat, a.lng, l.lost_lat, l.lost_lng) <= a.radius_m
      ) r
    ),
    'sticker_spots', (select count(*) from public.sticker_spots s where s.active and public.distance_m(a.lat, a.lng, s.lat, s.lng) <= a.radius_m)
  ) order by a.created_at), '[]'::json)
  into v_out
  from public.admin_areas a;
  return v_out;
end;
$$;
revoke execute on function public.admin_area_stats() from public, anon;
grant execute on function public.admin_area_stats() to authenticated;
