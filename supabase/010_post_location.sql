-- =====================================================================
-- B-LOCK 10차: 분실 글에 잃어버린 위치(지도 핀) 저장 — 여러 번 실행해도 안전
--   잃어버린 '장소 설명'(lost_area)은 그대로 두고, 지도에서 고른 좌표를 함께 저장해요. (선택)
-- =====================================================================
alter table public.lost_posts add column if not exists lost_lat double precision check (lost_lat between -90 and 90);
alter table public.lost_posts add column if not exists lost_lng double precision check (lost_lng between -180 and 180);
