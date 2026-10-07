-- =====================================================================
-- B-LOCK 9차: 회원 관리 (닉네임 변경 · 회원 탈퇴)  — 여러 번 실행해도 안전
--   - 닉네임을 바꾸면 커뮤니티에 이미 남긴 글·댓글의 이름도 함께 바뀜
--   - 회원 탈퇴: 계정과 내 이동수단·라이딩·글·댓글 등 연결된 데이터가 함께 지워짐 (외래키 on delete cascade)
-- =====================================================================

create or replace function public.change_nickname(p_nickname text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := btrim(coalesce(p_nickname, ''));
begin
  if auth.uid() is null then
    raise exception '로그인이 필요해요.';
  end if;
  if char_length(v_name) < 1 or char_length(v_name) > 20 then
    raise exception '닉네임은 1~20자로 정해 주세요.';
  end if;
  update public.profiles set nickname = v_name where id = auth.uid();
  -- 글·댓글에 저장해 둔 이름도 맞춰요 (커뮤니티에서 예전 닉네임이 남지 않게)
  update public.lost_posts set author_name = v_name where author_id = auth.uid();
  update public.post_comments set author_name = v_name where author_id = auth.uid();
  return v_name;
end;
$$;

-- lost_posts 수정 트리거가 author_name을 되돌리지 않도록: 이 함수 안에서만 허용
create or replace function public.lost_posts_before_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.author_id := auth.uid();
    new.author_name := coalesce((select nullif(nickname, '') from public.profiles where id = auth.uid()), '회원');
    new.comment_count := 0;
    new.status := 'open';
    if (select count(*) from public.lost_posts where author_id = auth.uid() and created_at > now() - interval '1 hour') >= 5 then
      raise exception '글은 1시간에 5개까지 올릴 수 있어요. 잠시 후 다시 시도해 주세요.';
    end if;
  else
    new.author_id := old.author_id;
    -- 닉네임 변경(change_nickname)일 때만 이름 변경 허용: 그 외에는 원래 이름 유지
    if new.author_name is distinct from old.author_name
       and new.author_name is distinct from (select nullif(nickname, '') from public.profiles where id = old.author_id) then
      new.author_name := old.author_name;
    end if;
    if current_setting('blocklock.counting', true) is distinct from 'on' then
      new.comment_count := old.comment_count;
    end if;
    new.created_at := old.created_at;
    new.updated_at := now();
  end if;

  if new.vehicle_id is not null and not exists (
    select 1 from public.vehicles v where v.id = new.vehicle_id and v.owner_id = new.author_id
  ) then
    raise exception '내 이동수단만 연결할 수 있어요.';
  end if;

  if new.image_path is null then
    new.image_bucket := null;
  elsif new.image_bucket = 'vehicle-images' then
    if not exists (select 1 from public.vehicles v where v.id = new.vehicle_id and v.image_path = new.image_path) then
      raise exception '사진 경로가 올바르지 않습니다.';
    end if;
  elsif new.image_bucket = 'community-images' then
    if new.image_path !~ ('^' || new.author_id::text || '/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$') then
      raise exception '사진 경로가 올바르지 않습니다.';
    end if;
  else
    raise exception '사진 경로가 올바르지 않습니다.';
  end if;
  return new;
end;
$$;

-- 회원 탈퇴: 로그인한 본인 계정만 지워요. 연결된 데이터는 외래키(on delete cascade)로 함께 지워집니다.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception '로그인이 필요해요.';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke execute on function public.change_nickname(text) from public, anon, authenticated;
revoke execute on function public.delete_my_account() from public, anon, authenticated;
grant execute on function public.change_nickname(text) to authenticated;
grant execute on function public.delete_my_account() to authenticated;

-- 탈퇴 전에 내 사진 폴더를 목록으로 보고 지울 수 있게 (공개 주소로 보는 것과는 별개로, 저장소 API의 목록·삭제는 읽기 권한이 필요)
drop policy if exists "own folder list" on storage.objects;
create policy "own folder list" on storage.objects for select to authenticated
  using (bucket_id in ('vehicle-images', 'community-images') and (storage.foldername(name))[1] = auth.uid()::text);
