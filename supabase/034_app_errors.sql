-- 034: 오류 알림 (사용자가 말하지 않아도 앱에서 난 오류를 운영자에게 알려 줘요)
-- app_errors: 같은 오류(같은 내용·같은 화면)는 한 줄로 묶어서 횟수만 올려요.
-- report_app_error(): 누구나 부를 수 있지만(로그인 전 화면 오류도 받으려고), 길이·개수를 제한해요.
--   - 새 오류가 처음 생기면 관리자에게 알림 (10분에 한 번까지)
--   - 같은 오류는 1분에 한 번만 횟수를 올려요 (한 사람이 무한 반복해도 숫자가 폭주하지 않게)
-- 회원 ID·이메일은 저장하지 않아요. 로그인했는지 여부와 화면 주소(토큰은 지운 것), 브라우저 종류만.
-- 관리자만 보고 정리할 수 있어요. 여러 번 실행해도 안전해요.

create table if not exists public.app_errors (
  id            uuid primary key default gen_random_uuid(),
  fingerprint   text not null unique check (char_length(fingerprint) <= 64),
  source        text not null check (source in ('client', 'server')),
  message       text not null check (char_length(message) <= 500),
  path          text check (char_length(path) <= 200),
  stack         text check (char_length(stack) <= 2000),
  user_agent    text check (char_length(user_agent) <= 300),
  logged_in     boolean not null default false,
  count         int not null default 1,
  first_seen    timestamptz not null default now(),
  last_seen     timestamptz not null default now(),
  resolved_at   timestamptz,
  notified_at   timestamptz
);
create index if not exists app_errors_last_idx on public.app_errors (last_seen desc);
alter table public.app_errors enable row level security;
drop policy if exists "admins read errors" on public.app_errors;
create policy "admins read errors" on public.app_errors for select to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and is_admin));
revoke all on public.app_errors from anon, authenticated;
grant select on public.app_errors to authenticated;

create or replace function public.report_app_error(
  p_source text, p_message text, p_path text default null, p_stack text default null, p_user_agent text default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_msg text := left(btrim(coalesce(p_message, '')), 500);
  v_path text := left(coalesce(p_path, ''), 200);
  v_fp text;
  v_row public.app_errors;
  v_new boolean := false;
  v_admin uuid;
begin
  if v_msg = '' or coalesce(p_source, '') not in ('client', 'server') then
    return;
  end if;
  -- 숫자·긴 글자 덩어리를 지워서 '같은 오류'로 묶어요 (예: id가 다른 같은 오류)
  v_fp := md5(p_source || '|' || regexp_replace(v_msg, '[0-9a-f-]{8,}|\d+', '#', 'g') || '|' || v_path);

  select * into v_row from public.app_errors where fingerprint = v_fp;
  if not found then
    -- 오류 종류가 너무 많이 쌓이면(누군가 일부러 보내는 경우) 새 종류는 받지 않아요
    if (select count(*) from public.app_errors where resolved_at is null) >= 300 then
      return;
    end if;
    insert into public.app_errors (fingerprint, source, message, path, stack, user_agent, logged_in)
    values (v_fp, p_source, v_msg, nullif(v_path, ''), left(p_stack, 2000), left(p_user_agent, 300), auth.uid() is not null)
    on conflict (fingerprint) do nothing
    returning * into v_row;
    v_new := v_row.id is not null;
  elsif v_row.last_seen < now() - interval '1 minute' then
    update public.app_errors set
      count = count + 1,
      last_seen = now(),
      -- 해결했다고 표시한 오류가 다시 나면 다시 열어요
      resolved_at = null,
      stack = coalesce(left(p_stack, 2000), stack),
      user_agent = coalesce(left(p_user_agent, 300), user_agent)
    where id = v_row.id;
    v_new := v_row.resolved_at is not null; -- 다시 생긴 오류도 알려요
  end if;

  -- 관리자에게 알림: 새 오류(또는 다시 생긴 오류)일 때, 전체 10분에 한 번까지
  if v_new and not exists (select 1 from public.app_errors where notified_at > now() - interval '10 minutes') then
    update public.app_errors set notified_at = now() where fingerprint = v_fp;
    for v_admin in select id from public.profiles where is_admin loop
      perform public.send_push(v_admin, '⚠️ 앱 오류가 생겼어요', left(v_msg, 80) || coalesce(' · ' || nullif(v_path, ''), ''), '/admin/errors', 'app-error', 'all');
    end loop;
  end if;
end;
$$;
revoke execute on function public.report_app_error(text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.report_app_error(text, text, text, text, text) to anon, authenticated;

-- 관리자: 해결됨 표시 / 다시 열기 / 해결된 것 지우기
create or replace function public.admin_resolve_app_error(p_id uuid, p_resolved boolean)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_admin) then
    raise exception '관리자만 할 수 있어요.';
  end if;
  update public.app_errors set resolved_at = case when p_resolved then now() end where id = p_id;
end;
$$;
revoke execute on function public.admin_resolve_app_error(uuid, boolean) from public, anon, authenticated;
grant execute on function public.admin_resolve_app_error(uuid, boolean) to authenticated;

create or replace function public.admin_clear_resolved_errors()
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_n int;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_admin) then
    raise exception '관리자만 할 수 있어요.';
  end if;
  delete from public.app_errors where resolved_at is not null;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke execute on function public.admin_clear_resolved_errors() from public, anon, authenticated;
grant execute on function public.admin_clear_resolved_errors() to authenticated;
