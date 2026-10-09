-- =====================================================================
-- B-LOCK 20차 (커뮤니티·운영): 019 다음에 실행, 여러 번 실행해도 안전
--   1) 분실 글 고치기: 고친 시각(edited_at) 기록, 바꾼 사진은 정리 대기열로
--   2) '주인을 찾아요'(발견) 글 종류 (lost_posts.kind)
--   3) 댓글을 지우면 그 답글도 함께 지우기 (댓글 수 맞추기 + 이미 남은 답글 정리)
--   4) 앱 안 알림함 (notifications): 푸시를 못 받는 사람도 나중에 다시 볼 수 있게
--   5) 운영자 알림: 새 신고·자동 숨김·경보 숨김을 관리자에게 푸시 + 처리할 개수
--   6) 계정 이용 제한 (관리자): 제한 중이면 글·댓글·제보·경보·신고를 올릴 수 없음
--   7) 이동수단 사진 경로 검사 (남의 사진 경로를 넣어 정리 대기열로 지우게 하는 것 막기)
--   8) 구매 전 도난 조회 기록: 90일 뒤 이동수단 연결과 해시를 지우고 통계 숫자로만 남기기
-- =====================================================================

-- ---------------------------------------------------------------------
-- 6) 이용 제한: 다른 부분에서 쓰므로 먼저 만들어요
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists suspended_at timestamptz;
alter table public.profiles add column if not exists suspended_until timestamptz;  -- 비어 있으면 기한 없이
alter table public.profiles add column if not exists suspend_reason text check (char_length(suspend_reason) <= 200);

-- 지금 이용이 제한된 계정인지 (안에서만 씀)
create or replace function public.is_suspended(p_user uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select p_user is not null and exists (
    select 1 from public.profiles p
     where p.id = p_user and p.suspended_at is not null and (p.suspended_until is null or p.suspended_until > now())
  );
$$;

-- 지금 로그인한 사람이 제한 중이면 안내와 함께 막아요. (자기 상태만 보므로 사용자 권한 트리거에서도 부를 수 있게 열어 둠)
create or replace function public.assert_not_suspended()
returns void
language plpgsql stable security definer set search_path = public as $$
declare
  v_until timestamptz;
begin
  if not public.is_suspended(auth.uid()) then
    return;
  end if;
  select suspended_until into v_until from public.profiles where id = auth.uid();
  raise exception '%', '이용이 제한된 계정이에요'
    || case when v_until is null then '' else ' (' || to_char(v_until at time zone 'Asia/Seoul', 'FMMM월 FMDD일 HH24:MI') || '까지)' end
    || '. 궁금한 점은 문의하기로 알려 주세요.';
end;
$$;

-- 함수(definer) 안에서 넣는 행도 막을 수 있게 auth.uid() 로 확인해요 (목격 제보·경보·신고는 함수로만 들어와요)
create or replace function public.block_suspended_insert()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_not_suspended();
  return new;
end;
$$;

drop trigger if exists post_comments_suspension_guard on public.post_comments;
create trigger post_comments_suspension_guard before insert on public.post_comments
  for each row execute function public.block_suspended_insert();
drop trigger if exists sightings_suspension_guard on public.sightings;
create trigger sightings_suspension_guard before insert on public.sightings
  for each row execute function public.block_suspended_insert();
drop trigger if exists theft_alerts_suspension_guard on public.theft_alerts;
create trigger theft_alerts_suspension_guard before insert on public.theft_alerts
  for each row execute function public.block_suspended_insert();
drop trigger if exists content_reports_suspension_guard on public.content_reports;
create trigger content_reports_suspension_guard before insert on public.content_reports
  for each row execute function public.block_suspended_insert();
drop trigger if exists alert_flags_suspension_guard on public.alert_flags;
create trigger alert_flags_suspension_guard before insert on public.alert_flags
  for each row execute function public.block_suspended_insert();

-- ---------------------------------------------------------------------
-- 1) + 2) 분실 글: 글 종류 · 고친 시각
-- ---------------------------------------------------------------------
alter table public.lost_posts add column if not exists kind text not null default 'lost';
alter table public.lost_posts drop constraint if exists lost_posts_kind_check;
alter table public.lost_posts add constraint lost_posts_kind_check check (kind in ('lost', 'found'));
-- 글 내용을 고친 시각 (updated_at 은 댓글 수가 바뀔 때도 바뀌어서 따로 둬요)
alter table public.lost_posts add column if not exists edited_at timestamptz;
create index if not exists lost_posts_kind_idx on public.lost_posts (kind, created_at desc) where deleted_at is null;

-- 사용자 권한으로 도는 트리거예요 (current_user 로 화면에서 직접 쓴 것인지 구분).
-- 그래서 내부 전용 함수 대신 사용자에게 열어 둔 assert_not_suspended 만 불러요.
create or replace function public.lost_posts_edit_guard()
returns trigger
language plpgsql as $$
begin
  -- 발견한 사람이 올리는 글에는 '내 이동수단'을 연결할 수 없어요
  if new.kind = 'found' and new.vehicle_id is not null then
    raise exception '주인을 찾는 글에는 내 이동수단을 연결할 수 없어요.';
  end if;
  if current_user not in ('authenticated', 'anon') then
    return new;  -- 양도·관리자 함수 같은 서버 쪽 변경은 '고침'으로 치지 않아요
  end if;
  if tg_op = 'INSERT' then
    perform public.assert_not_suspended();
    new.edited_at := null;
    return new;
  end if;
  -- 지우기·찾았어요·다시 찾는 중은 제한 중에도 할 수 있어요
  if new.deleted_at is null
     and (new.kind, new.type, new.title, new.body, new.lost_area, new.lost_on, new.lost_lat, new.lost_lng,
          new.brand, new.model, new.color, new.image_bucket, new.image_path, new.vehicle_id)
         is distinct from
         (old.kind, old.type, old.title, old.body, old.lost_area, old.lost_on, old.lost_lat, old.lost_lng,
          old.brand, old.model, old.color, old.image_bucket, old.image_path, old.vehicle_id) then
    perform public.assert_not_suspended();
    new.edited_at := now();
  else
    new.edited_at := old.edited_at;
  end if;
  return new;
end;
$$;
drop trigger if exists lost_posts_edit_guard on public.lost_posts;
create trigger lost_posts_edit_guard before insert or update on public.lost_posts
  for each row execute function public.lost_posts_edit_guard();

-- 글을 고치면서 사진을 바꾸거나 지우면, 예전에 글에 올린 사진 파일은 정리 대기열로 (지울 때는 lost_posts_before_write 가 처리)
-- 이동수단 사진을 쓰던 글이면, 그 사진을 이제 아무 이동수단·글도 쓰지 않을 때만 (글쓴이 폴더의 사진만)
create or replace function public.lost_posts_image_replaced()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.deleted_at is not null or old.image_path is null
     or (new.image_path is not distinct from old.image_path and new.image_bucket is not distinct from old.image_bucket) then
    return null;
  end if;
  if old.image_bucket = 'community-images' then
    perform public.enqueue_cleanup('community-images', old.image_path);
  elsif old.image_bucket = 'vehicle-images'
     and split_part(old.image_path, '/', 1) = old.author_id::text
     and not exists (select 1 from public.vehicles v where v.image_path = old.image_path and v.deleted_at is null)
     and not exists (
       select 1 from public.lost_posts p
        where p.id <> old.id and p.image_bucket = 'vehicle-images' and p.image_path = old.image_path and p.deleted_at is null
     ) then
    perform public.enqueue_cleanup('vehicle-images', old.image_path);
  end if;
  return null;
end;
$$;
drop trigger if exists lost_posts_image_replaced on public.lost_posts;
create trigger lost_posts_image_replaced after update of image_path, image_bucket on public.lost_posts
  for each row execute function public.lost_posts_image_replaced();

-- ---------------------------------------------------------------------
-- 3) 댓글을 지우면 답글도 함께 (본인 삭제·글쓴이 삭제·관리자 삭제 모두)
--    위치·사진은 바로 지우고 사진 파일은 대기열로. 댓글 수는 post_comments_count 가 다시 세요.
-- ---------------------------------------------------------------------
create or replace function public.post_comments_cascade_delete()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.parent_id is null and new.deleted_at is not null and old.deleted_at is null then
    insert into public.storage_cleanup_queue (bucket, path)
    select case when r.is_secret then 'community-secret' else 'community-images' end, r.image_path
      from public.post_comments r
     where r.parent_id = new.id and r.deleted_at is null and r.image_path is not null
    on conflict do nothing;
    update public.post_comments
       set deleted_at = new.deleted_at, latitude = null, longitude = null, location_text = null, image_path = null
     where parent_id = new.id and deleted_at is null;
  end if;
  return null;
end;
$$;
drop trigger if exists post_comments_cascade_delete on public.post_comments;
create trigger post_comments_cascade_delete after update of deleted_at on public.post_comments
  for each row execute function public.post_comments_cascade_delete();

-- 이미 지운 댓글에 남아 있던 답글도 정리 (지운 댓글과 같은 시각으로, 30일 정리 때 함께 지워져요)
insert into public.storage_cleanup_queue (bucket, path)
select case when r.is_secret then 'community-secret' else 'community-images' end, r.image_path
  from public.post_comments r join public.post_comments p on p.id = r.parent_id
 where p.deleted_at is not null and r.deleted_at is null and r.image_path is not null
on conflict do nothing;
update public.post_comments r
   set deleted_at = p.deleted_at, latitude = null, longitude = null, location_text = null, image_path = null
  from public.post_comments p
 where p.id = r.parent_id and p.deleted_at is not null and r.deleted_at is null;

-- ---------------------------------------------------------------------
-- 4) 앱 안 알림함
-- ---------------------------------------------------------------------
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  title       text not null check (char_length(title) <= 100),
  body        text check (char_length(body) <= 300),
  url         text not null default '/' check (char_length(url) <= 500),
  tag         text check (char_length(tag) <= 200),
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx on public.notifications (user_id) where read_at is null;
create index if not exists notifications_tag_idx on public.notifications (user_id, tag, created_at desc) where tag is not null;
alter table public.notifications enable row level security;
drop policy if exists "owner reads notifications" on public.notifications;
create policy "owner reads notifications" on public.notifications for select to authenticated using (user_id = auth.uid());
drop policy if exists "owner marks notifications read" on public.notifications;
create policy "owner marks notifications read" on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
-- 쓰기는 send_push 안에서만, 사용자는 읽음 표시만 바꿀 수 있어요
revoke all on public.notifications from public, anon, authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

-- 알림 보내기 최신본 (008 + 알림함 기록).
-- 알림함에는 설정·기기와 상관없이 남기고(알림을 끈 사람·아이폰에서 홈 화면 앱이 아닌 사람도 볼 수 있게),
-- 푸시는 예전처럼 설정을 켠 사람의 기기로만 보내요. 알림함 기록이 실패해도 푸시와 원래 작업은 계속해요.
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

  -- 앱 안 알림함: 같은 알림(tag)이 1분 안에 또 오면 새로 쌓지 않고 내용만 바꿔요. 사람마다 최근 200개·90일까지만.
  begin
    update public.notifications
       set title = left(coalesce(p_title, ''), 100),
           body = left(coalesce(p_body, ''), 300),
           url = left(coalesce(p_url, '/'), 500),
           created_at = now()
     where user_id = p_user and p_tag is not null and tag = left(p_tag, 200)
       and read_at is null and created_at > now() - interval '1 minute';
    if not found then
      insert into public.notifications (user_id, title, body, url, tag)
      values (p_user, left(coalesce(p_title, ''), 100), left(coalesce(p_body, ''), 300), left(coalesce(p_url, '/'), 500), left(p_tag, 200));
      delete from public.notifications n
       where n.user_id = p_user
         and (n.created_at < now() - interval '90 days'
              or n.id in (select x.id from public.notifications x where x.user_id = p_user order by x.created_at desc offset 200));
    end if;
  exception when others then
    raise notice 'send_push 알림함 기록 실패: %', sqlerrm;
  end;

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

-- ---------------------------------------------------------------------
-- 5) 운영자 알림
-- ---------------------------------------------------------------------
-- 관리자 모두에게 (p_throttle 안에 같은 알림을 받았으면 건너뛰어요)
create or replace function public.notify_admins(p_title text, p_body text, p_url text, p_tag text, p_throttle interval default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  a record;
begin
  for a in select p.id from public.profiles p where p.is_admin loop
    if p_throttle is not null and exists (
      select 1 from public.notifications n where n.user_id = a.id and n.tag = p_tag and n.created_at > now() - p_throttle
    ) then
      continue;
    end if;
    perform public.send_push(a.id, p_title, p_body, p_url, p_tag, 'all');
  end loop;
end;
$$;

-- (a) 새 글·댓글 신고 → 관리자 (30분에 한 번만)
create or replace function public.content_reports_notify_admins()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.notify_admins(
    '🚩 새 신고가 들어왔어요',
    case when new.target_type = 'post' then '분실 글' else '댓글' end || ' 신고 · '
      || case new.reason when 'spam' then '스팸·광고' when 'abuse' then '욕설·비방' when 'privacy' then '개인정보 노출'
                         when 'false' then '허위 정보' else '기타' end
      || '. 신고 처리에서 확인해 주세요.',
    '/admin/reports', 'admin-reports', interval '30 minutes');
  return null;
exception when others then
  raise notice 'content_reports_notify_admins 실패: %', sqlerrm;
  return null;
end;
$$;
drop trigger if exists content_reports_notify_admins on public.content_reports;
create trigger content_reports_notify_admins after insert on public.content_reports
  for each row execute function public.content_reports_notify_admins();

-- (b) 신고가 쌓여 글·댓글이 자동으로 숨겨지면 → 관리자 (관리자가 직접 숨긴 것은 빼고)
create or replace function public.lost_posts_hidden_notify()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.hidden_at is null and new.hidden_at is not null and new.deleted_at is null and not public.is_admin() then
    perform public.notify_admins('🙈 신고가 쌓여 분실 글이 숨겨졌어요', '「' || left(new.title, 40) || '」 내용을 확인하고 다시 보이기나 삭제를 골라 주세요.',
                                 '/admin/reports', 'admin-hidden-' || new.id);
  end if;
  return null;
exception when others then
  raise notice 'lost_posts_hidden_notify 실패: %', sqlerrm;
  return null;
end;
$$;
drop trigger if exists lost_posts_hidden_notify on public.lost_posts;
create trigger lost_posts_hidden_notify after update of hidden_at on public.lost_posts
  for each row execute function public.lost_posts_hidden_notify();

create or replace function public.post_comments_hidden_notify()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.hidden_at is null and new.hidden_at is not null and new.deleted_at is null and not public.is_admin() then
    perform public.notify_admins('🙈 신고가 쌓여 댓글이 숨겨졌어요',
                                 case when new.is_secret then '비밀 댓글' else '「' || left(regexp_replace(btrim(new.body), '\s+', ' ', 'g'), 40) || '」' end
                                   || ' 내용을 확인하고 다시 보이기나 삭제를 골라 주세요.',
                                 '/admin/reports', 'admin-hidden-' || new.id);
  end if;
  return null;
exception when others then
  raise notice 'post_comments_hidden_notify 실패: %', sqlerrm;
  return null;
end;
$$;
drop trigger if exists post_comments_hidden_notify on public.post_comments;
create trigger post_comments_hidden_notify after update of hidden_at on public.post_comments
  for each row execute function public.post_comments_hidden_notify();

-- (c) 도난 경보 신고 → 관리자 (30분에 한 번만)
create or replace function public.alert_flags_notify_admins()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.notify_admins('🚩 도난 경보 신고가 들어왔어요', '이상한 경보라는 신고예요. 경보 신고에서 확인해 주세요.',
                               '/admin/alerts', 'admin-alert-flags', interval '30 minutes');
  return null;
exception when others then
  raise notice 'alert_flags_notify_admins 실패: %', sqlerrm;
  return null;
end;
$$;
drop trigger if exists alert_flags_notify_admins on public.alert_flags;
create trigger alert_flags_notify_admins after insert on public.alert_flags
  for each row execute function public.alert_flags_notify_admins();

-- (d) 신고 3건으로 경보가 자동으로 숨겨지면 → 관리자 바로 + 경보를 낸 주인에게도 알려요 (진짜 도난이면 골든타임이 중요해서)
create or replace function public.theft_alerts_hidden_notify()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'open' and new.status = 'hidden' and not public.is_admin() then
    perform public.notify_admins('🚨 도난 경보가 신고로 숨겨졌어요', '신고 ' || new.flag_count || '건으로 자동으로 숨겨졌어요. 진짜 도난이면 바로 다시 보이게 해 주세요.',
                                 '/admin/alerts', 'admin-alert-' || new.id);
    perform public.send_push(new.owner_id, '도난 경보가 잠시 숨겨졌어요',
                             '이상하다는 신고가 쌓여 다른 사람에게 잠시 안 보여요. 운영자가 확인하고 문제가 없으면 다시 보이게 해요.',
                             '/alerts/' || new.id, 'alert-hidden-' || new.id, 'all');
  end if;
  return null;
exception when others then
  raise notice 'theft_alerts_hidden_notify 실패: %', sqlerrm;
  return null;
end;
$$;
drop trigger if exists theft_alerts_hidden_notify on public.theft_alerts;
create trigger theft_alerts_hidden_notify after update of status on public.theft_alerts
  for each row execute function public.theft_alerts_hidden_notify();

-- 관리자 홈: 지금 처리할 개수
create or replace function public.admin_pending_counts()
returns json
language plpgsql stable security definer set search_path = public as $$
declare
  v json;
begin
  if not public.is_admin() then
    raise exception '관리자만 볼 수 있어요.';
  end if;
  with agg as (
    select r.target_type, r.target_id, max(r.created_at) as last_at
      from public.content_reports r
     group by r.target_type, r.target_id
  ), t as (
    select a.last_at,
           case when a.target_type = 'post' then p.hidden_at else c.hidden_at end as hidden_at,
           case when a.target_type = 'post' then p.moderation_cleared_at else c.moderation_cleared_at end as cleared_at,
           case when a.target_type = 'post' then p.id is null or p.deleted_at is not null
                else c.id is null or c.deleted_at is not null or cp.deleted_at is not null end as gone
      from agg a
      left join public.lost_posts p on a.target_type = 'post' and p.id = a.target_id
      left join public.post_comments c on a.target_type = 'comment' and c.id = a.target_id
      left join public.lost_posts cp on cp.id = c.post_id
  )
  select json_build_object(
           -- 보이는 중인데 신고가 있고, 관리자가 '다시 보이기'한 뒤 새 신고가 온 것까지
           'reports_visible', (select count(*) from t where not t.gone and t.hidden_at is null and (t.cleared_at is null or t.last_at > t.cleared_at)),
           -- 숨겨진 채 남은 것 (자동 숨김 포함)
           'reports_hidden', (select count(*) from t where not t.gone and t.hidden_at is not null),
           'alerts_flagged', (select count(*) from public.theft_alerts a where a.flag_count > 0 and a.status = 'open'),
           'alerts_hidden', (select count(*) from public.theft_alerts a where a.status = 'hidden'),
           'cleanup', (select count(*) from public.storage_cleanup_queue),
           'suspended', (select count(*) from public.profiles p
                          where p.suspended_at is not null and (p.suspended_until is null or p.suspended_until > now()))
         )
    into v;
  return v;
end;
$$;

-- ---------------------------------------------------------------------
-- 6) 이용 제한: 관리자 도구
-- ---------------------------------------------------------------------
-- p_days: 0이면 풀기, 음수면 기한 없이, 1~3650이면 그 날수만큼
create or replace function public.admin_set_suspension(p_user uuid, p_days int, p_reason text default null)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_reason text := nullif(left(btrim(coalesce(p_reason, '')), 200), '');
  v_until timestamptz;
begin
  if not public.is_admin() then
    raise exception '관리자만 바꿀 수 있어요.';
  end if;
  if p_user is null or not exists (select 1 from public.profiles where id = p_user) then
    raise exception '없는 회원이에요.';
  end if;
  if coalesce(p_days, 0) = 0 then
    update public.profiles set suspended_at = null, suspended_until = null, suspend_reason = null where id = p_user;
    perform public.send_push(p_user, '이용 제한이 풀렸어요', '다시 글·댓글·제보를 올릴 수 있어요.', '/dashboard', 'suspension', 'all');
    return json_build_object('suspended', false);
  end if;
  if p_user = auth.uid() then
    raise exception '내 계정은 제한할 수 없어요.';
  end if;
  if exists (select 1 from public.profiles where id = p_user and is_admin) then
    raise exception '관리자 계정은 제한할 수 없어요.';
  end if;
  if p_days > 3650 then
    raise exception '기간이 올바르지 않아요.';
  end if;
  v_until := case when p_days < 0 then null else now() + make_interval(days => p_days) end;
  update public.profiles set suspended_at = now(), suspended_until = v_until, suspend_reason = v_reason where id = p_user;
  perform public.send_push(p_user, '계정 이용이 제한됐어요',
    case when v_until is null then '운영 원칙을 어겨 ' else to_char(v_until at time zone 'Asia/Seoul', 'FMMM월 FMDD일') || '까지 ' end
      || '글·댓글·제보·신고를 올릴 수 없어요.' || coalesce(' 사유: ' || v_reason, '') || ' 궁금한 점은 문의하기로 알려 주세요.',
    '/contact', 'suspension', 'all');
  return json_build_object('suspended', true, 'suspended_at', now(), 'suspended_until', v_until);
end;
$$;

-- 회원 찾기 최신본 (017 + 이용 제한 상태). 돌려주는 열이 바뀌어서 지우고 다시 만들어요.
drop function if exists public.admin_find_users(text);
create function public.admin_find_users(p_query text)
returns table (id uuid, nickname text, email text, created_at timestamptz, identity_verified boolean, helped_count int, vehicles int,
               is_admin boolean, suspended_until timestamptz, suspended boolean, suspend_reason text)
language plpgsql stable security definer set search_path = public as $$
declare
  q text := '%' || replace(replace(btrim(coalesce(p_query, '')), '%', ''), '_', '') || '%';
begin
  if not public.is_admin() then raise exception '관리자만 볼 수 있어요.'; end if;
  return query
  select p.id, p.nickname, p.email, p.created_at, p.identity_verified,
         (select count(distinct s.alert_id)::int from public.sightings s where s.reporter_id = p.id and s.status = 'useful'),
         (select count(*)::int from public.vehicles v where v.owner_id = p.id and v.deleted_at is null),
         p.is_admin,
         p.suspended_until,
         public.is_suspended(p.id),
         p.suspend_reason
    from public.profiles p
   where btrim(coalesce(p_query, '')) = '' or p.nickname ilike q or p.email ilike q
   order by p.created_at desc
   limit 30;
end;
$$;

-- ---------------------------------------------------------------------
-- 7) 이동수단 사진 경로: 본인 폴더의 사진만 ({주인ID}/{무작위}.jpg)
--    사용자 권한으로 도는 트리거라 내부 함수 없이 같은 식을 직접 써요.
-- ---------------------------------------------------------------------
create or replace function public.vehicles_image_path_check()
returns trigger
language plpgsql as $$
begin
  if new.image_path is not null
     and (tg_op = 'INSERT' or new.image_path is distinct from old.image_path)
     and new.image_path !~ ('^' || new.owner_id::text || '/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$') then
    raise exception '사진 경로가 올바르지 않아요. 사진을 다시 골라 주세요.';
  end if;
  return new;
end;
$$;
drop trigger if exists vehicles_image_path_check on public.vehicles;
create trigger vehicles_image_path_check before insert or update of image_path on public.vehicles
  for each row execute function public.vehicles_image_path_check();

-- 사진 정리 최신본 (017 + 주인 폴더 확인): 지금 주인 폴더의 사진만 대기열에 넣어요
create or replace function public.vehicles_image_cleanup()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_old text;
begin
  if new.deleted_at is not null and old.deleted_at is null then
    v_old := old.image_path;
  elsif new.image_path is distinct from old.image_path then
    v_old := old.image_path;
  end if;
  if v_old is not null
     and split_part(v_old, '/', 1) = old.owner_id::text
     and not exists (
       select 1 from public.lost_posts p where p.image_bucket = 'vehicle-images' and p.image_path = v_old and p.deleted_at is null
     ) then
    insert into public.storage_cleanup_queue (bucket, path) values ('vehicle-images', v_old) on conflict do nothing;
  end if;
  if new.deleted_at is not null and old.deleted_at is null then
    -- 지운 이동수단은 사진 연결만 끊고 기록(소유 이력 등)은 남겨요
    new.image_path := null;
  end if;
  return new;
end;
$$;

-- 이미 들어간 잘못된 값 정리: 다른 이동수단이 쓰고 있는 사진은 대기열에서 빼고,
-- 남의 폴더 사진을 가리키는 이동수단은 연결만 끊어요 (위 함수 덕분에 대기열에 들어가지 않아요)
delete from public.storage_cleanup_queue q
 where q.bucket = 'vehicle-images'
   and exists (select 1 from public.vehicles v where v.image_path = q.path and v.deleted_at is null);
update public.vehicles v
   set image_path = null
 where v.image_path is not null
   and split_part(v.image_path, '/', 1) <> v.owner_id::text
   and exists (
     select 1 from public.vehicles o
      where o.id <> v.id and o.image_path = v.image_path and o.deleted_at is null and split_part(o.image_path, '/', 1) = o.owner_id::text
   );

-- ---------------------------------------------------------------------
-- 8) 오래된 기록 정리 (매일 04:30 KST)
--    - 도난 조회 기록: 90일이 지나면 이동수단 연결과 조회 값 해시를 지우고 방법·결과·시각만 (공개 통계용)
--    - 알림함: 90일이 지난 알림
-- ---------------------------------------------------------------------
create or replace function public.purge_inbox_and_lookups()
returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.vehicle_lookups set vehicle_id = null, key_hash = 'expired'
   where created_at < now() - interval '90 days' and key_hash <> 'expired';
  delete from public.notifications where created_at < now() - interval '90 days';
end;
$$;
do $$
begin
  if exists (select 1 from cron.job where jobname = 'b-lock-purge-inbox-lookups') then
    perform cron.unschedule('b-lock-purge-inbox-lookups');
  end if;
  perform cron.schedule('b-lock-purge-inbox-lookups', '30 19 * * *', 'select public.purge_inbox_and_lookups()');
end;
$$;

-- ---------------------------------------------------------------------
-- 권한 정리
-- ---------------------------------------------------------------------
revoke execute on function public.is_suspended(uuid) from public, anon, authenticated;
-- 사용자 권한 트리거(lost_posts_edit_guard)에서 불러요. 지금 로그인한 사람 자신의 상태만 봐요.
revoke execute on function public.assert_not_suspended() from public, anon;
grant execute on function public.assert_not_suspended() to authenticated;
revoke execute on function public.block_suspended_insert() from public, anon, authenticated;
revoke execute on function public.lost_posts_edit_guard() from public, anon, authenticated;
revoke execute on function public.lost_posts_image_replaced() from public, anon, authenticated;
revoke execute on function public.post_comments_cascade_delete() from public, anon, authenticated;
revoke execute on function public.send_push(uuid, text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.notify_admins(text, text, text, text, interval) from public, anon, authenticated;
revoke execute on function public.content_reports_notify_admins() from public, anon, authenticated;
revoke execute on function public.lost_posts_hidden_notify() from public, anon, authenticated;
revoke execute on function public.post_comments_hidden_notify() from public, anon, authenticated;
revoke execute on function public.alert_flags_notify_admins() from public, anon, authenticated;
revoke execute on function public.theft_alerts_hidden_notify() from public, anon, authenticated;
revoke execute on function public.vehicles_image_path_check() from public, anon, authenticated;
revoke execute on function public.vehicles_image_cleanup() from public, anon, authenticated;
revoke execute on function public.purge_inbox_and_lookups() from public, anon, authenticated;
revoke execute on function public.admin_pending_counts() from public, anon;
grant execute on function public.admin_pending_counts() to authenticated;
revoke execute on function public.admin_set_suspension(uuid, int, text) from public, anon;
grant execute on function public.admin_set_suspension(uuid, int, text) to authenticated;
revoke execute on function public.admin_find_users(text) from public, anon;
grant execute on function public.admin_find_users(text) to authenticated;
