-- =====================================================================
-- B-LOCK 15차: 소유 증명(증거 보관함 + 증명서) · 소모품 지금 상태 맞추기 (014 다음에 실행, 여러 번 실행해도 안전)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) 소모품: 이미 타던 이동수단의 마지막 교체일·그 뒤 탄 거리 맞추기 (정비 기록은 남기지 않음)
-- ---------------------------------------------------------------------
create or replace function public.set_part_baseline(p_part uuid, p_last date, p_km double precision)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
begin
  if p_last is null or p_last > v_today or p_last < date '2000-01-01' then raise exception '마지막 교체일을 확인해 주세요.'; end if;
  if p_km is null or p_km < 0 or p_km > 100000 then raise exception '그동안 탄 거리를 확인해 주세요.'; end if;
  update public.vehicle_parts
     set last_serviced_at = case when p_last = v_today then now() else (p_last::timestamp at time zone 'Asia/Seoul') end,
         distance_m = p_km * 1000,
         updated_at = now()
   where id = p_part and owner_id = auth.uid();
  if not found then raise exception '내 소모품만 바꿀 수 있어요.'; end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 2) 구매 정보 (주인이 직접 적음)
-- ---------------------------------------------------------------------
alter table public.vehicles add column if not exists purchased_on date;
alter table public.vehicles add column if not exists purchase_place text check (char_length(purchase_place) <= 60);

-- ---------------------------------------------------------------------
-- 3) 증거 보관함 (비공개 사진: 차대번호·영수증·사방·고유 특징)
-- ---------------------------------------------------------------------
create table if not exists public.vehicle_evidence (
  id          uuid primary key default gen_random_uuid(),
  vehicle_id  uuid not null references public.vehicles (id) on delete cascade,
  owner_id    uuid not null references auth.users (id) on delete cascade default auth.uid(),
  kind        text not null check (kind in ('serial', 'receipt', 'front', 'back', 'left', 'right', 'detail')),
  photo_path  text not null,
  note        text check (char_length(note) <= 200),
  created_at  timestamptz not null default now()
);
create index if not exists vehicle_evidence_vehicle_idx on public.vehicle_evidence (vehicle_id, created_at);
alter table public.vehicle_evidence enable row level security;
drop policy if exists "owner reads evidence" on public.vehicle_evidence;
create policy "owner reads evidence" on public.vehicle_evidence for select to authenticated using (owner_id = auth.uid());
drop policy if exists "owner adds evidence" on public.vehicle_evidence;
create policy "owner adds evidence" on public.vehicle_evidence for insert to authenticated with check (
  owner_id = auth.uid()
  and exists (select 1 from public.vehicles v where v.id = vehicle_id and v.owner_id = auth.uid() and v.deleted_at is null)
  and photo_path ~ ('^' || auth.uid()::text || '/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$')
  and (select count(*) from public.vehicle_evidence e where e.vehicle_id = vehicle_evidence.vehicle_id) < 20
);
drop policy if exists "owner deletes evidence" on public.vehicle_evidence;
create policy "owner deletes evidence" on public.vehicle_evidence for delete to authenticated using (owner_id = auth.uid());
revoke all on public.vehicle_evidence from anon, authenticated;
grant select, insert, delete on public.vehicle_evidence to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('evidence', 'evidence', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
drop policy if exists "evidence upload own folder" on storage.objects;
create policy "evidence upload own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'evidence' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "evidence read own folder" on storage.objects;
create policy "evidence read own folder" on storage.objects for select to authenticated
  using (bucket_id = 'evidence' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "evidence delete own folder" on storage.objects;
create policy "evidence delete own folder" on storage.objects for delete to authenticated
  using (bucket_id = 'evidence' and (storage.foldername(name))[1] = auth.uid()::text);

-- 지운 증거 사진은 정리 대기열로
create or replace function public.vehicle_evidence_after_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.storage_cleanup_queue (bucket, path) values ('evidence', old.photo_path) on conflict do nothing;
  return old;
end;
$$;
drop trigger if exists vehicle_evidence_after_delete on public.vehicle_evidence;
create trigger vehicle_evidence_after_delete after delete on public.vehicle_evidence
  for each row execute function public.vehicle_evidence_after_delete();

-- 소유권이 넘어가면 이전 주인의 증거(영수증 등 개인 자료)와 구매 정보는 지움
create or replace function public.vehicles_owner_changed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.owner_id is distinct from old.owner_id then
    delete from public.vehicle_evidence where vehicle_id = new.id and owner_id = old.owner_id;
    update public.certificates set revoked_at = now() where vehicle_id = new.id and revoked_at is null;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 4) 소유 증명서 (경찰·보험 제출용, QR로 진위 확인)
-- ---------------------------------------------------------------------
create table if not exists public.certificates (
  id          uuid primary key default gen_random_uuid(),
  vehicle_id  uuid not null references public.vehicles (id) on delete cascade,
  owner_id    uuid not null references auth.users (id) on delete cascade,
  token       text not null unique,
  issued_at   timestamptz not null default now(),
  revoked_at  timestamptz
);
create index if not exists certificates_vehicle_idx on public.certificates (vehicle_id, issued_at desc);
alter table public.certificates enable row level security;
drop policy if exists "owner reads certificates" on public.certificates;
create policy "owner reads certificates" on public.certificates for select to authenticated using (owner_id = auth.uid());
revoke all on public.certificates from anon, authenticated;
grant select on public.certificates to authenticated;

drop trigger if exists vehicles_owner_changed on public.vehicles;
create trigger vehicles_owner_changed after update of owner_id on public.vehicles
  for each row execute function public.vehicles_owner_changed();

-- 발급: 30일 안에 발급한 게 있으면 그걸 다시 써요
create or replace function public.issue_certificate(p_vehicle uuid)
returns json
language plpgsql security definer set search_path = public as $$
declare
  c public.certificates;
begin
  if not exists (select 1 from public.vehicles where id = p_vehicle and owner_id = auth.uid() and deleted_at is null) then
    raise exception '내 이동수단만 증명서를 만들 수 있어요.';
  end if;
  select * into c from public.certificates
   where vehicle_id = p_vehicle and owner_id = auth.uid() and revoked_at is null and issued_at > now() - interval '30 days'
   order by issued_at desc limit 1;
  if c.id is null then
    insert into public.certificates (vehicle_id, owner_id, token) values (p_vehicle, auth.uid(), public.random_token(16)) returning * into c;
  end if;
  return json_build_object('id', c.id, 'token', c.token, 'issued_at', c.issued_at);
end;
$$;

-- 진위 확인 (누구나): 발급 사실·기기 요약·소유 이력. 사진·개인정보는 없음
create or replace function public.get_certificate(p_token text)
returns json
language plpgsql security definer set search_path = public as $$
declare
  c public.certificates;
  v public.vehicles;
  v_nick text;
begin
  select * into c from public.certificates where token = p_token;
  if not found then return json_build_object('valid', false, 'reason', 'not_found'); end if;
  select * into v from public.vehicles where id = c.vehicle_id;
  if v.id is null or v.deleted_at is not null then return json_build_object('valid', false, 'reason', 'deleted'); end if;
  if c.revoked_at is not null or v.owner_id <> c.owner_id then
    return json_build_object('valid', false, 'reason', 'owner_changed', 'issued_at', c.issued_at);
  end if;
  select nickname into v_nick from public.profiles where id = v.owner_id;
  return json_build_object(
    'valid', true,
    'issued_at', c.issued_at,
    'vehicle', json_build_object('type', v.type, 'brand', v.brand, 'model', v.model, 'color', v.color),
    'owner', public.mask_nickname(v_nick),
    'registered_at', v.created_at,
    'owned_since', v.owned_since,
    'serial_last4', v.serial_last4,
    'status', v.status,
    'sticker_attached', exists (select 1 from public.stickers s where s.vehicle_id = v.id),
    'evidence', (select coalesce(json_object_agg(kind, n), '{}'::json) from (select kind, count(*) n from public.vehicle_evidence where vehicle_id = v.id group by kind) e),
    'transfer_count', (select count(*) from public.vehicle_ownership_history h where h.vehicle_id = v.id and h.method = 'transfer')
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 5) 권한
-- ---------------------------------------------------------------------
revoke execute on function public.vehicle_evidence_after_delete() from public, anon, authenticated;
revoke execute on function public.vehicles_owner_changed() from public, anon, authenticated;
revoke execute on function public.set_part_baseline(uuid, date, double precision) from public, anon;
grant execute on function public.set_part_baseline(uuid, date, double precision) to authenticated;
revoke execute on function public.issue_certificate(uuid) from public, anon;
grant execute on function public.issue_certificate(uuid) to authenticated;
revoke execute on function public.get_certificate(text) from public;
grant execute on function public.get_certificate(text) to anon, authenticated;
