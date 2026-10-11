-- 041: 로그인해서 QR 제보를 보낸 사람도 계정으로 대화·기록을 보게 (여러 번 실행해도 안전해요)
-- 1) owner_send: 주인이 답장하면 로그인한 제보자 계정에도 알림 (예전에는 '답장 알림 받기'를 켠 기기에만 갔어요)
-- 2) finder_thread_mine / finder_send_mine: 대화 열쇠가 이 기기에 없어도, 내가 보낸 제보면 계정으로 열고 보내기
-- 3) my_reports(): '내 경보·제보'에 내가 보낸 QR 제보(발견 제보·주인에게 알리기)도 보여 주기

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
  -- 로그인 없이 '답장 알림 받기'를 켠 기기
  select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)) into v_subs
    from public.report_finder_subs s where s.report_id = r.id;
  perform public.send_push_subs(v_subs, '💬 주인이 답장했어요', left(btrim(p_body), 100), '/r#rid=' || r.id, 'chat-' || r.id);
  -- 로그인해서 보낸 제보자 계정 (같은 기기면 tag 가 같아 알림이 한 번만 보여요)
  if r.reporter_id is not null and r.reporter_id <> auth.uid() then
    perform public.send_push(r.reporter_id, '💬 주인이 답장했어요', left(btrim(p_body), 100), '/r#rid=' || r.id, 'chat-' || r.id, 'all');
  end if;
end;
$$;
revoke execute on function public.owner_send(uuid, text) from public, anon;
grant execute on function public.owner_send(uuid, text) to authenticated;

-- 내가(로그인해서) 보낸 제보의 대화
create or replace function public.finder_thread_mine(p_report uuid)
returns json
language plpgsql stable security definer set search_path = public as $$
declare
  r public.reports;
  v public.vehicles;
begin
  if auth.uid() is null then return null; end if;
  select * into r from public.reports where id = p_report and reporter_id = auth.uid();
  if not found then return null; end if;
  select * into v from public.vehicles where id = r.vehicle_id;
  return json_build_object(
    'report_id', r.id, 'kind', r.kind, 'created_at', r.created_at, 'description', r.description, 'location_text', r.location_text,
    'chat', r.contact_mode = 'chat',
    'open', r.contact_mode = 'chat' and r.created_at > now() - interval '14 days' and v.deleted_at is null and r.chat_blocked_at is null,
    'blocked', r.chat_blocked_at is not null,
    'vehicle', json_build_object('type', v.type, 'brand', v.brand, 'color', v.color, 'image_path', v.image_path),
    'messages', coalesce((select json_agg(json_build_object('id', m.id, 'sender', m.sender, 'body', m.body, 'created_at', m.created_at) order by m.created_at)
                          from public.report_messages m where m.report_id = r.id), '[]'::json)
  );
end;
$$;
revoke execute on function public.finder_thread_mine(uuid) from public, anon, authenticated;
grant execute on function public.finder_thread_mine(uuid) to authenticated;

create or replace function public.finder_send_mine(p_report uuid, p_body text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  r public.reports;
  v public.vehicles;
begin
  select * into r from public.reports where id = p_report and reporter_id = auth.uid() and auth.uid() is not null;
  if not found then raise exception '대화를 찾을 수 없어요.'; end if;
  select * into v from public.vehicles where id = r.vehicle_id;
  if r.contact_mode <> 'chat' then raise exception '이 제보는 대화 없이 보냈어요.'; end if;
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
revoke execute on function public.finder_send_mine(uuid, text) from public, anon, authenticated;
grant execute on function public.finder_send_mine(uuid, text) to authenticated;

-- 내가 보낸 QR 제보 목록 (최근 30건, 내 이동수단에 보낸 건 빼고)
create or replace function public.my_reports()
returns table (id uuid, kind text, reason text, created_at timestamptz, chat boolean, chat_open boolean,
               owner_msgs int, last_sender text, thanked boolean, recovered boolean,
               type text, brand text, color text, image_path text)
language sql stable security definer set search_path = public as $$
  select r.id, r.kind, r.reason, r.created_at,
         r.contact_mode = 'chat',
         r.contact_mode = 'chat' and r.created_at > now() - interval '14 days' and v.deleted_at is null and r.chat_blocked_at is null,
         (select count(*)::int from public.report_messages m where m.report_id = r.id and m.sender = 'owner'),
         (select m.sender from public.report_messages m where m.report_id = r.id order by m.created_at desc limit 1),
         r.thanked_at is not null,
         r.kind = 'found' and v.last_recovered_at is not null and v.last_recovered_at > r.created_at,
         v.type, v.brand, v.color, v.image_path
    from public.reports r
    join public.vehicles v on v.id = r.vehicle_id
   where auth.uid() is not null
     and r.reporter_id = auth.uid()
     and v.owner_id is distinct from auth.uid()
   order by r.created_at desc
   limit 30;
$$;
revoke execute on function public.my_reports() from public, anon, authenticated;
grant execute on function public.my_reports() to authenticated;
