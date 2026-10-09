-- 027: 스티커 받는 곳 · QR 출력 표시
-- 1) sticker_spots: 스티커를 받을 수 있는 장소 (누구나 보기, 관리자만 추가·수정·삭제)
-- 2) vehicles.qr_printed_at: 앱 QR을 출력했는지 (시작 안내의 'QR 붙이기' 완료 표시)
--    앱 QR이 새로 만들어지면(소유권 이전 등) 다시 비워요
-- 여러 번 실행해도 안전해요.

create table if not exists public.sticker_spots (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 60),
  address     text check (char_length(address) <= 120),
  hours       text check (char_length(hours) <= 60),
  note        text check (char_length(note) <= 200),
  lat         double precision not null check (lat between 33 and 39),
  lng         double precision not null check (lng between 124 and 132),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists sticker_spots_active_idx on public.sticker_spots (active, created_at desc);
alter table public.sticker_spots enable row level security;
drop policy if exists "anyone reads active spots" on public.sticker_spots;
create policy "anyone reads active spots" on public.sticker_spots for select to anon, authenticated
  using (active or (select public.is_admin()));
drop policy if exists "admin inserts spots" on public.sticker_spots;
create policy "admin inserts spots" on public.sticker_spots for insert to authenticated with check ((select public.is_admin()));
drop policy if exists "admin updates spots" on public.sticker_spots;
create policy "admin updates spots" on public.sticker_spots for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists "admin deletes spots" on public.sticker_spots;
create policy "admin deletes spots" on public.sticker_spots for delete to authenticated using ((select public.is_admin()));
revoke all on public.sticker_spots from anon, authenticated;
grant select on public.sticker_spots to anon, authenticated;
grant insert, update, delete on public.sticker_spots to authenticated;

alter table public.vehicles add column if not exists qr_printed_at timestamptz;

create or replace function public.mark_qr_printed(p_vehicle uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception '로그인이 필요해요.';
  end if;
  update public.vehicles set qr_printed_at = now()
   where id = p_vehicle and owner_id = auth.uid() and deleted_at is null;
end;
$$;
revoke execute on function public.mark_qr_printed(uuid) from public, anon;
grant execute on function public.mark_qr_printed(uuid) to authenticated;

-- 앱 QR이 바뀌면 예전에 출력한 QR은 쓸 수 없으니 출력 표시도 지워요
create or replace function public.vehicles_reset_printed()
returns trigger language plpgsql as $$
begin
  if new.qr_token is distinct from old.qr_token then
    new.qr_printed_at := null;
  end if;
  return new;
end;
$$;
drop trigger if exists vehicles_reset_printed on public.vehicles;
create trigger vehicles_reset_printed before update of qr_token on public.vehicles
  for each row execute function public.vehicles_reset_printed();
