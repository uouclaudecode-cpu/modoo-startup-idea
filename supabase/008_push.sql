-- =====================================================================
-- B-LOCK 8차: 웹 푸시 알림 (앱을 닫아도 휴대폰으로 알림)
-- schema.sql → 002 → 003 → 004 → 005 다음에 실행하세요. (여러 번 실행해도 안전)
--   - 알림 받을 기기(브라우저) 목록과 알림 종류별 설정(발견 제보·댓글·정비)
--   - 제보·댓글이 저장되면 데이터베이스가 바로 /api/push 로 알림을 부탁 (pg_net)
--   - 매일 오전 9시(한국 시간) 점검·교체 시기가 새로 된 소모품을 알림 (pg_cron)
--   - 앱에는 서비스 키가 없어요. 데이터베이스와 /api/push 는 서로 아는 비밀값으로만 확인해요.
--
-- 실행한 뒤 할 일:
--   select secret from app_private.push_config;  → 이 값을 Vercel 환경변수 PUSH_WEBHOOK_SECRET 에 넣기
--   (주소가 바뀌면) update app_private.push_config set url = 'https://새주소/api/push';
-- =====================================================================

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

-- 1) 알림 받을 기기 ---------------------------------------------------------
-- endpoint 는 브라우저마다 하나라서 전체에서 하나만 (같은 기기에서 다른 계정으로 켜면 주인이 바뀜)
create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint    text not null unique check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  p256dh      text not null check (char_length(p256dh) between 1 and 200),
  auth        text not null check (char_length(auth) between 1 and 100),
  user_agent  text check (char_length(user_agent) <= 200),
  created_at  timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "owner reads push subscriptions" on public.push_subscriptions;
create policy "owner reads push subscriptions" on public.push_subscriptions for select to authenticated
  using (user_id = auth.uid());
drop policy if exists "owner inserts push subscriptions" on public.push_subscriptions;
create policy "owner inserts push subscriptions" on public.push_subscriptions for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists "owner deletes push subscriptions" on public.push_subscriptions;
create policy "owner deletes push subscriptions" on public.push_subscriptions for delete to authenticated
  using (user_id = auth.uid());

-- Supabase 기본 권한(모든 권한)을 걷어내고 필요한 것만
revoke all on public.push_subscriptions from anon, authenticated;
grant select, insert, delete on public.push_subscriptions to authenticated;

-- 알림 켜기: 같은 브라우저를 다른 계정이 쓰던 경우도 있어서 RLS 업서트 대신 함수로 주인을 넘겨요.
-- (endpoint 는 그 브라우저 안에서만 알 수 있는 값이라, 남의 기기를 가져올 수는 없어요)
create or replace function public.save_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception '로그인이 필요해요.';
  end if;
  if p_endpoint is null or p_endpoint !~ '^https://' or char_length(p_endpoint) > 1000
     or coalesce(char_length(p_p256dh), 0) not between 1 and 200
     or coalesce(char_length(p_auth), 0) not between 1 and 100 then
    raise exception '알림 정보가 올바르지 않아요. 알림을 다시 켜 주세요.';
  end if;

  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(nullif(btrim(coalesce(p_user_agent, '')), ''), 200))
  on conflict (endpoint) do update
    set user_id = excluded.user_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        user_agent = excluded.user_agent,
        created_at = now();

  -- 기기를 바꿀 때마다 쌓이지 않게 최근 10대만 남겨요.
  delete from public.push_subscriptions
   where user_id = auth.uid()
     and id not in (
       select s.id from public.push_subscriptions s
       where s.user_id = auth.uid()
       order by s.created_at desc
       limit 10
     );
end;
$$;

-- 2) 알림 종류별 설정 (프로필에 저장, 본인 프로필 수정 권한은 schema.sql 에 이미 있음) -----
alter table public.profiles add column if not exists notify_reports boolean not null default true;
alter table public.profiles add column if not exists notify_comments boolean not null default true;
alter table public.profiles add column if not exists notify_maintenance boolean not null default true;

-- 3) 앱 서버와 나누는 비밀값 (anon·authenticated 는 볼 수 없는 별도 스키마) -----------------
create schema if not exists app_private;
revoke all on schema app_private from public;
revoke all on schema app_private from anon, authenticated;

create table if not exists app_private.push_config (
  id      int primary key check (id = 1),
  secret  text not null,
  url     text not null
);
alter table app_private.push_config enable row level security;  -- 정책 없음: 소유자(함수)만 읽음
revoke all on app_private.push_config from public;
revoke all on app_private.push_config from anon, authenticated;

insert into app_private.push_config (id, secret, url)
values (1, encode(extensions.gen_random_bytes(32), 'hex'), 'https://b-lock-app.vercel.app/api/push')
on conflict (id) do nothing;

-- 4) 알림 보내기 (안에서만 씀) ----------------------------------------------
-- 설정을 끈 사람·기기가 없는 사람은 건너뛰고, 나머지는 /api/push 에 부탁해요.
-- 알림이 실패해도 제보·댓글 저장은 절대 막지 않도록 오류는 NOTICE 로만 남겨요.
create or replace function public.send_push(
  p_user uuid,
  p_title text,
  p_body text,
  p_url text,
  p_tag text,
  p_pref text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ok boolean;
  v_subs jsonb;
  v_cfg record;
begin
  if p_user is null then
    return;
  end if;

  select case p_pref
           when 'reports' then pr.notify_reports
           when 'comments' then pr.notify_comments
           when 'maintenance' then pr.notify_maintenance
           else true
         end
    into v_ok
    from public.profiles pr
   where pr.id = p_user;
  -- 프로필이 없으면 기본값(켜짐)으로 봐요.
  if v_ok is not null and not v_ok then
    return;
  end if;

  -- 최근 기기 20대까지 (/api/push 는 한 번에 50대까지 받아요)
  select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth) order by s.created_at desc)
    into v_subs
    from (
      select ps.endpoint, ps.p256dh, ps.auth, ps.created_at
      from public.push_subscriptions ps
      where ps.user_id = p_user
      order by ps.created_at desc
      limit 20
    ) s;
  if v_subs is null then
    return;
  end if;

  select c.secret, c.url into v_cfg from app_private.push_config c where c.id = 1;
  if v_cfg.url is null then
    raise notice 'send_push: app_private.push_config 가 비어 있어요.';
    return;
  end if;

  begin
    perform net.http_post(
      url := v_cfg.url,
      body := jsonb_build_object(
        'subscriptions', v_subs,
        'title', left(coalesce(p_title, ''), 100),
        'body', left(coalesce(p_body, ''), 300),
        'url', coalesce(p_url, '/'),
        'tag', p_tag,
        -- 발견 제보는 휴대폰이 절전 중이어도 바로 깨워요.
        'urgency', case when p_pref = 'reports' then 'high' else 'normal' end
      ),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_cfg.secret),
      timeout_milliseconds := 15000
    );
  exception when others then
    raise notice 'send_push 실패: %', sqlerrm;
  end;
end;
$$;

-- 5) (a) 발견 제보·연락 요청 → 이동수단 주인 ------------------------------------
create or replace function public.reports_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
begin
  select id, owner_id, name into v from public.vehicles where id = new.vehicle_id;
  if v.id is null then
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

-- 6) (b) 내 분실 글에 댓글 → 글쓴이 / (c) 내 댓글에 답글 → 원래 댓글 쓴 사람 ----------
-- 비밀 댓글은 잠금 화면에 내용이 보이지 않게 '비밀 댓글'이라고만 알려요.
create or replace function public.post_comments_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post record;
  v_parent_author uuid;
  v_preview text;
begin
  select id, author_id, title into v_post from public.lost_posts where id = new.post_id and deleted_at is null;
  if v_post.id is null then
    return null;
  end if;
  if new.parent_id is not null then
    select author_id into v_parent_author from public.post_comments where id = new.parent_id;
  end if;
  v_preview := new.author_name || ': ' || left(new.body, 80);

  -- (b) 글쓴이에게 (본인이 단 댓글은 빼고)
  if new.author_id is distinct from v_post.author_id then
    perform public.send_push(
      v_post.author_id,
      case when new.is_secret then '🔒 비밀 댓글이 왔어요'
           when v_parent_author = v_post.author_id then '↩️ 내 댓글에 답글이 달렸어요'
           else '💬 분실 글에 새 댓글' end,
      case when new.is_secret then '「' || left(v_post.title, 30) || '」 글에 ' || new.author_name || '님이 비밀 댓글을 남겼어요.'
           else v_preview end,
      '/community/' || v_post.id,
      'post-' || v_post.id,
      'comments'
    );
  end if;

  -- (c) 답글이면 원래 댓글 쓴 사람에게 (본인 답글, 글쓴이는 위에서 이미 받았으니 빼고)
  if v_parent_author is not null
     and v_parent_author is distinct from new.author_id
     and v_parent_author is distinct from v_post.author_id then
    perform public.send_push(
      v_parent_author,
      '↩️ 내 댓글에 답글이 달렸어요',
      case when new.is_secret then new.author_name || '님이 비밀 답글을 남겼어요.' else v_preview end,
      '/community/' || v_post.id,
      'reply-' || new.parent_id,
      'comments'
    );
  end if;
  return null;
exception when others then
  raise notice 'post_comments_push 실패: %', sqlerrm;
  return null;
end;
$$;
drop trigger if exists post_comments_push on public.post_comments;
create trigger post_comments_push after insert on public.post_comments
  for each row execute function public.post_comments_push();

-- 7) (d) 정비 시기 알림 --------------------------------------------------------
-- 같은 단계(점검 필요·교체 권장)는 정비 한 주기에 한 번만: 0 = 안 보냄, 1 = 점검 필요, 2 = 교체 권장
alter table public.vehicle_parts add column if not exists notified_level smallint not null default 0;

-- 마모율 단계 (src/lib/parts.ts 의 wearRatio·partStatus 와 같은 계산)
create or replace function public.part_wear_level(
  p_interval_km double precision,
  p_interval_days integer,
  p_distance_m double precision,
  p_last_serviced_at timestamptz
)
returns smallint
language sql
stable
set search_path = public
as $$
  select (case when w.r >= 1 then 2 when w.r >= 0.8 then 1 else 0 end)::smallint
  from (
    select greatest(
      case when p_interval_km > 0 then coalesce(p_distance_m, 0) / 1000.0 / p_interval_km else 0 end,
      case when p_interval_days > 0 then extract(epoch from (now() - p_last_serviced_at)) / 86400.0 / p_interval_days else 0 end
    ) as r
  ) w;
$$;

-- 정비하면(마지막 정비일이 바뀌면) 알림 단계를 처음부터. 주기를 늘리거나 라이딩을 지워 단계가 내려가면 그만큼 낮춰서
-- 다시 그 단계가 됐을 때 알릴 수 있게. 사용자가 직접 알림 단계를 바꾸지는 못해요.
-- (이름순으로 vehicle_parts_guard 다음에 실행돼서, 사용자가 못 바꾸는 값이 되돌려진 뒤의 값을 봐요)
create or replace function public.vehicle_parts_notify_reset()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.notified_level := old.notified_level;
  end if;
  if new.last_serviced_at is distinct from old.last_serviced_at then
    new.notified_level := 0;
  elsif new.interval_km is distinct from old.interval_km
     or new.interval_days is distinct from old.interval_days
     or new.enabled is distinct from old.enabled
     or new.distance_m < old.distance_m then
    new.notified_level := least(
      new.notified_level,
      public.part_wear_level(new.interval_km, new.interval_days, new.distance_m, new.last_serviced_at)
    );
  end if;
  return new;
end;
$$;
drop trigger if exists vehicle_parts_notify_reset on public.vehicle_parts;
create trigger vehicle_parts_notify_reset before update on public.vehicle_parts
  for each row execute function public.vehicle_parts_notify_reset();

-- 매일 한 번: 새로 점검·교체 시기가 된 소모품을 이동수단별로 묶어 한 번에 알려요.
-- 알림을 꺼 둔 사람도 단계는 기록해서, 나중에 켰을 때 지난 알림이 한꺼번에 오지 않게 해요.
create or replace function public.run_maintenance_push()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_count integer := 0;
begin
  -- pg_cron(로그인 없음)에서만 부르는 함수. 로그인한 사용자 요청으로는 실행하지 않아요.
  if auth.uid() is not null then
    raise exception '실행할 수 없어요.';
  end if;

  for r in
    select d.vehicle_id, d.owner_id, d.vehicle_name,
           array_agg(d.id) as part_ids,
           array_agg(d.label order by d.level desc, d.ord) as labels,
           array_agg(d.label || ' ' || case when d.level = 2 then '교체 권장' else '점검 필요' end
                     order by d.level desc, d.ord) as lines
    from (
      select p.id, p.vehicle_id, p.owner_id, v.name as vehicle_name, w.level,
             case p.kind when 'tire_pressure' then '타이어 공기압' when 'chain_lube' then '체인 윤활'
                         when 'brake_pad' then '브레이크 패드' when 'chain' then '체인' when 'tire' then '타이어'
                         else p.kind end as label,
             array_position(array['tire_pressure', 'chain_lube', 'brake_pad', 'chain', 'tire'], p.kind) as ord
      from public.vehicle_parts p
      join public.vehicles v on v.id = p.vehicle_id and v.deleted_at is null
      cross join lateral (
        select public.part_wear_level(p.interval_km, p.interval_days, p.distance_m, p.last_serviced_at) as level
      ) w
      where p.enabled and w.level > p.notified_level
    ) d
    group by d.vehicle_id, d.owner_id, d.vehicle_name
  loop
    -- 같은 트랜잭션 안에서는 now() 가 같아서 위에서 본 단계와 똑같이 기록돼요.
    update public.vehicle_parts p
       set notified_level = public.part_wear_level(p.interval_km, p.interval_days, p.distance_m, p.last_serviced_at)
     where p.id = any(r.part_ids);

    perform public.send_push(
      r.owner_id,
      '🔧 ' || r.vehicle_name || ' ' || r.labels[1]
        || case when cardinality(r.labels) > 1 then ' 외 ' || (cardinality(r.labels) - 1) || '개' else '' end
        || ' 점검할 때예요',
      array_to_string(r.lines, ' · ') || ' · 정비했다면 기록해 주세요.',
      '/vehicles/' || r.vehicle_id || '/maintenance',
      'maintenance-' || r.vehicle_id,
      'maintenance'
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- 매일 00:00 UTC = 한국 시간 오전 9시
do $$
begin
  if exists (select 1 from cron.job where jobname = 'b-lock-maintenance-push') then
    perform cron.unschedule('b-lock-maintenance-push');
  end if;
  perform cron.schedule('b-lock-maintenance-push', '0 0 * * *', 'select public.run_maintenance_push()');
end;
$$;

-- 8) 더 이상 없는 기기 지우기 (/api/push 가 404·410 을 받은 기기) -------------------
-- /api/push 는 로그인 없이(공개 키로) 부르므로 anon 에게 열되, 비밀값이 맞을 때만 지워요.
create or replace function public.remove_push_endpoints(p_secret text, p_endpoints text[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret text;
  v_count integer;
begin
  select secret into v_secret from app_private.push_config where id = 1;
  if v_secret is null or p_secret is null or p_secret <> v_secret then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_endpoints is null or cardinality(p_endpoints) = 0 then
    return 0;
  end if;
  if cardinality(p_endpoints) > 500 then
    raise exception 'too many endpoints';
  end if;
  delete from public.push_subscriptions where endpoint = any(p_endpoints);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- 9) 함수 권한: Supabase는 새 함수를 anon·authenticated 에 열어 두므로 모두 닫고 필요한 것만 ----
revoke execute on function public.save_push_subscription(text, text, text, text) from public, anon, authenticated;
revoke execute on function public.send_push(uuid, text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.reports_push() from public, anon, authenticated;
revoke execute on function public.post_comments_push() from public, anon, authenticated;
revoke execute on function public.part_wear_level(double precision, integer, double precision, timestamptz) from public, anon, authenticated;
revoke execute on function public.vehicle_parts_notify_reset() from public, anon, authenticated;
revoke execute on function public.run_maintenance_push() from public, anon, authenticated;
revoke execute on function public.remove_push_endpoints(text, text[]) from public, anon, authenticated;

grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;
-- 사용자가 소모품 주기를 바꿀 때 위 트리거(사용자 권한으로 실행)가 단계 계산에 써요. 계산만 하는 함수라 안전해요.
grant execute on function public.part_wear_level(double precision, integer, double precision, timestamptz) to authenticated;
grant execute on function public.remove_push_endpoints(text, text[]) to anon;
