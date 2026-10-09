-- =====================================================================
-- B-LOCK 21차: 소유권 넘기기를 링크로도 (020 다음에 실행, 여러 번 실행해도 안전)
--   - 직접 만나서: QR (또는 같은 링크를 채팅으로) · 10분
--   - 택배·원격 거래: 링크 · 3일. 구매자는 물건을 받은 뒤 숨은 스티커(또는 차대번호)를 확인해야 넘어가요
-- =====================================================================

alter table public.ownership_transfers add column if not exists mode text not null default 'qr' check (mode in ('qr', 'link'));

drop function if exists public.start_transfer(uuid);

create or replace function public.start_transfer(p_vehicle uuid, p_mode text default 'qr')
returns json
language plpgsql security definer set search_path = public as $$
declare
  v public.vehicles;
  v_token text;
  v_id uuid;
  v_mode text := case when p_mode = 'link' then 'link' else 'qr' end;
  v_exp timestamptz := now() + case when p_mode = 'link' then interval '3 days' else interval '10 minutes' end;
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
  -- 이전에 만든 대기 중 양도는 취소 (QR·링크 모두, 한 번에 하나만)
  update public.ownership_transfers set status = 'cancelled' where vehicle_id = p_vehicle and status = 'pending';
  v_token := public.random_token(18);
  insert into public.ownership_transfers (vehicle_id, from_user, token_hash, expires_at, mode)
  values (p_vehicle, auth.uid(), public.sha256_hex(v_token), v_exp, v_mode)
  returning id into v_id;
  return json_build_object('transfer_id', v_id, 'token', v_token, 'expires_at', v_exp, 'mode', v_mode);
end;
$$;

revoke execute on function public.start_transfer(uuid, text) from public, anon;
grant execute on function public.start_transfer(uuid, text) to authenticated;
