-- 026: 판매 글 비교 넓히기
-- 1) 도난 경보(72시간)가 끝나도 주인이 아직 '찾는 중'인 이동수단은 계속 비교해요
-- 2) 브랜드를 한글·영어 어느 쪽으로 적어도 같은 브랜드로 봐요 (삼천리 = samchuly 등)
-- 링크: 가장 최근 도난 경보 → 없으면 열린 분실 글
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
    (array['리브', 'liv']),
    (array['스페셜라이즈드', '스페셜', 'specialized']),
    (array['트렉', 'trek']),
    (array['캐논데일', 'cannondale']),
    (array['메리다', 'merida']),
    (array['스캇', '스콧', 'scott']),
    (array['비앙키', 'bianchi']),
    (array['브롬톤', 'brompton']),
    (array['턴', 'tern']),
    (array['다혼', 'dahon']),
    (array['콜나고', 'colnago']),
    (array['피나렐로', 'pinarello']),
    (array['써벨로', '서벨로', 'cervelo']),
    (array['캐니언', '캐년', 'canyon']),
    (array['큐브', 'cube']),
    (array['엘파마', 'elfama']),
    (array['나인봇', '세그웨이', 'ninebot', 'segway']),
    (array['샤오미', 'xiaomi']),
    (array['카카오', 'kakao']),
    (array['듀얼트론', 'dualtron']),
    (array['인모션', 'inmotion']),
    (array['퀄리스포츠', '퀄리', 'qualisports'])
  )
  select coalesce(
    (select g.names from groups g, b where b.k = any (g.names) limit 1),
    array[(select k from b)]
  );
$$;
revoke execute on function public.brand_aliases(text) from public, anon, authenticated;

create or replace function public.match_stolen_listing(p_text text)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_t text := lower(regexp_replace(left(coalesce(p_text, ''), 4000), '[\s\-_.]', '', 'g'));
  v_out json;
begin
  if char_length(v_t) < 2 then
    return '[]'::json;
  end if;
  with c as (
    select v.id as vehicle_id, v.type, v.brand, v.model, v.color, v.image_path,
           public.brand_aliases(v.brand) as bs,
           lower(regexp_replace(coalesce(v.model, ''), '[\s\-_.]', '', 'g')) as m,
           lower(regexp_replace(coalesce(v.color, ''), '\s', '', 'g')) as co,
           a.id as alert_id, a.lost_at, a.place_label, a.bounty_amount, a.status as alert_status,
           (select p.id from public.lost_posts p
             where p.vehicle_id = v.id and p.deleted_at is null and p.status = 'open'
             order by p.created_at desc limit 1) as post_id
      from public.vehicles v
      left join lateral (
        select * from public.theft_alerts t where t.vehicle_id = v.id and t.status in ('open', 'expired')
         order by t.created_at desc limit 1
      ) a on true
     where v.status = 'searching' and v.deleted_at is null
  ), s as (
    select c.*,
           exists (select 1 from unnest(bs) x where char_length(x) >= 2 and position(x in v_t) > 0) as hit_b,
           (char_length(m) >= 3 and position(m in v_t) > 0) as hit_m,
           (char_length(co) >= 2 and position(co in v_t) > 0) as hit_c
      from c
  )
  select coalesce(json_agg(json_build_object(
           'alert_id', alert_id, 'post_id', post_id, 'lost_at', lost_at, 'place_label', place_label, 'bounty_amount', bounty_amount,
           'alert_open', alert_status = 'open',
           'vehicle', json_build_object('type', type, 'brand', brand, 'model', model, 'color', color, 'image_path', image_path),
           'matched', array_remove(array[case when hit_b then 'brand' end, case when hit_m then 'model' end, case when hit_c then 'color' end], null)
         ) order by (hit_m::int * 3 + hit_b::int * 2 + hit_c::int) desc, lost_at desc nulls last), '[]'::json)
    into v_out
    from (select * from s where hit_m or (hit_b and hit_c)
           order by (hit_m::int * 3 + hit_b::int * 2 + hit_c::int) desc, lost_at desc nulls last limit 5) x;
  return v_out;
end;
$$;
revoke execute on function public.match_stolen_listing(text) from public;
grant execute on function public.match_stolen_listing(text) to anon, authenticated;
