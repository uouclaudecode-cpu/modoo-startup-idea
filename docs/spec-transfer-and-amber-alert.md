# B-LOCK 대형 기능 명세: A. 안심거래·소유권 양도 / B. 도난 경보·현상금

> 기준: 지금 B-LOCK 구조(Next.js + Supabase, vehicles·stickers·reports·push 파이프라인)를 그대로 확장하는 설계예요.
> API는 Supabase RPC(SECURITY DEFINER) + Next 라우트(`/api/...`)로 나눠 적었어요. 모든 RPC는 `set search_path = public`, anon/authenticated 권한은 필요한 것만 grant.

## 0. 먼저 짚을 전제 (설계에 반영함)

| 항목 | 내용 | 설계 반영 |
|---|---|---|
| B-LOCK에는 "기기 제어·실시간 추적"이 없음 | 하드웨어가 없는 QR 서비스 | A-3의 "권한 파기" = 열람·수정·제보 수신·QR 연결 권한 파기 |
| 등록 ≠ 법적 소유 증명 | 도둑이 먼저 등록할 수 있음 | 인증 화면에 "등록 소유자 확인"으로 표기, 등록 기간·차대번호 중복 검사로 보완 |
| 현상금 "예치(에스크로)"는 돈을 맡는 행위 | 전자금융업 등록 또는 PG사 에스크로·지급대행 계약이 필요 | **1단계: 약속형(돈 안 맡음)** → **2단계: PG 연동 예치**. DB는 2단계까지 고려 |
| 반경 3km 푸시 = 이용자 위치 수집 | 위치정보법상 위치기반서비스사업 신고, 위치 동의 필요 | 기본은 "관심 지역(직접 고른 동네)", 실시간 위치는 선택 동의 + 앱 사용 중에만, 약 1km 격자로만 저장 |
| 라이딩 경로·발견 제보자 연락처는 전 주인의 개인정보 | 양도 시 넘기면 안 됨 | 정비 이력만 넘기고, 라이딩·제보·분실 글은 넘기지 않음 |

---

## A. 중고거래 안심인증 & 1초 소유권 양도

### A-1. 안심거래 인증 링크/QR

**처리 흐름**

1. 판매자: 내 이동수단 → `안심거래 링크 만들기` → 유효기간(24시간/3일/7일) 선택.
2. 서버(`create_trade_link`)가 검사:
   - 내 이동수단인지(owner), 삭제되지 않았는지
   - 상태가 `searching`(수색 중)·`reported`가 아닌지, 열린 도난 경보가 없는지
   - 진행 중인 양도가 없는지
3. 통과하면 추측 불가 토큰(22자) + 6자리 확인 코드 생성 → `https://b-lock-app.vercel.app/v/{token}` 과 QR 이미지 반환.
4. 판매자가 당근·번개장터 글에 링크(또는 QR 이미지)를 붙여넣음.
5. 구매자가 링크를 열면 공개 인증 화면:
   - 사진·종류·브랜드·모델·색상
   - **도난 이력**: 없음 / 과거 도난 신고 후 회수(날짜) / 현재 수색 중(이 경우 링크 자체가 무효)
   - **등록일**(월 단위), **현 소유자 보유 기간**(예: 8개월), **양도 횟수**
   - **차대번호 등록 여부**(번호는 끝 4자리만: `****1234`)
   - **QR 스티커 부착 여부**, 정비 기록 건수
   - 판매자: 마스킹 닉네임(`뚜*라`), 가입 기간. 이메일·이름·전화번호는 표시 안 함
   - **실시간 확인 표시**: 조회 시각(초 단위) + 6자리 확인 코드 → 캡처 위조 방지("판매자 화면의 코드와 같은지 확인하세요")
   - 경고 배지: 등록 14일 미만 / 최근 30일 내 양도됨 / 차대번호 미등록
6. 판매자는 언제든 `링크 끄기` 가능. 양도 완료·도난 신고 시 자동 무효.

**악용 방지**

- 캡처·가짜 페이지: 반드시 `b-lock-app.vercel.app` 주소에서만 유효하다고 안내 + 확인 코드 + 조회 시각. 구매자가 링크 대신 앱에서 `코드로 확인`(6자리 + 차대번호 끝 4자리) 가능.
- 등록하자마자 판매(장물 의심): 등록 7일 미만이면 링크 생성은 되지만 화면에 빨간 경고. 차대번호 없으면 "도난 이력 대조 불가" 표시.
- 차대번호 중복: `vehicles.serial_hash` 유니크. 다른 계정에 이미 있거나, 도난 경보 중인 번호면 등록 차단 + 기존 소유자에게 알림.
- 대량 생성: 이동수단당 동시에 유효한 링크 3개, 하루 10개.

### A-2. 직거래 현장 소유권 이전(핸드오버)

**처리 흐름**

1. 판매자: `소유권 넘기기` → **비밀번호 다시 입력**(폰 분실·옆사람 조작 방지) → `start_transfer`.
2. 서버가 A-1과 같은 검사 + 최근 24시간 내 양도받은 기기가 아닌지(빠른 돌리기 차단) 확인 → 10분짜리 양도 토큰·QR 생성(`/t/{token}`), 판매자 화면에 카운트다운.
3. 구매자: 로그인한 B-LOCK 앱으로 QR 스캔 → 양도 내용 확인 화면(사진·모델·색상·차대번호 끝 4자리·판매자 마스킹 닉네임).
4. **실물 대조(2차 은닉 QR)**: 구매자가 자전거에 붙은 숨은 스티커를 직접 찍거나 스티커 코드 입력 → 이 기기에 연결된 스티커와 일치해야 다음 단계. (스티커가 없는 기기는 차대번호 끝 4자리 입력으로 대체, 화면에 "실물 대조 약함" 표시)
5. 구매자 `받기` → `accept_transfer` 한 트랜잭션에서:
   - 양도 행 잠금(`for update`), 상태 `pending`·만료 전·판매자가 아직 소유자인지 재확인
   - `vehicles.owner_id` = 구매자, `qr_token` 새로 발급(전 주인이 출력해 둔 QR 무효), `sticker_spot` 비움(전 주인이 아는 위치라서)
   - 연결된 스티커의 `claimed_by` = 구매자
   - **넘기는 것**: 정비 부품 상태·정비 다이어리(보증·정비 이력)
   - **넘기지 않는 것**: 라이딩 기록(경로=전 주인 위치정보), 발견 제보(제보자 연락처), 분실 글 → 전 주인 쪽에 남기되 기기 연결만 끊음
   - `vehicle_ownership_history`에 기록, 진행 중 인증 링크 전부 무효
6. 양쪽에 푸시: 구매자 "소유권을 받았어요. 스티커 위치를 새로 숨기고 적어 두세요", 판매자 "양도가 끝났어요".
7. 구매자 앱이 `스티커 새로 숨기기` 안내(원하면 새 스티커 발급 요청).

**예외 처리**

| 상황 | 처리 |
|---|---|
| 10분 지남 | `expired`, 판매자가 다시 생성 |
| 판매자가 중간에 취소 | `cancelled`, 구매자 화면 즉시 "취소됨" |
| 구매자가 판매자 본인 | 거부 |
| 같은 QR을 두 명이 동시에 스캔 | 먼저 `accept`한 1명만 성공(행 잠금), 나머지 "이미 처리됨" |
| 도중에 도난 신고가 들어옴 | 양도 즉시 무효 |
| 한 계정이 한 달에 양도 4회 이상 | 다음 양도는 관리자 확인 대기 (중고 업자·장물 돌리기 신호) |

### A-3. 거래 완료 후 원소유주 권한 즉시 차단

- 소유자 판정이 모두 `vehicles.owner_id` 기준 RLS라서, 5단계가 커밋되는 순간 전 주인은 열람·수정·상태 변경·제보 수신이 모두 막혀요(별도 작업 없이 "영구 파기").
- 추가로: 이전 `qr_token` 폐기, 인증 링크 무효, 전 주인 쪽 해당 기기 정비 알림 중단, 진행 중 양도 토큰 폐기.
- 전 주인은 이 기기에 도난 경보를 낼 수 없음(소유자가 아니므로) → "팔고 나서 도난 신고" 사기 차단.
- 분쟁(사기 거래 등)은 `문의하기` → 관리자가 `admin_revert_transfer`로 되돌림(이력 기록).

---

## B. 반경 3km 도난 경보(앰버 알러트) & 현상금

### B-1. 위치 기반 긴급 도난 경보 푸시

**처리 흐름**

1. 피해자: 내 이동수단 → `도난 경보 보내기`.
   - 잃어버린 시각, 장소(지도 핀), 특이 흠집·튜닝 파츠(짧은 목록), 사진(등록 사진 기본)
   - 경찰 신고 번호(선택, 넣으면 "경찰 신고 완료" 배지와 반경 확대 허용)
   - 반경 1km 기본 / 경찰 신고 번호가 있으면 최대 3km
2. 서버(`create_theft_alert`) 검사: 소유자, 같은 기기에 열린 경보 없음, 계정 30일에 경보 2회 이하, 최근 24시간 내 양도받은 기기면 관리자 확인 대기.
3. 경보 생성 → 기기 상태 `searching`, 인증 링크·양도 무효, 차대번호 "도난 중" 표시.
4. 받는 사람 고르기(`fanout_theft_alert`, pg_net으로 기존 `/api/push` 사용):
   - **관심 지역**을 등록했거나, **실시간 위치 동의** 후 최근 7일 안에 앱을 연 사람 중 경보 지점에서 반경 안
   - 피해자 본인·차단 관계 제외, 경보 알림 끈 사람 제외
   - 가까운 순 최대 500명
   - 30분 안에 목격 제보가 없으면 반경 단계 확대(1km → 2km → 최대 3km), 단 이미 받은 사람은 다시 안 보냄
5. 푸시 문구: "🚨 근처에서 검정 삼천리 자전거 도난 (약 800m)" → 누르면 요약 카드(사진·색·흠집·튜닝·현상금·잃어버린 시각), 정확한 지점 대신 약 100m 반올림 위치.
6. 경보는 72시간 뒤 자동 종료(1회 연장 가능), 회수 시 즉시 종료 → 받은 사람에게 "찾았어요" 알림은 보내지 않음(피로도 줄이기). 앱 안 경보 목록에서만 회수 표시.

**알림 피로도 제어**

- 한 사람당 경보 푸시 하루 3건, 30분에 1건까지. 넘치면 앱 안 "근처 경보" 목록에만.
- 조용한 시간 23:00~07:00 기본(설정에서 끌 수 있음).
- 같은 경보 중복 발송 금지(`theft_alert_deliveries` 유니크).
- 설정: 경보 받기 끔/켬, 받을 반경(500m~3km), 관심 지역 최대 2곳.

### B-2. 현상금(감사 리워드) 등록 및 예치

**1단계(시제품, 지금 바로 가능)**: 약속형

- 피해자가 금액(1만~5만 원, 5천 원 단위) 또는 "기프티콘"을 **약속**으로 표시. 돈은 B-LOCK이 맡지 않음.
- 회수 후 B-4에서 피해자가 `지급 완료` 누르고, 제보자가 `받았어요` 확인 → 양쪽 평판(지급률) 기록.
- 약속을 안 지키면: 제보자가 `미지급 신고` → 피해자 프로필에 "현상금 미지급" 배지, 다음 경보에서 현상금 설정 불가.

**2단계(PG 계약 후)**: 예치형

1. 경보 만들 때 현상금 금액 선택 → `POST /api/bounties/{id}/fund` → PG(예: 토스페이먼츠 에스크로·지급대행) 결제창.
2. 결제 승인 웹훅 → `bounties.status = held`.
3. 지급(B-4) 또는 환불(목격 제보 없이 경보 만료·취소) 시 PG 지급/취소 API 호출 → 원장(`bounty_ledger`)에 기록.
4. 출금 받는 제보자는 본인인증 + 계좌 등록 필수.

**먹튀 방지**

- 2단계에서 "유용함"으로 표시된 제보가 하나라도 있으면 피해자가 현상금을 혼자 회수(환불)할 수 없음 → 관리자 검토로만 환불.
- 경보를 "취소"했는데 기기 상태가 곧바로 `recovered`·회수로 바뀌면 → 자동으로 관리자 검토.
- 현상금 상한 5만 원(도둑이 훔치고 돌려주며 돈 받는 동기 줄이기).

### B-3. 익명 목격 제보 & 위치 핑

**처리 흐름**

1. 경보 카드 → `봤어요` → 카메라 바로 열기(앨범 선택 불가) → 사진 1장 + 현재 위치 자동 + 한 줄 메모(선택) → 보내기. 탭 2번이면 끝.
2. 서버 검사: 위치 정확도 100m 이하, 경보 지점에서 20km 이내, 목격 시각이 지금부터 2시간 이내, 같은 사진(해시) 중복 아님.
3. 피해자에게 푸시 "목격 제보가 왔어요 (경보 지점에서 1.2km)" → 지도 핀 + 사진.
4. 피해자에게 제보자는 `목격자 #3`으로만 보임. 필요하면 앱 안 대화(중계)로만 연락, 연락처 교환은 선택.
5. 현상금 받으려면 로그인 필요. 로그인 없이도 제보는 가능(현상금 대상 아님).
6. 화면 고정 안내: "직접 다가가거나 되찾으려 하지 마세요. 위험하면 112".

**악용 방지**

- 한 사람 제보 1시간 5건, 같은 경보에 3건까지.
- 피해자가 `허위`로 표시한 제보가 많은 계정은 제보 권한 정지.
- 제보자가 피해자 본인·같은 기기 전 주인·같은 푸시 기기면 현상금 대상 제외.

### B-4. 제보 검증 & 리워드 지급 승인

**처리 흐름**

1. 피해자가 되찾으면 `회수 완료` → **숨은 스티커를 직접 찍어 실물 회수 증명**(스티커 없는 기기는 사진 + 차대번호 끝 4자리).
2. 도움이 된 제보 선택(여러 개면 금액 나눔, 비율 지정).
3. 경보 종료, 기기 상태 `recovered`.
4. 지급:
   - 1단계: 피해자 `지급 완료` → 제보자 `받았어요` 확인 → 끝
   - 2단계: **24시간 이의 기간** 후 자동 지급. 단 금액 3만 원 이상, 제보자 가입 3일 미만, 피해자·제보자 같은 기기·같은 IP 대역 신호 → 관리자 승인 후 지급
5. 이의 제기(`dispute`) 들어오면 지급 보류 → 관리자 판정.

**허위 도난 신고 방지**

- 다른 사람의 자전거를 등록하고 경보를 내 "사람을 쫓게 만드는" 악용 → 경보 카드에 "등록자 신고 내용"으로 표기, 직접 대면 금지 안내, 목격자에게 탈것 탄 사람 사진 요구 안 함(기기만).
- 경보 신고 버튼(`이 경보 이상해요`) 3명 이상 → 자동 비공개 + 관리자 확인.
- 허위로 판정되면 계정 경보 기능 영구 정지.
- 등록 24시간 미만 기기는 반경 1km 고정, 관리자 확인 후 확대.

---

## 3. 데이터베이스 테이블

> 기존 테이블에 더하는 것: `vehicles.serial_hash text unique`(차대번호 정규화 후 sha256), `vehicles.serial_last4 text`, `profiles.alert_opt_in boolean default false`, `profiles.alert_quiet_hours boolean default true`.

### A. 안심거래·양도

```sql
-- 안심거래 인증 링크
create table public.trade_links (
  id           uuid primary key default gen_random_uuid(),
  vehicle_id   uuid not null references public.vehicles(id) on delete cascade,
  owner_id     uuid not null references auth.users(id) on delete cascade,
  token        text not null unique,              -- 22자 무작위
  check_code   text not null,                     -- 6자리, 캡처 위조 확인용
  expires_at   timestamptz not null,
  revoked_at   timestamptz,
  view_count   int not null default 0,
  created_at   timestamptz not null default now()
);

-- 소유권 양도
create table public.ownership_transfers (
  id            uuid primary key default gen_random_uuid(),
  vehicle_id    uuid not null references public.vehicles(id) on delete cascade,
  from_user     uuid not null references auth.users(id),
  to_user       uuid references auth.users(id),
  token_hash    text not null unique,             -- QR 토큰은 해시로만 저장
  status        text not null default 'pending' check (status in ('pending','completed','cancelled','expired','held')),
  sticker_checked boolean not null default false, -- 실물 대조 여부
  expires_at    timestamptz not null,             -- 생성 + 10분
  completed_at  timestamptz,
  cancel_reason text,
  created_at    timestamptz not null default now()
);
create unique index one_pending_transfer on public.ownership_transfers(vehicle_id) where status = 'pending';

-- 소유 이력 (공개 화면에는 횟수·기간만)
create table public.vehicle_ownership_history (
  id          bigint generated always as identity primary key,
  vehicle_id  uuid not null references public.vehicles(id) on delete cascade,
  owner_id    uuid references auth.users(id) on delete set null,
  started_at  timestamptz not null,
  ended_at    timestamptz,
  method      text not null check (method in ('register','transfer','admin_revert'))
);
```

### B. 도난 경보·목격·현상금

```sql
create extension if not exists postgis with schema extensions;

-- 관심 지역 / 최근 위치(동의자만, 약 1km 격자로 반올림)
create table public.alert_areas (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null check (kind in ('area','recent')),  -- 직접 고른 동네 / 앱 사용 중 위치
  geom       extensions.geography(point) not null,
  radius_m   int not null default 2000 check (radius_m between 500 and 3000),
  updated_at timestamptz not null default now()
);
create index on public.alert_areas using gist (geom);
-- 'recent'는 7일 지나면 크론으로 삭제

create table public.theft_alerts (
  id              uuid primary key default gen_random_uuid(),
  vehicle_id      uuid not null references public.vehicles(id) on delete cascade,
  owner_id        uuid not null references auth.users(id) on delete cascade,
  status          text not null default 'open' check (status in ('review','open','resolved','cancelled','expired','hidden')),
  lost_at         timestamptz not null,
  geom            extensions.geography(point) not null,  -- 정확한 위치 (피해자·관리자만)
  public_lat      double precision not null,             -- 약 100m 반올림 (공개 카드용)
  public_lng      double precision not null,
  radius_m        int not null default 1000 check (radius_m between 500 and 3000),
  marks           text check (char_length(marks) <= 300),  -- 흠집·튜닝
  police_report_no text,
  expires_at      timestamptz not null,                   -- 생성 + 72시간
  extended        boolean not null default false,
  resolved_at     timestamptz,
  flag_count      int not null default 0,
  created_at      timestamptz not null default now()
);
create unique index one_open_alert on public.theft_alerts(vehicle_id) where status in ('review','open');

-- 발송 기록 (중복 방지 + 하루 3건 제한 계산)
create table public.theft_alert_deliveries (
  alert_id   uuid not null references public.theft_alerts(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  ring       int not null,                     -- 1km / 2km / 3km 단계
  sent_at    timestamptz not null default now(),
  primary key (alert_id, user_id)
);
create index on public.theft_alert_deliveries(user_id, sent_at);

create table public.sightings (
  id            uuid primary key default gen_random_uuid(),
  alert_id      uuid not null references public.theft_alerts(id) on delete cascade,
  reporter_id   uuid references auth.users(id) on delete set null,  -- 비로그인 제보는 null (현상금 대상 아님)
  geom          extensions.geography(point) not null,
  accuracy_m    int not null check (accuracy_m <= 100),
  photo_path    text not null,                 -- 비공개 버킷 sighting-images
  photo_hash    text not null,
  note          text check (char_length(note) <= 200),
  seen_at       timestamptz not null,
  status        text not null default 'new' check (status in ('new','useful','false','duplicate')),
  distance_m    int,                           -- 경보 지점과 거리 (서버 계산)
  created_at    timestamptz not null default now(),
  unique (alert_id, photo_hash)
);

create table public.bounties (
  id               uuid primary key default gen_random_uuid(),
  alert_id         uuid not null unique references public.theft_alerts(id) on delete cascade,
  mode             text not null check (mode in ('pledge','escrow')),   -- 1단계 약속 / 2단계 예치
  amount           int not null check (amount between 10000 and 50000 and amount % 5000 = 0),
  reward_kind      text not null default 'cash' check (reward_kind in ('cash','gifticon')),
  status           text not null default 'pledged'
                   check (status in ('pledged','funding','held','releasing','released','refunded','disputed','unpaid')),
  payment_provider text,
  payment_key      text,                       -- PG 결제 키 (2단계)
  release_after    timestamptz,                -- 이의 기간 끝 (회수 + 24시간)
  created_at       timestamptz not null default now()
);

-- 누구에게 얼마 (여러 제보자 나눔)
create table public.bounty_payouts (
  id           uuid primary key default gen_random_uuid(),
  bounty_id    uuid not null references public.bounties(id) on delete cascade,
  sighting_id  uuid not null references public.sightings(id),
  reporter_id  uuid not null references auth.users(id),
  amount       int not null check (amount > 0),
  status       text not null default 'pending' check (status in ('pending','needs_review','paid','confirmed','unpaid_reported','cancelled')),
  paid_at      timestamptz,
  confirmed_at timestamptz
);

-- 돈 움직임 원장 (추가만, 수정·삭제 금지)
create table public.bounty_ledger (
  id         bigint generated always as identity primary key,
  bounty_id  uuid not null references public.bounties(id),
  event      text not null,                    -- funded / released / refunded / dispute_opened ...
  amount     int,
  actor_id   uuid,
  meta       jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table public.alert_flags (                 -- "이 경보 이상해요"
  alert_id   uuid not null references public.theft_alerts(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  reason     text,
  created_at timestamptz not null default now(),
  primary key (alert_id, user_id)
);
```

**RLS 요약**

| 테이블 | 읽기 | 쓰기 |
|---|---|---|
| trade_links | 소유자 / 공개 조회는 `get_trade_verification` RPC로만 | RPC로만 |
| ownership_transfers | from_user, to_user | RPC로만 |
| theft_alerts | 소유자·관리자 전체 / 다른 사람은 `nearby_alerts` RPC(공개 열만) | RPC로만 |
| sightings | 제보자 본인, 해당 경보 소유자(제보자 id 제외 뷰), 관리자 | RPC로만 |
| bounties·payouts·ledger | 당사자·관리자 | RPC·웹훅(service role)으로만 |
| alert_areas | 본인 | 본인 |

---

## 4. 핵심 API

> 실패 응답은 공통으로 `{ "error": { "code": "NOT_OWNER", "message": "사람이 읽는 문구" } }` + 알맞은 HTTP 상태.
> 주요 코드: `NOT_OWNER`, `VEHICLE_FLAGGED`(수색·도난 중), `TRANSFER_PENDING`, `EXPIRED`, `ALREADY_DONE`, `STICKER_MISMATCH`, `RATE_LIMITED`, `REAUTH_REQUIRED`, `TOO_FAR`, `LOW_ACCURACY`, `NEEDS_REVIEW`.

### A. 안심거래·양도

**POST `/api/trade-links`** (로그인) → RPC `create_trade_link`
```json
// req
{ "vehicleId": "uuid", "ttlHours": 72 }
// 201
{ "token": "aB3...", "url": "https://b-lock-app.vercel.app/v/aB3...", "checkCode": "482915",
  "expiresAt": "2026-10-12T09:00:00Z", "qrPng": "data:image/png;base64,..." }
```

**DELETE `/api/trade-links/{token}`** (소유자) → `204`

**GET `/api/verify/{token}`** (누구나) → RPC `get_trade_verification` (조회수 +1)
```json
// 200
{ "valid": true,
  "vehicle": { "type": "bicycle", "brand": "삼천리", "model": "XC", "color": "검정", "imageUrl": "https://..." },
  "registeredMonth": "2026-02", "ownedDays": 241, "transferCount": 1,
  "theft": { "status": "clear", "pastRecovered": [] },      // clear | searching | recovered_before
  "serialLast4": "1234", "stickerAttached": true, "maintenanceCount": 6,
  "seller": { "maskedNickname": "뚜*라", "memberSinceMonth": "2026-01" },
  "warnings": [],                                            // NEW_REGISTRATION | RECENT_TRANSFER | NO_SERIAL
  "checkCode": "482915", "checkedAt": "2026-10-09T03:12:45Z" }
// 410 { "valid": false, "reason": "expired" }               // expired | revoked | flagged | transferred
```

**POST `/api/transfers`** (판매자, 비밀번호 재확인) → 비밀번호를 `signInWithPassword`로 재검증 후 RPC `start_transfer`
```json
// req
{ "vehicleId": "uuid", "password": "••••" }
// 201
{ "transferId": "uuid", "url": "https://b-lock-app.vercel.app/t/Zk9...", "expiresAt": "2026-10-09T03:22:45Z" }
```

**GET `/api/transfers/by-token/{token}`** (구매자, 로그인) → RPC `peek_transfer`
```json
{ "transferId": "uuid", "vehicle": { "brand": "삼천리", "model": "XC", "color": "검정", "imageUrl": "...", "serialLast4": "1234" },
  "seller": { "maskedNickname": "뚜*라" }, "requiresSticker": true, "expiresAt": "..." }
```

**POST `/api/transfers/by-token/{token}/accept`** (구매자) → RPC `accept_transfer`
```json
// req
{ "stickerCode": "K7Q2-...", "serialLast4": null }
// 200
{ "vehicleId": "uuid", "completedAt": "...", "next": ["SET_STICKER_SPOT"] }
// 409 STICKER_MISMATCH | ALREADY_DONE | VEHICLE_FLAGGED,  410 EXPIRED,  202 NEEDS_REVIEW (월 4회 이상)
```

**POST `/api/transfers/{id}/cancel`** (판매자) → `200 { "status": "cancelled" }`

**POST `/api/admin/transfers/{id}/revert`** (관리자) → `200 { "status": "reverted" }`

### B. 도난 경보·목격·현상금

**PUT `/api/me/alert-settings`** (로그인)
```json
// req
{ "optIn": true, "quietHours": true,
  "areas": [ { "kind": "area", "lat": 35.543, "lng": 129.256, "radiusM": 2000 } ],
  "shareRecentLocation": false }
// 200 { "saved": true }
```

**POST `/api/me/recent-location`** (동의자, 앱 사용 중 하루 몇 번) → 서버가 약 1km 격자로 반올림해 `alert_areas(kind='recent')` 갱신 → `204`

**POST `/api/alerts`** (소유자) → RPC `create_theft_alert` → insert 트리거가 `fanout_theft_alert` 실행
```json
// req
{ "vehicleId": "uuid", "lostAt": "2026-10-09T02:30:00Z", "lat": 35.5436, "lng": 129.2560,
  "radiusM": 1000, "marks": "앞바퀴 흰 림, 안장 찢어짐", "policeReportNo": null,
  "bounty": { "mode": "pledge", "amount": 30000, "rewardKind": "cash" } }
// 201
{ "alertId": "uuid", "status": "open", "recipientsEstimate": 142, "expiresAt": "2026-10-12T02:31:00Z" }
// 202 { "alertId": "uuid", "status": "review" }   // 등록 24시간 미만·최근 양도 등
```

**GET `/api/alerts/nearby?lat=..&lng=..`** (누구나, 좌표는 저장 안 함) → RPC `nearby_alerts`
```json
{ "alerts": [ { "alertId": "uuid", "distanceBucket": "1km 이내", "imageUrl": "...",
  "summary": "검정 삼천리 XC · 앞바퀴 흰 림", "lostAt": "...", "bounty": { "amount": 30000, "mode": "pledge" },
  "policeReported": false } ] }
```

**GET `/api/alerts/{id}`** → 공개 카드(소유자면 정확한 위치·제보 목록 포함)

**POST `/api/alerts/{id}/sightings`** (multipart: `photo`, `lat`, `lng`, `accuracyM`, `seenAt`, `note`) → 사진 업로드 후 RPC `submit_sighting`
```json
// 201
{ "sightingId": "uuid", "distanceM": 1180, "bountyEligible": true }
// 422 TOO_FAR | LOW_ACCURACY | STALE_PHOTO,  409 DUPLICATE,  429 RATE_LIMITED
```

**PATCH `/api/sightings/{id}`** (경보 소유자)
```json
{ "status": "useful" }      // useful | false | duplicate
```

**POST `/api/alerts/{id}/resolve`** (소유자) → RPC `resolve_theft_alert`
```json
// req
{ "stickerCode": "K7Q2-...", "rewards": [ { "sightingId": "uuid", "share": 100 } ] }
// 200
{ "status": "resolved", "bounty": { "status": "releasing", "releaseAfter": "2026-10-10T05:00:00Z", "needsReview": false } }
```

**POST `/api/alerts/{id}/cancel`** `{ "reason": "착각했어요" }` → 유용한 제보가 있으면 현상금은 `disputed`(관리자 검토)

**POST `/api/alerts/{id}/flag`** `{ "reason": "남의 자전거 같아요" }` → 3명 이상이면 `hidden`

**POST `/api/payouts/{id}/paid`** (피해자, 1단계) / **POST `/api/payouts/{id}/confirm`** (제보자) / **POST `/api/payouts/{id}/report-unpaid`** (제보자)

**POST `/api/bounties/{id}/fund`** (2단계) → `{ "checkoutUrl": "https://pg..." }`
**POST `/api/payments/webhook`** (PG → 서버, 서명 검증, service role로 상태 변경·원장 기록)
**POST `/api/bounties/{id}/dispute`** `{ "reason": "..." }` → 지급 보류

### 서버 작업(크론)

| 작업 | 주기 | 내용 |
|---|---|---|
| `expand_alert_rings` | 5분 | 30분 동안 제보 없는 경보 반경 확대 + 추가 발송 |
| `expire_alerts` | 10분 | 72시간 지난 경보 종료, 현상금 환불/검토 |
| `release_bounties` | 10분 | 이의 기간 끝난 지급 실행(2단계) |
| `expire_transfers_links` | 10분 | 만료된 양도·링크 정리 |
| `purge_recent_locations` | 매일 | 7일 지난 `recent` 위치 삭제 |

---

## 5. 구현 순서 제안

1. **A 전체** (법적 걸림 없음, 지금 구조로 바로 가능): 차대번호 → 인증 링크 → 양도 → 이력. 약 1~2일.
2. **B 1단계** (현상금 약속형): 관심 지역·경보·목격 제보·회수 증명·평판. PostGIS 추가. 약 2~3일. 출시 전 위치기반서비스사업 신고 확인.
3. **B 2단계** (예치형): PG사 에스크로·지급대행 계약 + 본인인증 이후.
