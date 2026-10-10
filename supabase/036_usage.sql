-- 036: 서비스별 사용량 보기 (/admin/usage) + 무료 한도 80%를 넘으면 관리자 알림
-- 1) api_usage: 바깥 서비스 호출 수를 날짜(한국 시간)별로 세요. (네이버 지도, 카카오 검색, 길찾기, 공공데이터 등)
--    bump_api_usage(): 사이트·화면이 부르는 숫자 올리기 (정해진 이름만, 한 번에 1000까지)
-- 2) admin_usage_stats(): 관리자만. 데이터베이스 크기, 사진 저장 용량(버킷별), 한 달 접속 회원 수, 호출 수
-- 3) check_usage_alerts(): 매일 아침 9시, 무료 한도의 80%를 넘은 항목이 있으면 관리자에게 알림 (같은 항목은 7일에 한 번)
-- 여러 번 실행해도 안전해요.

create table if not exists public.api_usage (
  service text not null check (service in ('naver_map', 'kakao_search', 'osm_search', 'routing', 'data_go_kr')),
  day     date not null default (now() at time zone 'Asia/Seoul')::date,
  count   bigint not null default 0,
  primary key (service, day)
);
alter table public.api_usage enable row level security;  -- 정책 없음: 함수로만 읽고 써요
revoke all on public.api_usage from anon, authenticated;

create or replace function public.bump_api_usage(p_service text, p_n int default 1)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_service not in ('naver_map', 'kakao_search', 'osm_search', 'routing', 'data_go_kr') or coalesce(p_n, 0) not between 1 and 1000 then
    return;
  end if;
  insert into public.api_usage (service, day, count) values (p_service, (now() at time zone 'Asia/Seoul')::date, p_n)
  on conflict (service, day) do update set count = public.api_usage.count + excluded.count;
end;
$$;
revoke execute on function public.bump_api_usage(text, int) from public, anon, authenticated;
grant execute on function public.bump_api_usage(text, int) to anon, authenticated;

-- 관리자: 사용량 한눈에
create or replace function public.admin_usage_stats()
returns json
language plpgsql stable security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_month date := date_trunc('month', now() at time zone 'Asia/Seoul')::date;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_admin) then
    raise exception '관리자만 볼 수 있어요.';
  end if;
  return json_build_object(
    'db_bytes', pg_database_size(current_database()),
    'storage', (select coalesce(json_agg(json_build_object('bucket', b, 'bytes', s, 'files', n) order by s desc), '[]'::json)
                  from (select bucket_id as b, sum(coalesce((metadata ->> 'size')::bigint, 0)) as s, count(*) as n
                          from storage.objects group by bucket_id) t),
    'storage_bytes', (select coalesce(sum(coalesce((metadata ->> 'size')::bigint, 0)), 0) from storage.objects),
    'mau', (select count(*) from auth.users where last_sign_in_at > now() - interval '30 days'),
    'users', (select count(*) from auth.users),
    'api', (select coalesce(json_object_agg(service, json_build_object(
                     'today', today, 'month', month, 'max_day', max_day)), '{}'::json)
              from (select service,
                           coalesce(sum(count) filter (where day = v_today), 0) as today,
                           coalesce(sum(count) filter (where day >= v_month), 0) as month,
                           coalesce(max(count) filter (where day >= v_month), 0) as max_day
                      from public.api_usage where day >= v_month - 1 group by service) a)
  );
end;
$$;
revoke execute on function public.admin_usage_stats() from public, anon, authenticated;
grant execute on function public.admin_usage_stats() to authenticated;

-- 80% 알림을 마지막으로 보낸 때 (항목별)
create table if not exists public.usage_alerts (
  item    text primary key,
  sent_at timestamptz not null default now()
);
alter table public.usage_alerts enable row level security;
revoke all on public.usage_alerts from anon, authenticated;

create or replace function public.check_usage_alerts()
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_items text[] := '{}';
  v_admin uuid;
  v_label text;
  r record;
begin
  -- 항목, 지금 값, 무료 한도, 이름
  for r in
    select * from (values
      ('db', pg_database_size(current_database())::numeric, 500 * 1024 * 1024::numeric, '데이터베이스 용량'),
      ('storage', (select coalesce(sum(coalesce((metadata ->> 'size')::bigint, 0)), 0) from storage.objects)::numeric, 1024 * 1024 * 1024::numeric, '사진 저장 용량'),
      ('mau', (select count(*) from auth.users where last_sign_in_at > now() - interval '30 days')::numeric, 50000::numeric, '한 달 접속 회원'),
      ('naver_map', (select coalesce(sum(count), 0) from public.api_usage where service = 'naver_map' and day = v_today - 1)::numeric, 6000000::numeric, '네이버 지도 (하루)'),
      ('data_go_kr', (select coalesce(sum(count), 0) from public.api_usage where service = 'data_go_kr' and day = v_today - 1)::numeric, 10000::numeric, '공공데이터 (하루)')
    ) as t(item, used, lim, label)
  loop
    if r.used >= r.lim * 0.8
       and not exists (select 1 from public.usage_alerts where item = r.item and sent_at > now() - interval '7 days') then
      v_items := v_items || (r.label || ' ' || round(r.used / r.lim * 100) || '%');
      insert into public.usage_alerts (item, sent_at) values (r.item, now())
      on conflict (item) do update set sent_at = now();
    end if;
  end loop;
  if array_length(v_items, 1) is null then
    return 0;
  end if;
  v_label := array_to_string(v_items, ', ');
  for v_admin in select id from public.profiles where is_admin loop
    perform public.send_push(v_admin, '📈 무료 한도의 80%를 넘었어요', left(v_label, 200), '/admin/usage', 'usage-alert', 'all');
  end loop;
  return array_length(v_items, 1);
end;
$$;
revoke execute on function public.check_usage_alerts() from public, anon, authenticated;

-- 매일 00:05 UTC = 한국 시간 오전 9시 5분
do $$
begin
  if exists (select 1 from cron.job where jobname = 'b-lock-usage-alerts') then
    perform cron.unschedule('b-lock-usage-alerts');
  end if;
  perform cron.schedule('b-lock-usage-alerts', '5 0 * * *', 'select public.check_usage_alerts()');
end;
$$;
