-- =====================================================================
-- B-LOCK 20차 (주인 화면): 받은 제보 '확인함·연락함' 표시 · 익명 대화 차단
-- (019 다음에 실행, 여러 번 실행해도 안전)
--   - 콜백(전화 요청) 제보는 대화가 없어서 '답장 기다림'이 사흘 동안 지워지지 않았어요.
--     주인이 직접 '연락함/확인함'으로 표시할 수 있게 handled_at 을 둬요.
--   - 장난·괴롭힘성 익명 대화는 주인이 막을 수 있게 chat_blocked_at 을 둬요.
--     막은 대화에는 발견자가 더 보낼 수 없고, 주인에게 알림도 가지 않아요.
-- =====================================================================

alter table public.reports add column if not exists handled_at timestamptz;
alter table public.reports add column if not exists chat_blocked_at timestamptz;

-- 주인: 제보를 '확인함·연락함'으로 표시 (p_handled = false 면 표시를 풀어요). 표시한 시각을 돌려줘요.
create or replace function public.mark_report_handled(p_report uuid, p_handled boolean default true)
returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  v_at timestamptz;
begin
  if auth.uid() is null then raise exception '로그인이 필요해요.'; end if;
  update public.reports rp
     set handled_at = case when coalesce(p_handled, true) then now() else null end
    from public.vehicles v
   where rp.id = p_report and v.id = rp.vehicle_id and v.owner_id = auth.uid() and v.deleted_at is null
  returning rp.handled_at into v_at;
  if not found then raise exception '내 이동수단의 제보만 표시할 수 있어요.'; end if;
  return v_at;
end;
$$;

-- 주인: 익명 대화 차단 (p_block = false 면 차단을 풀어요). 차단한 시각을 돌려줘요.
create or replace function public.block_report_chat(p_report uuid, p_block boolean default true)
returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  v_at timestamptz;
begin
  if auth.uid() is null then raise exception '로그인이 필요해요.'; end if;
  update public.reports rp
     set chat_blocked_at = case when coalesce(p_block, true) then coalesce(rp.chat_blocked_at, now()) else null end
    from public.vehicles v
   where rp.id = p_report and v.id = rp.vehicle_id and v.owner_id = auth.uid() and v.deleted_at is null
  returning rp.chat_blocked_at into v_at;
  if not found then raise exception '내 이동수단의 제보만 차단할 수 있어요.'; end if;
  return v_at;
end;
$$;

-- 발견자: 대화 보기 (016과 같고, 주인이 막은 대화는 닫힌 것으로 보여요)
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
    'open', r.created_at > now() - interval '14 days' and v.deleted_at is null and r.chat_blocked_at is null,
    'blocked', r.chat_blocked_at is not null,
    'vehicle', json_build_object('type', v.type, 'brand', v.brand, 'color', v.color, 'image_path', v.image_path),
    'messages', coalesce((select json_agg(json_build_object('id', m.id, 'sender', m.sender, 'body', m.body, 'created_at', m.created_at) order by m.created_at)
                          from public.report_messages m where m.report_id = r.id), '[]'::json)
  );
end;
$$;

-- 발견자: 메시지 보내기 → 주인에게 알림 (016과 같고, 주인이 막은 대화면 저장·알림 없이 막아요)
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
  if r.chat_blocked_at is not null then raise exception '주인이 이 대화를 끝냈어요. 더 보낼 수 없어요.'; end if;
  if char_length(btrim(coalesce(p_body, ''))) = 0 then raise exception '메시지를 적어 주세요.'; end if;
  if (select count(*) from public.report_messages where report_id = r.id and sender = 'finder' and created_at > now() - interval '10 minutes') >= 10 then
    raise exception '메시지를 너무 많이 보냈어요. 잠시 후 다시 보내 주세요.';
  end if;
  insert into public.report_messages (report_id, sender, body) values (r.id, 'finder', left(btrim(p_body), 500));
  perform public.send_push(v.owner_id, '💬 발견자가 메시지를 보냈어요', left(btrim(p_body), 100), '/vehicles/' || v.id || '/reports', 'chat-' || r.id, 'reports');
end;
$$;

-- 주인: 답장 → 발견자 기기에 알림 (019와 같고, 막은 대화에는 보낼 수 없어요)
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
  if r.chat_blocked_at is not null then raise exception '차단한 대화예요. 차단을 풀어야 답장할 수 있어요.'; end if;
  if char_length(btrim(coalesce(p_body, ''))) = 0 then raise exception '메시지를 적어 주세요.'; end if;
  if (select count(*) from public.report_messages where report_id = r.id and sender = 'owner' and created_at > now() - interval '10 minutes') >= 20 then
    raise exception '잠시 후 다시 보내 주세요.';
  end if;
  insert into public.report_messages (report_id, sender, body) values (r.id, 'owner', left(btrim(p_body), 500));
  select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)) into v_subs
    from public.report_finder_subs s where s.report_id = r.id;
  perform public.send_push_subs(v_subs, '💬 주인이 답장했어요', left(btrim(p_body), 100), '/r#rid=' || r.id, 'chat-' || r.id);
end;
$$;

revoke execute on function public.mark_report_handled(uuid, boolean) from public, anon;
grant execute on function public.mark_report_handled(uuid, boolean) to authenticated;
revoke execute on function public.block_report_chat(uuid, boolean) from public, anon;
grant execute on function public.block_report_chat(uuid, boolean) to authenticated;
-- 아래 셋은 016·019와 같은 권한 (다시 적어 두기만)
revoke execute on function public.finder_thread(text) from public;
grant execute on function public.finder_thread(text) to anon, authenticated;
revoke execute on function public.finder_send(text, text) from public;
grant execute on function public.finder_send(text, text) to anon, authenticated;
revoke execute on function public.owner_send(uuid, text) from public, anon;
grant execute on function public.owner_send(uuid, text) to authenticated;
