-- =====================================================================
-- B-LOCK 13차: 중고거래 안심인증 링크 + 직거래 소유권 양도 (012 다음에 실행, 여러 번 실행해도 안전)
--   1) 차대번호(해시로 저장, 끝 4자리만 보관) · 중복 등록 차단
--   2) 이동수단 핵심 값(소유자·QR·등록일·도난 이력)은 사용자가 직접 못 바꾸게 고정
--   3) 안심거래 링크: 공개 인증 화면(도난 이력·등록일·보유 기간·양도 횟수, 판매자 마스킹)
--   4) 소유권 양도: 10분짜리 양도 QR → 구매자가 숨은 스티커로 실물 확인 → 한 번에 이전
--      (정비 이력은 넘기고, 라이딩 경로·발견 제보·분실 글 연결은 넘기지 않음)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) 이동수단에 칸 추가
-- ---------------------------------------------------------------------
alter table public.vehicles add column if not exists serial_hash text;
alter table public.vehicles add column if not exists serial_last4 text;
alter table public.vehicles add column if not exists searching_count int not null default 0;
alter table public.vehicles add column if not exists last_recovered_at timestamptz;
alter table public.vehicles add column if not exists owned_since timestamptz;
update public.vehicles set owned_since = created_at where owned_since is null;
alter table public.vehicles alter column owned_since set default now();
-- 지금까지 수색 중이었던 기록이 있는 기기는 최소 1회로
update public.vehicles set searching_count = 1 where searching_count = 0 and status in ('searching', 'recovered');

create unique index if not exists vehicles_serial_unique on public.vehicles (serial_hash) where serial_hash is not null and deleted_at is null;

-- 사용자가 직접 바꾸면 안 되는 값은 고정하고, 수색 횟수·회수 시각은 상태가 바뀔 때 자동 기록
create or replace function public.vehicles_guard()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.serial_hash := null;
      new.serial_last4 := null;
      new.searching_count := 0;
      new.last_recovered_at := null;
      new.owned_since := now();
      new.created_at := now();
    else
      new.owner_id := old.owner_id;
      new.qr_token := old.qr_token;
      new.created_at := old.created_at;
      new.serial_hash := old.serial_hash;
      new.serial_last4 := old.serial_last4;
      new.searching_count := old.searching_count;
      new.last_recovered_at := old.last_recovered_at;
      new.owned_since := old.owned_since;
      new.odometer_m := old.odometer_m;
    end if;
  end if;
  if tg_op = 'INSERT' then
    if new.status = 'searching' then
      new.searching_count := 1;
    end if;
  else
    if new.status = 'searching' and old.status is distinct from 'searching' then
      new.searching_count := old.searching_count + 1;
    elsif old.status = 'searching' and new.status = 'recovered' then
      new.last_recovered_at := now();
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists vehicles_guard on public.vehicles;
create trigger vehicles_guard before insert or update on public.vehicles
  for each row execute function public.vehicles_guard();

-- ---------------------------------------------------------------------
-- 2) 소유 이력
-- ---------------------------------------------------------------------
create table if not exists public.vehicle_ownership_history (
  id          bigint generated always as identity primary key,
  vehicle_id  uuid not null references public.vehicles (id) on delete cascade,
  owner_id    uuid references auth.users (id) on delete set null,
  started_at  timestamptz not null default now(),
  ended_at    timestamptz,
  method      text not null check (method in ('register', 'transfer', 'admin_revert'))
);
create index if not exists ownership_history_vehicle_idx on public.vehicle_ownership_history (vehicle_id, started_at desc);
alter table public.vehicle_ownership_history enable row level security;
drop policy if exists "owner reads history" on public.vehicle_ownership_history;
create policy "owner reads history" on public.vehicle_ownership_history for select to authenticated
  using (exists (select 1 from public.vehicles v where v.id = vehicle_id and v.owner_id = auth.uid()));
revoke all on public.vehicle_ownership_history from anon, authenticated;
grant select on public.vehicle_ownership_history to authenticated;

-- 기존 이동수단은 등록 이력 1건씩
insert into public.vehicle_ownership_history (vehicle_id, owner_id, started_at, method)
select v.id, v.owner_id, v.created_at, 'register'
  from public.vehicles v
 where not exists (select 1 from public.vehicle_ownership_history h where h.vehicle_id = v.id);

create or replace function public.vehicles_after_insert_history()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.vehicle_ownership_history (vehicle_id, owner_id, started_at, method) values (new.id, new.owner_id, new.created_at, 'register');
  return new;
end;
$$;
drop trigger if exists vehicles_history on public.vehicles;
create trigger vehicles_history after insert on public.vehicles
  for each row execute function public.vehicles_after_insert_history();

-- ---------------------------------------------------------------------
-- 3) 공통 도우미
-- ---------------------------------------------------------------------
-- URL에 넣을 무작위 토큰 (예측 불가)
create or replace function public.random_token(p_bytes int default 16)
returns text language sql volatile set search_path = public as $$
  select replace(replace(replace(encode(extensions.gen_random_bytes(p_bytes), 'base64'), '+', '-'), '/', '_'), '=', '');
$$;

create or replace function public.sha256_hex(p text)
returns text language sql immutable set search_path = public as $$
  select encode(extensions.digest(p, 'sha256'), 'hex');
$$;

-- 닉네임 가리기: 뚜깔라 → 뚜*라, 김현 → 김*
create or replace function public.mask_nickname(p text)
returns text language plpgsql immutable as $$
declare
  n int := char_length(coalesce(p, ''));
begin
  if n = 0 then return '회원'; end if;
  if n = 1 then return '*'; end if;
  if n = 2 then return left(p, 1) || '*'; end if;
  return left(p, 1) || repeat('*', n - 2) || right(p, 1);
end;
$$;

-- ---------------------------------------------------------------------
-- 4) 차대번호 등록 (영문·숫자만 남겨 대문자로, 해시로 저장)
-- ---------------------------------------------------------------------
create or replace function public.set_vehicle_serial(p_vehicle uuid, p_serial text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_norm text := upper(regexp_replace(coalesce(p_serial, ''), '[^A-Za-z0-9]', '', 'g'));
  v_hash text;
begin
  if not exists (select 1 from public.vehicles where id = p_vehicle and owner_id = auth.uid() and deleted_at is null) then
    raise exception '내 이동수단만 바꿀 수 있어요.';
  end if;
  if v_norm = '' then
    update public.vehicles set serial_hash = null, serial_last4 = null where id = p_vehicle;
    return null;
  end if;
  if char_length(v_norm) < 5 or char_length(v_norm) > 30 then
    raise exception '차대번호는 영문·숫자 5~30자로 적어 주세요.';
  end if;
  v_hash := public.sha256_hex('b-lock-serial:' || v_norm);
  if exists (select 1 from public.vehicles where serial_hash = v_hash and id <> p_vehicle and deleted_at is null) then
    raise exception '이미 다른 계정에 등록된 차대번호예요. 내 것이 맞다면 문의하기로 알려 주세요.';
  end if;
  update public.vehicles set serial_hash = v_hash, serial_last4 = right(v_norm, 4) where id = p_vehicle;
  return right(v_norm, 4);
end;
$$;

-- ---------------------------------------------------------------------
-- 5) 안심거래 링크
-- ---------------------------------------------------------------------
create table if not exists public.trade_links (
  id          uuid primary key default gen_random_uuid(),
  vehicle_id  uuid not null references public.vehicles (id) on delete cascade,
  owner_id    uuid not null references auth.users (id) on delete cascade,
  token       text not null unique,
  check_code  text not null,
  expires_at  timestamptz not null,
  revoked_at  timestamptz,
  view_count  int not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists trade_links_vehicle_idx on public.trade_links (vehicle_id, created_at desc);
alter table public.trade_links enable row level security;
drop policy if exists "owner reads trade links" on public.trade_links;
create policy "owner reads trade links" on public.trade_links for select to authenticated using (owner_id = auth.uid());
revoke all on public.trade_links from anon, authenticated;
grant select on public.trade_links to authenticated;

create or replace function public.create_trade_link(p_vehicle uuid, p_hours int default 72)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v public.vehicles;
  v_token text;
  v_code text;
  v_exp timestamptz;
begin
  select * into v from public.vehicles where id = p_vehicle and owner_id = auth.uid() and deleted_at is null;
  if not found then
    raise exception '내 이동수단만 링크를 만들 수 있어요.';
  end if;
  if v.status = 'searching' then
    raise exception '수색 중인 이동수단은 안심거래 링크를 만들 수 없어요.';
  end if;
  if p_hours not in (24, 72, 168) then
    raise exception '유효기간을 다시 골라 주세요.';
  end if;
  if (select count(*) from public.trade_links where vehicle_id = p_vehicle and revoked_at is null and expires_at > now()) >= 3 then
    raise exception '사용 중인 링크가 3개예요. 안 쓰는 링크를 끈 뒤 다시 만들어 주세요.';
  end if;
  if (select count(*) from public.trade_links where owner_id = auth.uid() and created_at > now() - interval '1 day') >= 10 then
    raise exception '링크는 하루 10개까지 만들 수 있어요.';
  end if;
  v_token := public.random_token(16);
  v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');
  v_exp := now() + make_interval(hours => p_hours);
  insert into public.trade_links (vehicle_id, owner_id, token, check_code, expires_at) values (p_vehicle, auth.uid(), v_token, v_code, v_exp);
  return json_build_object('token', v_token, 'check_code', v_code, 'expires_at', v_exp);
end;
$$;

create or replace function public.revoke_trade_link(p_link uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.trade_links set revoked_at = now() where id = p_link and owner_id = auth.uid() and revoked_at is null;
end;
$$;

-- 공개 인증 화면 (로그인 없이). 개인정보는 마스킹 닉네임·가입 월만
create or replace function public.get_trade_verification(p_token text)
returns json
language plpgsql security definer set search_path = public as $$
declare
  l public.trade_links;
  v public.vehicles;
  v_nick text;
  v_member timestamptz;
  v_transfers int;
  v_sticker boolean;
  v_logs int;
  v_warn text[] := '{}';
begin
  select * into l from public.trade_links where token = p_token;
  if not found then
    return json_build_object('valid', false, 'reason', 'not_found');
  end if;
  select * into v from public.vehicles where id = l.vehicle_id;
  if v.id is null or v.deleted_at is not null then
    return json_build_object('valid', false, 'reason', 'deleted');
  end if;
  if v.owner_id <> l.owner_id then
    return json_build_object('valid', false, 'reason', 'transferred');
  end if;
  if l.revoked_at is not null then
    return json_build_object('valid', false, 'reason', 'revoked');
  end if;
  if l.expires_at <= now() then
    return json_build_object('valid', false, 'reason', 'expired');
  end if;
  if v.status = 'searching' then
    return json_build_object('valid', false, 'reason', 'flagged');
  end if;

  update public.trade_links set view_count = view_count + 1 where id = l.id;

  select p.nickname, p.created_at into v_nick, v_member from public.profiles p where p.id = v.owner_id;
  select count(*) into v_transfers from public.vehicle_ownership_history where vehicle_id = v.id and method = 'transfer';
  select exists (select 1 from public.stickers s where s.vehicle_id = v.id) into v_sticker;
  select count(*) into v_logs from public.maintenance_logs where vehicle_id = v.id;

  if v.created_at > now() - interval '14 days' then v_warn := array_append(v_warn, 'NEW_REGISTRATION'); end if;
  if v.owned_since > now() - interval '30 days' and v_transfers > 0 then v_warn := array_append(v_warn, 'RECENT_TRANSFER'); end if;
  if v.serial_hash is null then v_warn := array_append(v_warn, 'NO_SERIAL'); end if;

  return json_build_object(
    'valid', true,
    'vehicle', json_build_object('type', v.type, 'brand', v.brand, 'model', v.model, 'color', v.color, 'image_path', v.image_path),
    'registered_at', v.created_at,
    'owned_since', v.owned_since,
    'transfer_count', v_transfers,
    'searching_count', v.searching_count,
    'last_recovered_at', v.last_recovered_at,
    'serial_last4', v.serial_last4,
    'sticker_attached', v_sticker,
    'maintenance_count', v_logs,
    'odometer_m', v.odometer_m,
    'seller', json_build_object('masked_nickname', public.mask_nickname(v_nick), 'member_since', v_member),
    'warnings', v_warn,
    'check_code', l.check_code,
    'expires_at', l.expires_at,
    'checked_at', now()
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 6) 소유권 양도
-- ---------------------------------------------------------------------
create table if not exists public.ownership_transfers (
  id               uuid primary key default gen_random_uuid(),
  vehicle_id       uuid not null references public.vehicles (id) on delete cascade,
  from_user        uuid not null references auth.users (id) on delete cascade,
  to_user          uuid references auth.users (id) on delete set null,
  token_hash       text not null unique,
  status           text not null default 'pending' check (status in ('pending', 'completed', 'cancelled', 'expired')),
  sticker_checked  boolean not null default false,
  expires_at       timestamptz not null,
  completed_at     timestamptz,
  created_at       timestamptz not null default now()
);
create unique index if not exists one_pending_transfer on public.ownership_transfers (vehicle_id) where status = 'pending';
alter table public.ownership_transfers enable row level security;
drop policy if exists "parties read transfers" on public.ownership_transfers;
create policy "parties read transfers" on public.ownership_transfers for select to authenticated
  using (from_user = auth.uid() or to_user = auth.uid());
revoke all on public.ownership_transfers from anon, authenticated;
grant select on public.ownership_transfers to authenticated;

-- 판매자: 양도 시작 (비밀번호 재확인은 서버 라우트 /api/transfers 에서)
create or replace function public.start_transfer(p_vehicle uuid)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v public.vehicles;
  v_token text;
  v_id uuid;
  v_exp timestamptz := now() + interval '10 minutes';
begin
  select * into v from public.vehicles where id = p_vehicle and owner_id = auth.uid() and deleted_at is null for update;
  if not found then
    raise exception '내 이동수단만 넘길 수 있어요.';
  end if;
  if v.status = 'searching' then
    raise exception '수색 중인 이동수단은 넘길 수 없어요. 찾은 뒤 상태를 바꿔 주세요.';
  end if;
  if exists (
    select 1 from public.vehicle_ownership_history
     where vehicle_id = p_vehicle and method = 'transfer' and started_at > now() - interval '24 hours'
  ) then
    raise exception '양도받은 지 24시간이 지나야 다시 넘길 수 있어요.';
  end if;
  if (select count(*) from public.ownership_transfers where from_user = auth.uid() and created_at > now() - interval '1 day') >= 10 then
    raise exception '양도는 하루 10번까지 시작할 수 있어요.';
  end if;
  -- 이전에 만든 대기 중 양도는 취소
  update public.ownership_transfers set status = 'cancelled' where vehicle_id = p_vehicle and status = 'pending';
  v_token := public.random_token(18);
  insert into public.ownership_transfers (vehicle_id, from_user, token_hash, expires_at)
  values (p_vehicle, auth.uid(), public.sha256_hex(v_token), v_exp)
  returning id into v_id;
  return json_build_object('transfer_id', v_id, 'token', v_token, 'expires_at', v_exp);
end;
$$;

create or replace function public.cancel_transfer(p_transfer uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.ownership_transfers set status = 'cancelled' where id = p_transfer and from_user = auth.uid() and status = 'pending';
end;
$$;

-- 구매자: 양도 내용 미리 보기
create or replace function public.peek_transfer(p_token text)
returns json
language plpgsql security definer set search_path = public as $$
declare
  t public.ownership_transfers;
  v public.vehicles;
  v_nick text;
  v_sticker boolean;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요해요.';
  end if;
  select * into t from public.ownership_transfers where token_hash = public.sha256_hex(p_token);
  if not found then
    return json_build_object('status', 'not_found');
  end if;
  if t.status = 'pending' and t.expires_at <= now() then
    update public.ownership_transfers set status = 'expired' where id = t.id;
    t.status := 'expired';
  end if;
  if t.status <> 'pending' then
    return json_build_object('status', t.status, 'mine', t.to_user = auth.uid());
  end if;
  if t.from_user = auth.uid() then
    return json_build_object('status', 'self');
  end if;
  select * into v from public.vehicles where id = t.vehicle_id;
  select nickname into v_nick from public.profiles where id = t.from_user;
  select exists (select 1 from public.stickers s where s.vehicle_id = v.id) into v_sticker;
  return json_build_object(
    'status', 'pending',
    'vehicle', json_build_object('type', v.type, 'name', v.name, 'brand', v.brand, 'model', v.model, 'color', v.color, 'image_path', v.image_path),
    'serial_last4', v.serial_last4,
    'has_serial', v.serial_hash is not null,
    'requires_sticker', v_sticker,
    'seller', public.mask_nickname(v_nick),
    'expires_at', t.expires_at
  );
end;
$$;

-- 구매자: 받기 (한 트랜잭션에서 소유권·스티커·정비 이력 이전, 이전 주인 권한은 바로 사라짐)
create or replace function public.accept_transfer(p_token text, p_check text)
returns json
language plpgsql security definer set search_path = public as $$
declare
  t public.ownership_transfers;
  v public.vehicles;
  v_buyer uuid := auth.uid();
  v_check text := btrim(coalesce(p_check, ''));
  v_sticker_count int;
  v_checked boolean := false;
begin
  if v_buyer is null then
    raise exception '로그인이 필요해요.';
  end if;
  select * into t from public.ownership_transfers where token_hash = public.sha256_hex(p_token) for update;
  if not found then
    raise exception '양도 QR을 찾을 수 없어요.';
  end if;
  if t.status <> 'pending' then
    raise exception '이미 처리된 양도예요.';
  end if;
  if t.expires_at <= now() then
    update public.ownership_transfers set status = 'expired' where id = t.id;
    raise exception '양도 QR 시간이 지났어요. 판매자에게 다시 만들어 달라고 해 주세요.';
  end if;
  if t.from_user = v_buyer then
    raise exception '내 이동수단은 나에게 넘길 수 없어요.';
  end if;
  select * into v from public.vehicles where id = t.vehicle_id for update;
  if v.id is null or v.deleted_at is not null or v.owner_id <> t.from_user then
    update public.ownership_transfers set status = 'cancelled' where id = t.id;
    raise exception '더 이상 넘길 수 없는 이동수단이에요.';
  end if;
  if v.status = 'searching' then
    raise exception '수색 중인 이동수단은 받을 수 없어요.';
  end if;

  -- 실물 확인: 스티커가 있으면 숨은 스티커 코드, 없으면 차대번호 끝 4자리
  select count(*) into v_sticker_count from public.stickers where vehicle_id = v.id;
  if v_sticker_count > 0 then
    if not exists (select 1 from public.stickers where vehicle_id = v.id and code = v_check) then
      raise exception '자전거에 붙은 스티커와 맞지 않아요. 숨은 스티커를 다시 찍어 주세요.';
    end if;
    v_checked := true;
  elsif v.serial_last4 is not null then
    if upper(v_check) <> v.serial_last4 then
      raise exception '차대번호 끝 4자리가 맞지 않아요.';
    end if;
    v_checked := true;
  end if;

  if (select count(*) from public.vehicle_ownership_history
       where owner_id = t.from_user and method = 'transfer' and started_at > now() - interval '30 days') >= 4
     or (select count(*) from public.ownership_transfers
       where from_user = t.from_user and status = 'completed' and completed_at > now() - interval '30 days') >= 4 then
    raise exception '이 계정은 최근 양도가 많아 확인이 필요해요. 문의하기로 알려 주세요.';
  end if;

  -- 소유권 이전 (전 주인이 출력해 둔 QR·적어 둔 스티커 위치는 무효)
  update public.vehicles
     set owner_id = v_buyer,
         qr_token = public.random_token(18),
         sticker_spot = null,
         owned_since = now(),
         status = 'active'
   where id = v.id;
  update public.stickers set claimed_by = v_buyer where vehicle_id = v.id;
  -- 정비 이력은 기기와 함께
  update public.vehicle_parts set owner_id = v_buyer where vehicle_id = v.id;
  update public.maintenance_logs set owner_id = v_buyer where vehicle_id = v.id;
  -- 넘기지 않는 것: 라이딩 경로(전 주인 위치), 발견 제보(제보자 연락처), 분실 글 연결
  update public.rides set vehicle_id = null where vehicle_id = v.id;
  delete from public.reports where vehicle_id = v.id;
  -- 이동수단 사진을 쓰던 분실 글은 사진도 떼요 (사진은 이제 새 주인 것)
  update public.lost_posts
     set vehicle_id = null,
         image_path = case when image_bucket = 'vehicle-images' then null else image_path end,
         image_bucket = case when image_bucket = 'vehicle-images' then null else image_bucket end
   where vehicle_id = v.id;
  update public.trade_links set revoked_at = now() where vehicle_id = v.id and revoked_at is null;
  update public.ownership_transfers set status = 'cancelled' where vehicle_id = v.id and status = 'pending' and id <> t.id;

  update public.vehicle_ownership_history set ended_at = now() where vehicle_id = v.id and ended_at is null;
  insert into public.vehicle_ownership_history (vehicle_id, owner_id, method) values (v.id, v_buyer, 'transfer');
  update public.ownership_transfers
     set status = 'completed', to_user = v_buyer, completed_at = now(), sticker_checked = v_checked
   where id = t.id;

  perform public.send_push(v_buyer, '소유권을 받았어요', coalesce(v.name, '이동수단') || '이(가) 내 이동수단에 추가됐어요. 스티커를 새로 숨기고 위치를 적어 두세요.',
                           '/vehicles/' || v.id, 'transfer-' || t.id, 'all');
  perform public.send_push(t.from_user, '양도가 끝났어요', coalesce(v.name, '이동수단') || ' 소유권을 넘겼어요.', '/dashboard', 'transfer-' || t.id, 'all');

  return json_build_object('vehicle_id', v.id, 'completed_at', now(), 'sticker_checked', v_checked);
end;
$$;

-- ---------------------------------------------------------------------
-- 7) 권한
-- ---------------------------------------------------------------------
revoke execute on function public.vehicles_guard() from public, anon, authenticated;
revoke execute on function public.vehicles_after_insert_history() from public, anon, authenticated;
revoke execute on function public.random_token(int) from public, anon, authenticated;
revoke execute on function public.sha256_hex(text) from public, anon, authenticated;
revoke execute on function public.mask_nickname(text) from public, anon, authenticated;
revoke execute on function public.set_vehicle_serial(uuid, text) from public, anon;
grant execute on function public.set_vehicle_serial(uuid, text) to authenticated;
revoke execute on function public.create_trade_link(uuid, int) from public, anon;
grant execute on function public.create_trade_link(uuid, int) to authenticated;
revoke execute on function public.revoke_trade_link(uuid) from public, anon;
grant execute on function public.revoke_trade_link(uuid) to authenticated;
revoke execute on function public.get_trade_verification(text) from public;
grant execute on function public.get_trade_verification(text) to anon, authenticated;
revoke execute on function public.start_transfer(uuid) from public, anon;
grant execute on function public.start_transfer(uuid) to authenticated;
revoke execute on function public.cancel_transfer(uuid) from public, anon;
grant execute on function public.cancel_transfer(uuid) to authenticated;
revoke execute on function public.peek_transfer(text) from public, anon;
grant execute on function public.peek_transfer(text) to authenticated;
revoke execute on function public.accept_transfer(text, text) from public, anon;
grant execute on function public.accept_transfer(text, text) to authenticated;
