-- =====================================================================
-- B-LOCK 7차: 관리자 운영 통계 (005 다음에 실행, 여러 번 실행해도 안전)
--   - 관리자 홈(/admin)에서 가입자·이동수단·스티커·분실 글·발견 제보·라이딩 숫자와 최근 8주 추이를 한 번에 봐요
--   - 테이블마다 RLS로 '본인 것만' 보이게 막혀 있어서, 관리자만 부를 수 있는 함수 하나로 '개수'만 모아 돌려줘요
--     (닉네임·이메일·위치 같은 개인정보는 하나도 담지 않음)
-- =====================================================================

-- 주별 묶음에 쓰는 시각 열 (데이터가 늘어도 최근 8주만 빨리 찾도록)
create index if not exists profiles_created_idx on public.profiles (created_at);
create index if not exists reports_created_idx on public.reports (created_at);
create index if not exists rides_started_idx on public.rides (started_at);

create or replace function public.admin_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  -- 이번 주 월요일 (한국 시간). date_trunc('week')는 ISO 기준이라 항상 월요일에 시작해요.
  v_week0 date := date_trunc('week', now() at time zone 'Asia/Seoul')::date;
  -- 8주 전 월요일 0시 (한국 시간) → 주별 집계는 이 시각 뒤 데이터만 봐요
  v_from timestamptz;
  v_weekly jsonb;
  v_batches jsonb;
  v_result jsonb;
begin
  -- security definer 라 RLS를 건너뛰므로, 관리자인지 여기서 직접 확인해요
  if auth.uid() is null or not exists (select 1 from public.profiles where id = auth.uid() and is_admin) then
    raise exception '관리자만 볼 수 있어요.';
  end if;

  v_from := (v_week0 - 49)::timestamp at time zone 'Asia/Seoul';

  -- 1) 최근 8주 추이: 주 목록을 generate_series 로 먼저 만들어서 아무 일도 없던 주도 0으로 보여요
  with weeks as (
    select v_week0 - 7 * g as week_start
    from generate_series(7, 0, -1) as g
  ),
  signups as (
    select date_trunc('week', created_at at time zone 'Asia/Seoul')::date as wk, count(*) as n
    from public.profiles
    where created_at >= v_from
    group by 1
  ),
  lost as (
    select date_trunc('week', created_at at time zone 'Asia/Seoul')::date as wk, count(*) as n
    from public.lost_posts
    where deleted_at is null and created_at >= v_from
    group by 1
  ),
  -- '찾았어요'로 바꾼 시각을 따로 저장하지 않아서, 회수 완료 글의 마지막 수정 시각(updated_at)으로 셉니다.
  -- 주의: lost_posts_before_write 가 댓글 수가 바뀔 때도 updated_at 을 새로 찍어서,
  --       회수 뒤에 글을 고치거나 댓글이 달리면 그 주로 옮겨져요. (정확히 하려면 resolved_at 열이 필요)
  resolved as (
    select date_trunc('week', updated_at at time zone 'Asia/Seoul')::date as wk, count(*) as n
    from public.lost_posts
    where deleted_at is null and status = 'resolved' and updated_at >= v_from
    group by 1
  ),
  ride_weeks as (
    select date_trunc('week', started_at at time zone 'Asia/Seoul')::date as wk, count(*) as n
    from public.rides
    where started_at >= v_from
    group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'week_start', w.week_start,
           'signups', coalesce(s.n, 0),
           'lost_posts', coalesce(l.n, 0),
           'resolved_posts', coalesce(r.n, 0),
           'rides', coalesce(rw.n, 0)
         ) order by w.week_start), '[]'::jsonb)
    into v_weekly
  from weeks w
  left join signups s on s.wk = w.week_start
  left join lost l on l.wk = w.week_start
  left join resolved r on r.wk = w.week_start
  left join ride_weeks rw on rw.wk = w.week_start;

  -- 2) 스티커 묶음별 등록 수 (최근 100묶음, 새 묶음 먼저)
  --    등록 해제한 스티커는 지워지므로, 지금 이동수단에 붙어 있는 스티커만 '등록'으로 셉니다
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', b.id,
           'label', b.label,
           'quantity', b.quantity,
           'claimed', coalesce(c.n, 0),
           'created_at', b.created_at
         ) order by b.created_at desc), '[]'::jsonb)
    into v_batches
  from (
    select id, label, quantity, created_at
    from public.sticker_batches
    order by created_at desc
    limit 100
  ) b
  left join (
    select batch_id, count(*) as n
    from public.stickers
    where vehicle_id is not null and batch_id is not null
    group by batch_id
  ) c on c.batch_id = b.id;

  -- 3) 전체 숫자: 테이블마다 한 번만 읽고 filter 로 나눠 셉니다
  select jsonb_build_object(
           'generated_at', now(),
           'users_total', u.n_total,
           'users_7d', u.n_7d,
           'vehicles_total', v.n_total,
           'vehicles_by_type', jsonb_build_object('bicycle', v.n_bicycle, 'kickboard', v.n_kickboard, 'other', v.n_other),
           'vehicles_searching', v.n_searching,
           'vehicles_recovered', v.n_recovered,
           'stickers_total', st.n_total,
           'stickers_claimed', st.n_claimed,
           'batches', v_batches,
           'posts_total', p.n_total,
           'posts_open', p.n_open,
           'posts_resolved', p.n_resolved,
           'recovery_rate', case when p.n_total > 0 then round(p.n_resolved::numeric / p.n_total, 4) end,
           'finder_reports_total', rp.n_total,
           'finder_reports_7d', rp.n_7d,
           'comments_total', c.n_total,
           'rides_total', rd.n_total,
           'rides_km_total', rd.km_total,
           'riders_30d', rd.n_riders_30d,
           'weekly', v_weekly
         )
    into v_result
  from
    (select count(*) as n_total,
            count(*) filter (where created_at > now() - interval '7 days') as n_7d
       from public.profiles) u,
    (select count(*) as n_total,
            count(*) filter (where type = 'bicycle') as n_bicycle,
            count(*) filter (where type = 'kickboard') as n_kickboard,
            count(*) filter (where type = 'other') as n_other,
            count(*) filter (where status = 'searching') as n_searching,
            count(*) filter (where status = 'recovered') as n_recovered
       from public.vehicles
      where deleted_at is null) v,
    (select count(*) as n_total,
            count(*) filter (where vehicle_id is not null) as n_claimed
       from public.stickers) st,
    (select count(*) as n_total,
            count(*) filter (where status = 'open') as n_open,
            count(*) filter (where status = 'resolved') as n_resolved
       from public.lost_posts
      where deleted_at is null) p,
    (select count(*) as n_total,
            count(*) filter (where created_at > now() - interval '7 days') as n_7d
       from public.reports) rp,
    (select count(*) as n_total
       from public.post_comments
      where deleted_at is null) c,
    (select count(*) as n_total,
            round((coalesce(sum(distance_m), 0) / 1000)::numeric, 1) as km_total,
            count(distinct owner_id) filter (where started_at > now() - interval '30 days') as n_riders_30d
       from public.rides) rd;

  return v_result;
end;
$$;

-- Supabase 는 새 함수를 anon·authenticated 에 기본으로 열어 두므로 모두 닫고, 로그인한 사람만 부를 수 있게 (관리자 확인은 함수 안에서)
revoke execute on function public.admin_stats() from public, anon, authenticated;
grant execute on function public.admin_stats() to authenticated;
