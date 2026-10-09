-- =====================================================================
-- B-LOCK 16차: 발견 제보 연락 방법(익명 대화·콜백·연락 안 받기) · 위치만 바로 알리기 · 익명 대화방
-- (015 다음에 실행, 여러 번 실행해도 안전)
--   - 발견자는 로그인 없이도 제보할 때 받은 비밀 링크로 대화를 이어가요 (번호·이름 비공개)
--   - 대화방은 제보를 보낸 뒤에만, 14일 동안 열려요
-- =====================================================================

alter table public.reports add column if not exists contact_mode text not null default 'none' check (contact_mode in ('chat', 'callback', 'none'));
alter table public.reports add column if not exists finder_token_hash text;
create unique index if not exists reports_finder_token_idx on public.reports (finder_token_hash) where finder_token_hash is not null;

create table if not exists public.report_messages (
  id          uuid primary key default gen_random_uuid(),
  report_id   uuid not null references public.reports (id) on delete cascade,
  sender      text not null check (sender in ('owner', 'finder')),
  body        text not null check (char_length(btrim(body)) between 1 and 500),
  created_at  timestamptz not null default now()
);
create index if not exists report_messages_report_idx on public.report_messages (report_id, created_at);
alter table public.report_messages enable row level security;
drop policy if exists "owner reads report messages" on public.report_messages;
create policy "owner reads report messages" on public.report_messages for select to authenticated using (
  exists (select 1 from public.reports r join public.vehicles v on v.id = r.vehicle_id where r.id = report_id and v.owner_id = auth.uid())
);
revoke all on public.report_messages from anon, authenticated;
grant select on public.report_messages to authenticated;

-- 발견자 기기의 알림 구독 (로그인 없이 그 제보의 답장만 받음)
create table if not exists public.report_finder_subs (
  report_id   uuid not null references public.reports (id) on delete cascade,
  endpoint    text not null,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now(),
  primary key (report_id, endpoint)
);
alter table public.report_finder_subs enable row level security;
revoke all on public.report_finder_subs from anon, authenticated;

-- 구독 목록으로 바로 알림 보내기 (send_push와 같은 길, 사용자 대신 구독 목록)
create or replace function public.send_push_subs(p_subs jsonb, p_title text, p_body text, p_url text, p_tag text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_cfg record;
begin
  if p_subs is null or jsonb_array_length(p_subs) = 0 then return; end if;
  select c.secret, c.url into v_cfg from app_private.push_config c where c.id = 1;
  if v_cfg.url is null then return; end if;
  begin
    perform net.http_post(
      url := v_cfg.url,
      body := jsonb_build_object('subscriptions', p_subs, 'title', left(coalesce(p_title, ''), 100), 'body', left(coalesce(p_body, ''), 300),
                                 'url', coalesce(p_url, '/'), 'tag', p_tag, 'urgency', 'high'),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_cfg.secret),
      timeout_milliseconds := 15000
    );
  exception when others then
    raise notice 'send_push_subs 실패: %', sqlerrm;
  end;
end;
$$;

-- 새 제보 보내기: 연락 방법 · 설명 없이 위치만도 가능. 익명 대화를 고르면 발견자용 비밀 토큰을 돌려줘요
create or replace function public.submit_report_v2(
  p_token text, p_kind text, p_description text, p_latitude double precision, p_longitude double precision,
  p_location_text text, p_image_path text, p_contact text, p_contact_mode text
)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_vehicle uuid;
  v_id uuid;
  v_desc text := btrim(coalesce(p_description, ''));
  v_mode text := coalesce(p_contact_mode, 'chat');
  v_finder text;
begin
  select id into v_vehicle from public.vehicles where id = public.resolve_vehicle(p_token) and deleted_at is null;
  if v_vehicle is null then raise exception '등록되지 않았거나 사용할 수 없는 QR이에요.'; end if;
  if p_kind not in ('found', 'contact') then raise exception '제보 종류가 올바르지 않아요.'; end if;
  if v_mode not in ('chat', 'callback', 'none') then raise exception '연락 방법이 올바르지 않아요.'; end if;
  if v_mode = 'callback' and char_length(btrim(coalesce(p_contact, ''))) < 4 then raise exception '콜백 받을 번호를 적어 주세요.'; end if;
  if p_latitude is not null and (p_latitude not between -90 and 90 or p_longitude not between -180 and 180) then
    raise exception '위치가 올바르지 않아요.';
  end if;
  if v_desc = '' then
    if p_kind = 'found' and (p_latitude is not null or nullif(btrim(coalesce(p_location_text, '')), '') is not null) then
      v_desc := case when p_image_path is null then '📍 이 위치에서 봤어요 (위치만 알림)' else '📍 이 위치에서 봤어요 (사진 첨부)' end;
    else
      raise exception '전할 말을 적어 주세요.';
    end if;
  end if;
  if (select count(*) from public.reports where vehicle_id = v_vehicle and created_at > now() - interval '10 minutes') >= 20 then
    raise exception '잠시 후 다시 시도해 주세요.';
  end if;
  if p_image_path is not null and p_image_path !~ '^reports/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$' then
    raise exception '사진 경로가 올바르지 않아요.';
  end if;
  if v_mode = 'chat' then v_finder := public.random_token(18); end if;

  insert into public.reports (vehicle_id, reporter_id, kind, latitude, longitude, location_text, description, image_path, contact, contact_mode, finder_token_hash)
  values (v_vehicle, auth.uid(), p_kind, p_latitude, p_longitude, nullif(btrim(coalesce(p_location_text, '')), ''), left(v_desc, 1000), p_image_path,
          case when v_mode = 'callback' then left(btrim(p_contact), 100) else nullif(left(btrim(coalesce(p_contact, '')), 100), '') end,
          v_mode, case when v_finder is null then null else public.sha256_hex(v_finder) end)
  returning id into v_id;
  return json_build_object('report_id', v_id, 'finder_token', v_finder);
end;
$$;

-- 발견자: 대화 보기 (비밀 토큰)
create or replace function public.finder_thread(p_finder text)
returns json
language plpgsql security definer set search_path = public as $$
declare
  r public.reports;
  v public.vehicles;
begin
  select * into r from public.reports where finder_token_hash = public.sha256_hex(coalesce(p_finder, ''));
  if not found then return null; end if;
  select * into v from public.vehicles where id = r.vehicle_id;
  return json_build_object(
    'report_id', r.id, 'kind', r.kind, 'created_at', r.created_at, 'description', r.description, 'location_text', r.location_text,
    'open', r.created_at > now() - interval '14 days' and v.deleted_at is null,
    'vehicle', json_build_object('type', v.type, 'brand', v.brand, 'color', v.color, 'image_path', v.image_path),
    'messages', coalesce((select json_agg(json_build_object('id', m.id, 'sender', m.sender, 'body', m.body, 'created_at', m.created_at) order by m.created_at)
                          from public.report_messages m where m.report_id = r.id), '[]'::json)
  );
end;
$$;

-- 발견자: 메시지 보내기 → 주인에게 알림
create or replace function public.finder_send(p_finder text, p_body text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  r public.reports;
  v public.vehicles;
begin
  select * into r from public.reports where finder_token_hash = public.sha256_hex(coalesce(p_finder, ''));
  if not found then raise exception '대화를 찾을 수 없어요.'; end if;
  select * into v from public.vehicles where id = r.vehicle_id;
  if v.deleted_at is not null or r.created_at < now() - interval '14 days' then raise exception '대화가 끝났어요.'; end if;
  if char_length(btrim(coalesce(p_body, ''))) = 0 then raise exception '메시지를 적어 주세요.'; end if;
  if (select count(*) from public.report_messages where report_id = r.id and sender = 'finder' and created_at > now() - interval '10 minutes') >= 10 then
    raise exception '메시지를 너무 많이 보냈어요. 잠시 후 다시 보내 주세요.';
  end if;
  insert into public.report_messages (report_id, sender, body) values (r.id, 'finder', left(btrim(p_body), 500));
  perform public.send_push(v.owner_id, '💬 발견자가 메시지를 보냈어요', left(btrim(p_body), 100), '/vehicles/' || v.id || '/reports', 'chat-' || r.id, 'reports');
end;
$$;

-- 발견자: 답장 알림 받기
create or replace function public.finder_subscribe(p_finder text, p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  r public.reports;
begin
  select * into r from public.reports where finder_token_hash = public.sha256_hex(coalesce(p_finder, ''));
  if not found then raise exception '대화를 찾을 수 없어요.'; end if;
  if p_endpoint !~ '^https://' or char_length(p_endpoint) > 1000 or char_length(p_p256dh) > 200 or char_length(p_auth) > 100 then
    raise exception '알림 정보가 올바르지 않아요.';
  end if;
  if (select count(*) from public.report_finder_subs where report_id = r.id) >= 3 then
    delete from public.report_finder_subs where report_id = r.id and endpoint = (select endpoint from public.report_finder_subs where report_id = r.id order by created_at limit 1);
  end if;
  insert into public.report_finder_subs (report_id, endpoint, p256dh, auth) values (r.id, p_endpoint, p_p256dh, p_auth)
  on conflict (report_id, endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth;
end;
$$;

-- 주인: 답장 → 발견자 기기에 알림
create or replace function public.owner_send(p_report uuid, p_body text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  r public.reports;
  v_subs jsonb;
begin
  select rp.* into r from public.reports rp join public.vehicles v on v.id = rp.vehicle_id
   where rp.id = p_report and v.owner_id = auth.uid() and v.deleted_at is null;
  if not found then raise exception '내 이동수단의 제보에만 답장할 수 있어요.'; end if;
  if r.contact_mode <> 'chat' then raise exception '발견자가 대화를 원하지 않았어요.'; end if;
  if r.created_at < now() - interval '14 days' then raise exception '대화가 끝났어요 (14일).'; end if;
  if char_length(btrim(coalesce(p_body, ''))) = 0 then raise exception '메시지를 적어 주세요.'; end if;
  if (select count(*) from public.report_messages where report_id = r.id and sender = 'owner' and created_at > now() - interval '10 minutes') >= 20 then
    raise exception '잠시 후 다시 보내 주세요.';
  end if;
  insert into public.report_messages (report_id, sender, body) values (r.id, 'owner', left(btrim(p_body), 500));
  select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)) into v_subs
    from public.report_finder_subs s where s.report_id = r.id;
  perform public.send_push_subs(v_subs, '💬 주인이 답장했어요', left(btrim(p_body), 100), '/r', 'chat-' || r.id);
end;
$$;

revoke execute on function public.send_push_subs(jsonb, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.submit_report_v2(text, text, text, double precision, double precision, text, text, text, text) from public;
grant execute on function public.submit_report_v2(text, text, text, double precision, double precision, text, text, text, text) to anon, authenticated;
revoke execute on function public.finder_thread(text) from public;
grant execute on function public.finder_thread(text) to anon, authenticated;
revoke execute on function public.finder_send(text, text) from public;
grant execute on function public.finder_send(text, text) to anon, authenticated;
revoke execute on function public.finder_subscribe(text, text, text, text) from public;
grant execute on function public.finder_subscribe(text, text, text, text) to anon, authenticated;
revoke execute on function public.owner_send(uuid, text) from public, anon;
grant execute on function public.owner_send(uuid, text) to authenticated;
