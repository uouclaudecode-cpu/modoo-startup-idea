-- =====================================================================
-- B-LOCK 20차: 스티커 연결 끊기 · 지운 이동수단의 스티커 풀기 · 양도 때 조회 번호로 확인
-- (019 다음에 실행, 여러 번 실행해도 안전)
--   1) 주인이 잃어버리거나 망가진 스티커의 연결을 끊음 (다시 못 쓰게 막기 / 다른 이동수단에 다시 붙이기)
--   2) 이동수단을 지우면 연결된 스티커를 풀어서 다시 등록할 수 있게
--   3) 스티커가 붙고 떨어질 때 분실 글의 '스티커 있음' 표시를 맞춤
--   4) 양도 받기: 숨은 스티커 QR 대신 QR 아래 조회 번호 8자리로도 확인
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) 스티커 연결 끊기 (주인만)
--    p_code: 스티커 코드 전체 또는 QR 아래 조회 번호 8자리 (화면에는 조회 번호만 보여 줘요)
--    p_reuse = false: 잃어버렸거나 망가짐 → 스티커를 지워서 누가 주워 찍어도 등록할 수 없게
--    p_reuse = true : 다른 이동수단에 다시 붙일 때 → 새 스티커로 되돌려서 다시 찍어 연결
-- ---------------------------------------------------------------------
create or replace function public.unlink_sticker(p_vehicle uuid, p_code text, p_reuse boolean default false)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_code text := regexp_replace(coalesce(p_code, ''), '\s', '', 'g');
  v_target text;
  v_n int;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요해요.';
  end if;
  if not exists (select 1 from public.vehicles where id = p_vehicle and owner_id = auth.uid() and deleted_at is null) then
    raise exception '내 이동수단의 스티커만 연결을 끊을 수 있어요.';
  end if;
  if char_length(v_code) < 8 then
    raise exception '스티커를 찾을 수 없어요. 새로고침해 주세요.';
  end if;
  select count(*), min(code) into v_n, v_target
    from public.stickers
   where vehicle_id = p_vehicle
     and (code = v_code or (char_length(v_code) = 8 and left(code, 8) = v_code));
  if v_n = 0 then
    raise exception '이 이동수단에 연결된 스티커가 아니에요. 새로고침해 주세요.';
  end if;
  if v_n > 1 then
    raise exception '조회 번호가 같은 스티커가 여러 장이에요. 문의하기로 알려 주세요.';
  end if;
  if coalesce(p_reuse, false) then
    update public.stickers set vehicle_id = null, claimed_by = null, claimed_at = null where code = v_target;
  else
    delete from public.stickers where code = v_target;
  end if;
end;
$$;
revoke execute on function public.unlink_sticker(uuid, text, boolean) from public, anon;
grant execute on function public.unlink_sticker(uuid, text, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 2) 이동수단을 지우면 스티커를 풀어요 (지운 이동수단에 묶여 '사용할 수 없는 QR'로 남지 않게)
--    풀린 스티커는 새 스티커가 되어, 다시 찍으면 다른 이동수단에 등록할 수 있어요.
-- ---------------------------------------------------------------------
create or replace function public.vehicles_release_stickers()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    update public.stickers set vehicle_id = null, claimed_by = null, claimed_at = null where vehicle_id = new.id;
  end if;
  return null;
end;
$$;
drop trigger if exists vehicles_release_stickers on public.vehicles;
create trigger vehicles_release_stickers after update of deleted_at on public.vehicles
  for each row execute function public.vehicles_release_stickers();
revoke execute on function public.vehicles_release_stickers() from public, anon, authenticated;

-- 이미 지운 이동수단에 묶여 있던 스티커도 한 번 풀기
update public.stickers s
   set vehicle_id = null, claimed_by = null, claimed_at = null
  from public.vehicles v
 where v.id = s.vehicle_id and v.deleted_at is not null;

-- ---------------------------------------------------------------------
-- 3) 분실 글의 '스티커 있음' 표시: 스티커를 붙이거나(등록) 떼거나(연결 끊기·이동수단 삭제) 지울 때마다 다시 계산
--    (예전에는 글을 쓸 때만 계산해서, 스티커가 없어진 뒤에도 발견자에게 '스티커를 찍어 주세요'가 보였어요)
-- ---------------------------------------------------------------------
create or replace function public.stickers_sync_post_flag()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_ids uuid[] := '{}';
  v_prev text := current_setting('blocklock.backfill', true);
begin
  if tg_op in ('UPDATE', 'DELETE') and old.vehicle_id is not null then
    v_ids := array_append(v_ids, old.vehicle_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.vehicle_id is not null then
    v_ids := array_append(v_ids, new.vehicle_id);
  end if;
  if cardinality(v_ids) = 0 then
    return null;
  end if;
  -- 표시만 바꾸는 거라 글의 수정 시각은 그대로 둬요
  perform set_config('blocklock.backfill', 'on', true);
  update public.lost_posts p
     set has_sticker = x.has
    from (select pp.id, exists (select 1 from public.stickers s where s.vehicle_id = pp.vehicle_id) as has
            from public.lost_posts pp where pp.vehicle_id = any (v_ids)) x
   where p.id = x.id and p.has_sticker is distinct from x.has;
  perform set_config('blocklock.backfill', coalesce(nullif(v_prev, ''), 'off'), true);
  return null;
end;
$$;
drop trigger if exists stickers_sync_post_flag on public.stickers;
create trigger stickers_sync_post_flag after insert or delete or update of vehicle_id on public.stickers
  for each row execute function public.stickers_sync_post_flag();
revoke execute on function public.stickers_sync_post_flag() from public, anon, authenticated;

-- 지금 있는 글도 한 번 맞추기
do $$
begin
  perform set_config('blocklock.backfill', 'on', true);
  update public.lost_posts p
     set has_sticker = (p.vehicle_id is not null and exists (select 1 from public.stickers s where s.vehicle_id = p.vehicle_id))
   where p.has_sticker is distinct from (p.vehicle_id is not null and exists (select 1 from public.stickers s where s.vehicle_id = p.vehicle_id));
  perform set_config('blocklock.backfill', 'off', true);
end;
$$;

-- ---------------------------------------------------------------------
-- 4) 양도 받기 (019 최종본 + 실물 확인에 QR 아래 조회 번호 8자리 허용)
--    인쇄된 스티커에는 조회 번호(코드 앞 8자리)만 적혀 있어서, 카메라가 안 되면 그 번호로 확인해요.
--    양도 QR(10분짜리)이 있어야 하고, 판매자는 원래 전체 코드를 볼 수 있어서 확인이 약해지지 않아요.
-- ---------------------------------------------------------------------
create or replace function public.accept_transfer(p_token text, p_check text)
returns json
language plpgsql security definer set search_path = public as $$
declare
  t public.ownership_transfers;
  v public.vehicles;
  v_buyer uuid := auth.uid();
  v_check text := btrim(coalesce(p_check, ''));
  v_short text;
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

  -- 실물 확인: 스티커가 있으면 숨은 스티커 코드(또는 QR 아래 조회 번호 8자리), 없으면 차대번호 전체
  select count(*) into v_sticker_count from public.stickers where vehicle_id = v.id;
  if v_sticker_count > 0 then
    v_short := regexp_replace(v_check, '\s', '', 'g');
    if not exists (
      select 1 from public.stickers
       where vehicle_id = v.id
         and (code = v_check or (char_length(v_short) = 8 and lower(left(code, 8)) = lower(v_short)))
    ) then
      raise exception '자전거에 붙은 스티커와 맞지 않아요. 숨은 스티커를 다시 찍거나, QR 아래 조회 번호 8자리를 확인해 주세요.';
    end if;
    v_checked := true;
  elsif v.serial_hash is not null then
    if public.sha256_hex('b-lock-serial:' || upper(regexp_replace(v_check, '[^A-Za-z0-9]', '', 'g'))) <> v.serial_hash then
      raise exception '프레임에 새겨진 차대번호와 맞지 않아요.';
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
         purchased_on = null,
         purchase_place = null,
         image_path = null,
         owned_since = now(),
         status = 'active'
   where id = v.id;
  update public.stickers set claimed_by = v_buyer where vehicle_id = v.id;
  -- 사진 파일은 이전 주인 폴더에 있어서 정리 대기열로 (새 주인이 새로 올려요)
  if v.image_path is not null then
    insert into public.storage_cleanup_queue (bucket, path) values ('vehicle-images', v.image_path) on conflict do nothing;
  end if;
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
revoke execute on function public.accept_transfer(text, text) from public, anon;
grant execute on function public.accept_transfer(text, text) to authenticated;
