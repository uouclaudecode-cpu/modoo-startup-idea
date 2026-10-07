-- =====================================================================
-- B-LOCK 11차: 006~010을 함께 쓰도록 맞추기 (006·007·008·009·010 다음에 실행, 여러 번 실행해도 안전)
--   lost_posts_before_write 를 006(검사는 바뀐 열만)과 009(닉네임 변경 반영)를 합친 최종본으로 만들고,
--   '찾았어요'로 바꾼 시각(resolved_at)을 정확히 남겨요. (운영 통계의 주별 회수 그래프용)
-- =====================================================================

alter table public.lost_posts add column if not exists resolved_at timestamptz;

create or replace function public.lost_posts_before_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_check boolean;
begin
  if tg_op = 'INSERT' then
    new.author_id := auth.uid();
    new.author_name := coalesce((select nullif(nickname, '') from public.profiles where id = auth.uid()), '회원');
    new.comment_count := 0;
    new.status := 'open';
    new.resolved_at := null;
    if (select count(*) from public.lost_posts where author_id = auth.uid() and created_at > now() - interval '1 hour') >= 5 then
      raise exception '글은 1시간에 5개까지 올릴 수 있어요. 잠시 후 다시 시도해 주세요.';
    end if;
    v_check := true;
  else
    -- 바꿀 수 없는 값 (댓글 수는 댓글 트리거가 고칠 때만 바뀜)
    new.author_id := old.author_id;
    -- 이름은 닉네임 변경(change_nickname)으로 지금 닉네임과 같아질 때만 바뀜
    if new.author_name is distinct from old.author_name
       and new.author_name is distinct from (select nullif(nickname, '') from public.profiles where id = old.author_id) then
      new.author_name := old.author_name;
    end if;
    if current_setting('blocklock.counting', true) is distinct from 'on' then
      new.comment_count := old.comment_count;
    end if;
    new.created_at := old.created_at;
    -- 찾았어요로 바뀐 순간을 기록 (다시 찾는 중이면 지움). 예전 글 채우기(backfill) 때만 직접 넣은 값을 허용
    if current_setting('blocklock.backfill', true) is distinct from 'on' then
      if new.status = 'resolved' and old.status is distinct from 'resolved' then
        new.resolved_at := now();
      elsif new.status = 'open' then
        new.resolved_at := null;
      else
        new.resolved_at := old.resolved_at;
      end if;
      new.updated_at := now();
    end if;
    v_check := new.vehicle_id is distinct from old.vehicle_id
            or new.image_path is distinct from old.image_path
            or new.image_bucket is distinct from old.image_bucket;
  end if;

  if new.image_path is null then
    new.image_bucket := null;
  end if;

  if v_check then
    if new.vehicle_id is not null and not exists (
      select 1 from public.vehicles v where v.id = new.vehicle_id and v.owner_id = new.author_id
    ) then
      raise exception '내 이동수단만 연결할 수 있어요.';
    end if;

    if new.image_path is not null then
      if new.image_bucket = 'vehicle-images' then
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
    end if;
  end if;
  return new;
end;
$$;

-- 예전에 찾았어요로 바꾼 글: 마지막 수정 시각으로 채우기 (한 번만, 이미 있으면 그대로)
do $$
begin
  perform set_config('blocklock.backfill', 'on', true);
  update public.lost_posts set resolved_at = updated_at where status = 'resolved' and resolved_at is null;
  perform set_config('blocklock.backfill', 'off', true);
end;
$$;

-- 트리거 함수는 밖에서 부를 일이 없어요
revoke execute on function public.lost_posts_before_write() from public, anon, authenticated;
