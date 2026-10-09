-- =====================================================================
-- B-LOCK 17차: 점검 보완 + 관리자 도구 (016 다음에 실행, 여러 번 실행해도 안전)
--   1) 탈퇴: 남은 사진 파일을 데이터베이스가 정리 대기열에 넣음 (화면 쪽 삭제가 실패해도 남지 않게)
--   2) 지운 이동수단: QR로 정보·사진이 보이지 않게, 사진 파일은 정리 대기열로
--   3) 관리자: 본인인증 표시, 회원 찾기, 숨겨진 도난 경보 확인
-- =====================================================================

-- 1) 탈퇴
create or replace function public.delete_my_account()
returns void
language plpgsql security definer set search_path = public, auth as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception '로그인이 필요해요.'; end if;
  -- 내 폴더에 남은 사진 (화면에서 못 지운 것까지)
  insert into public.storage_cleanup_queue (bucket, path)
  select o.bucket_id, o.name
    from storage.objects o
   where o.bucket_id in ('vehicle-images', 'community-images', 'community-secret', 'sighting-images', 'evidence')
     and o.name like v_uid::text || '/%'
  on conflict do nothing;
  delete from public.stickers
   where claimed_by = v_uid
      or vehicle_id in (select id from public.vehicles where owner_id = v_uid);
  delete from auth.users where id = v_uid;
end;
$$;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- 2) 지운 이동수단은 공개 정보를 주지 않음
create or replace function public.get_public_vehicle(p_token text)
returns table (qr_token text, type text, brand text, model text, color text, description text, image_path text, status text, available boolean)
language sql stable security definer set search_path = public as $$
  select p_token, v.type,
         case when v.deleted_at is null then v.brand end,
         case when v.deleted_at is null then v.model end,
         case when v.deleted_at is null then v.color end,
         case when v.deleted_at is null then v.description end,
         case when v.deleted_at is null then v.image_path end,
         case when v.deleted_at is null then v.status else 'active' end,
         v.deleted_at is null
    from public.vehicles v
   where v.id = public.resolve_vehicle(p_token)
   limit 1;
$$;
revoke execute on function public.get_public_vehicle(text) from public;
grant execute on function public.get_public_vehicle(text) to anon, authenticated;

-- 이동수단 사진 정리: 지우거나 사진을 바꾸면, 살아 있는 분실 글이 그 사진을 쓰지 않을 때 대기열로
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
  if v_old is not null and not exists (
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
drop trigger if exists vehicles_image_cleanup on public.vehicles;
create trigger vehicles_image_cleanup before update of deleted_at, image_path on public.vehicles
  for each row execute function public.vehicles_image_cleanup();

-- 이미 지운 이동수단의 사진도 한 번 정리
insert into public.storage_cleanup_queue (bucket, path)
select 'vehicle-images', v.image_path from public.vehicles v
 where v.deleted_at is not null and v.image_path is not null
   and not exists (select 1 from public.lost_posts p where p.image_bucket = 'vehicle-images' and p.image_path = v.image_path and p.deleted_at is null)
on conflict do nothing;

-- 3) 관리자 도구
create or replace function public.admin_find_users(p_query text)
returns table (id uuid, nickname text, email text, created_at timestamptz, identity_verified boolean, helped_count int, vehicles int)
language plpgsql stable security definer set search_path = public as $$
declare
  q text := '%' || replace(replace(btrim(coalesce(p_query, '')), '%', ''), '_', '') || '%';
begin
  if not public.is_admin() then raise exception '관리자만 볼 수 있어요.'; end if;
  return query
  select p.id, p.nickname, p.email, p.created_at, p.identity_verified,
         (select count(distinct s.alert_id)::int from public.sightings s where s.reporter_id = p.id and s.status = 'useful'),
         (select count(*)::int from public.vehicles v where v.owner_id = p.id and v.deleted_at is null)
    from public.profiles p
   where btrim(coalesce(p_query, '')) = '' or p.nickname ilike q or p.email ilike q
   order by p.created_at desc
   limit 30;
end;
$$;

create or replace function public.admin_set_identity(p_user uuid, p_verified boolean)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception '관리자만 바꿀 수 있어요.'; end if;
  update public.profiles set identity_verified = coalesce(p_verified, false) where id = p_user;
end;
$$;

create or replace function public.admin_list_flagged_alerts()
returns table (id uuid, status text, flag_count int, created_at timestamptz, place_label text, marks text, brand text, color text, type text, reasons text[])
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception '관리자만 볼 수 있어요.'; end if;
  return query
  select a.id, a.status, a.flag_count, a.created_at, a.place_label, a.marks, v.brand, v.color, v.type,
         array(select f.reason from public.alert_flags f where f.alert_id = a.id and f.reason is not null order by f.created_at desc limit 5)
    from public.theft_alerts a join public.vehicles v on v.id = a.vehicle_id
   where a.flag_count > 0 and a.status in ('open', 'hidden')
   order by (a.status = 'hidden') desc, a.flag_count desc, a.created_at desc
   limit 50;
end;
$$;

create or replace function public.admin_set_alert_status(p_alert uuid, p_status text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception '관리자만 바꿀 수 있어요.'; end if;
  if p_status not in ('open', 'hidden', 'cancelled') then raise exception '상태가 올바르지 않아요.'; end if;
  update public.theft_alerts set status = p_status,
         flag_count = case when p_status = 'open' then 0 else flag_count end
   where id = p_alert;
  if p_status = 'open' then delete from public.alert_flags where alert_id = p_alert; end if;
end;
$$;

revoke execute on function public.vehicles_image_cleanup() from public, anon, authenticated;
revoke execute on function public.admin_find_users(text) from public, anon;
grant execute on function public.admin_find_users(text) to authenticated;
revoke execute on function public.admin_set_identity(uuid, boolean) from public, anon;
grant execute on function public.admin_set_identity(uuid, boolean) to authenticated;
revoke execute on function public.admin_list_flagged_alerts() from public, anon;
grant execute on function public.admin_list_flagged_alerts() to authenticated;
revoke execute on function public.admin_set_alert_status(uuid, text) from public, anon;
grant execute on function public.admin_set_alert_status(uuid, text) to authenticated;
