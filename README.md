# B-LOCK · 자전거·개인 킥보드 디지털 신분증

자전거와 개인 킥보드에 **QR 디지털 신분증**을 만들고, 잃어버렸을 때 QR을 스캔한 사람에게서 **발견 위치 제보**를 받는 생활 안전 서비스입니다. (실시간 위치 추적 서비스가 아닙니다.)

## 동작 흐름 (MVP 1차)
```
회원가입 → 로그인 → 이동수단 등록(사진·특징) → 고유 QR 생성 → QR 저장·부착
→ 분실/도난 신고(수색 중) → 다른 사람이 로그인 없이 QR 스캔 → 수색 중 안내 확인
→ 발견 제보(위치 + 사진) → 소유자가 제보 확인 → 회수 완료
```

## 화면
| 경로 | 내용 | 로그인 |
| --- | --- | --- |
| `/` | 서비스 소개, 등록·스캔 버튼 | - |
| `/signup`, `/login` | 회원가입(이메일·비밀번호·닉네임), 로그인 | - |
| `/dashboard` | 안녕하세요 ○○님, 내 이동수단 카드 (수색 중·제보 접수는 색·띠로 구분) | 필요 |
| `/vehicles/new` | 이동수단 등록 (종류·이름·브랜드·모델·색상·특징·사진) → QR 자동 생성 | 필요 |
| `/vehicles/[id]` | 상세, 분실/도난 신고 · 회수 완료 · 정상 복귀 · 삭제 | 필요 |
| `/vehicles/[id]/qr` | 큰 QR, 스티커용 PNG 저장, 공유 | 필요 |
| `/vehicles/[id]/reports` | 받은 발견 제보·연락 요청 (사진은 소유자만) | 필요 |
| `/scan` | 카메라 QR 스캔, 링크 직접 입력 | - |
| `/scan/[qrId]` | **공개 QR 화면**: 정상 / 🚨 수색 중 안내 (소유자 개인정보 없음) | - |
| `/report/[qrId]` | 발견 제보·연락 요청 (위치 권한 또는 직접 입력, 사진, 연락처 선택) | - |
| `/community` | **분실 커뮤니티**: 찾는 중/찾았어요, 종류 필터, 지역·색상 검색 | - |
| `/community/new` | 분실 글 쓰기 (내 이동수단 연결 시 정보·사진 자동 채움 + 수색 중 전환) | 필요 |
| `/community/[id]` | 글 상세, 댓글(본 위치·사진), 🔒 비밀 댓글, 찾았어요, 공유 | 댓글은 필요 |
| `/stickers/[code]` | 새 B-LOCK 스티커를 내 이동수단에 등록 (주인만 아는 부착 위치 기록) | 필요 |
| `/admin/stickers` | 관리자: 빈 스티커 묶음 만들기, A4 40칸 인쇄·PDF, CSV | 관리자 |
| `/ride` | **라이딩 기록**: 네이버 지도 위 실시간 경로, 시작·일시정지·종료, 거리·시간·속도 | 필요 |
| `/rides`, `/rides/[id]` | 라이딩 기록 목록(이번 달 합계), 결과(전체 경로·출발/도착·정비 알림), 삭제 | 필요 |
| `/vehicles/[id]/maintenance` | **소모품·정비**: 마모율 3단계, 주기 수정, 정비 완료(0km 리셋) + 정비 다이어리 | 필요 |
| `/vehicles/[id]/edit` | 이동수단 정보·사진 수정 (QR은 그대로) | 필요 |
| `/vehicles/[id]/transfer` | **소유권 넘기기**: 비밀번호 재확인 → 10분 양도 QR | 필요 |
| `/t/[token]` | 소유권 받기: 숨은 스티커(또는 차대번호 끝 4자리)로 실물 확인 후 이전 | 필요 |
| `/v/[token]` | **안심거래 인증**: 도난 이력·등록일·보유 기간·양도 횟수·확인 코드 (판매자 마스킹) | - |
| `/vehicles/[id]/evidence`, `/vehicles/[id]/certificate` | **소유 증명**: 증거 사진 보관함, 경찰·보험 제출용 증명서 | 필요 |
| `/c/[token]` | 소유 증명서 진위 확인 | - |
| `/vehicles/[id]/alert` | **도난 경보 보내기**: 잃어버린 곳·시각·특징·경찰 신고 번호·약속형 사례금 | 필요 |
| `/alerts`, `/alerts/[id]` | 근처 도난 경보 목록·상세, 거리/중고 매물 목격 제보, 회수 완료(숨은 스티커 확인) | 제보는 필요 |
| `/alerts/[id]/police` | **112 도난 신고서**: 인쇄·PDF, 112 문자 복사 (신고자 정보 저장 안 함) | 주인 |
| `/r` | 발견자 **익명 대화** (로그인 없이, 제보 후 14일) | - |
| `/check` | **구매 전 도난 조회**: QR·조회 번호(코드 앞 8자리)·차대번호 → 도난 신고 중/등록됨/기록 없음 | - |
| `/stats` | 공개 통계, 도난 다발 지도 (약 500m 칸) | - |
| `/admin/members`, `/admin/alerts` | 관리자: 회원 본인인증 표시, 신고된 도난 경보 처리 | 관리자 |

## 보안 설계
- QR에는 예측할 수 없는 24자리 무작위 코드만 들어갑니다. (`/scan/MjdL-...`) 사용자 ID·개인정보 없음.
- Supabase RLS: 이동수단·제보·프로필은 **소유자만** 볼 수 있습니다.
- 공개 QR 화면은 `get_public_vehicle` 함수가 종류·색상·브랜드·모델·특징·사진·상태만 돌려줍니다. 이름·이메일·닉네임은 꺼낼 수 없습니다.
- 제보는 `submit_report` 함수로만 남길 수 있고(QR 코드 필수, 10분 20건 제한), 읽기는 소유자만 됩니다.
- 사진: `vehicle-images`는 공개(본인 폴더에만 올리기), `report-images`는 비공개(소유자만 1시간짜리 주소로 열람). 5MB·이미지만 허용, 올리기 전에 1600px로 줄입니다.
- 커뮤니티: 글·공개 댓글은 누구나 읽기, 쓰기는 회원만. **비밀 댓글**은 댓글 쓴 사람과 글쓴이만 내용·위치·사진을 볼 수 있고(`get_post_comments`가 나머지 사람에게는 비워서 돌려줌), 비밀 댓글 사진은 비공개 버킷 `community-secret`에 저장됩니다. 글쓴이 이름은 닉네임만 보입니다.
- 공개 키(publishable key)만 사용합니다. 비밀 키는 이 사이트에 필요 없습니다.

## 기술 스택
Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS 3.4 · Supabase (Auth · Postgres · Storage) · qrcode · jsQR · lucide-react
- 이 PC가 Node 18이라 Next.js 16 / Tailwind 4 / 최신 supabase-js 대신 Node 18에서 동작하는 버전을 고정했습니다. Vercel(Node 22)에서도 동작합니다.

## 처음 설정
1. Supabase 프로젝트를 만들고 **SQL Editor**에서 [`supabase/schema.sql`](supabase/schema.sql) → [`002_community.sql`](supabase/002_community.sql) → [`003_stickers.sql`](supabase/003_stickers.sql) → [`004_rides_maintenance.sql`](supabase/004_rides_maintenance.sql) → [`005_review_fixes.sql`](supabase/005_review_fixes.sql) → `006_moderation.sql` → `007_admin_stats.sql` → `008_push.sql` → `009_account.sql` → `010_post_location.sql` → `011_merge_fixes.sql` → `012_review_fixes.sql` → `013_trade_transfer.sql` → `014_theft_alerts.sql` → `015_evidence_certificate.sql` → `016_report_chat.sql` → `017_cleanup_admin.sql` → `018_check_stats.sql` → `019_polish.sql` → `020_g1_alerts.sql` → `020_g2_stickers.sql` → `020_g4_ui.sql` → `020_g5_owner.sql` → `020_g6_community_admin.sql` → `021_transfer_link.sql` → `022_lookup_code.sql` → `023_transfer_link_7days.sql` → `024_riding_plus.sql` → `025_listing_check_history.sql` → `026_listing_match_wider.sql` 순서로 실행합니다. (뒤 파일이 앞의 함수·트리거를 최종본으로 바꿔요. 모두 여러 번 실행해도 안전)
   관리자 지정: `update public.profiles set is_admin = true where email = '관리자 이메일';`
2. Supabase → Authentication → Sign In / Providers → **Confirm email** 끄기 (MVP: 가입 즉시 로그인)
3. `.env.example`을 복사해 `.env.local`을 만들고 값을 채웁니다.
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxx
   ```
4. 실행
   ```bash
   npm install
   npm run dev        # http://localhost:3000
   ```

## 환경 변수
| 이름 | 용도 | 공개 여부 |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase 연결 | 공개 값 |
| `NEXT_PUBLIC_SITE_URL` | QR·공유 미리보기·사이트맵의 기준 주소 | 공개 값 |
| `NEXT_PUBLIC_NAVER_MAP_CLIENT_ID` | 네이버 지도 (NCP Maps Dynamic Map) | 공개 값 |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | 웹 푸시 공개 키 | 공개 값 |
| `VAPID_PRIVATE_KEY` | 웹 푸시 서명 키 | **비밀** |
| `PUSH_WEBHOOK_SECRET` | DB → `/api/push` 호출 확인용 (`app_private.push_config.secret`과 같아야 함) | **비밀** |
| `NEXT_PUBLIC_OPERATOR_NAME`, `NEXT_PUBLIC_CONTACT_EMAIL` | 약관·방침·문의하기의 운영자·연락처 (선택, 비우면 site.ts 기본값) | 공개 값 |

## 배포 (Vercel)
1. Vercel → Add New → Project → 이 저장소 Import
2. Environment Variables에 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` 추가 후 Deploy
3. 배포 주소가 나오면 `NEXT_PUBLIC_SITE_URL`에 그 주소를 넣고 다시 배포 (QR에 들어가는 주소가 고정됩니다)
4. Supabase → Authentication → URL Configuration → Site URL에 배포 주소 입력

## QR 스티커 흐름
1. 관리자가 `/admin/stickers`에서 빈 스티커 묶음을 만들고 인쇄 → 학교·편의점에 배치
2. 사용자가 스티커를 찍으면 '새 스티커' 화면 → 내 이동수단에 등록(또는 새로 등록하며 연결), 주인만 아는 부착 위치 기록
3. 앱이 만든 QR도 그대로 쓰이고, QR 화면에서 등록한 스티커 QR도 확인·저장 가능 (주인 확인용). 주인이 로그인한 채 찍으면 '내 이동수단이에요' 표시
4. 분실 → 커뮤니티 글(🏷️ 스티커 표시) → '이건가요?' 비밀 댓글 → 주인이 비밀 답글로 스티커 위치(📍 버튼) → 발견자가 스티커를 찍어 위치·사진 제보

## 라이딩 기록 · 소모품 · 정비 다이어리
- **지도**: 네이버 클라우드 플랫폼 Maps → Application(Dynamic Map)의 Client ID를 `NEXT_PUBLIC_NAVER_MAP_CLIENT_ID`에 넣고, Web 서비스 URL에 사이트 주소(localhost 포함)를 등록합니다. 키가 없거나 인증에 실패하면 지도 대신 경로 모양만 그려서 기능은 계속 동작합니다.
- **GPS 걸러내기** (`src/lib/ride/geo.ts`): 정확도 35m보다 나쁜 위치 버림 · 시속 65km 넘는 순간 이동(튐) 버림 · 정확도 반경 안 맴돌기(정차 떨림)는 거리·이동 시간에 넣지 않음 · 최고 속도는 8초 평균.
- 기록 중 화면 꺼짐 방지(Wake Lock), 진행 상황을 브라우저에 저장해 새로고침·앱 종료 후에도 이어서 기록. 웹 특성상 화면이 꺼지거나 다른 앱으로 가면 위치 기록이 멈출 수 있어요.
- 저장(`complete_ride`)하면 기록 + 이동수단 누적 거리 + 소모품 거리를 한 번에 반영. 기록 삭제(`delete_ride`)는 그 라이딩 뒤로 정비하지 않은 소모품에서만 거리를 뺍니다.
- 기본 주기: 타이어 공기압 14일 · 체인 윤활 250km · 브레이크 패드 2,000km · 체인 3,500km · 타이어 3,500km (킥보드는 체인 항목 없음). 마모율 80% 점검 필요, 100% 교체 권장.
- 정비 완료(`service_part`): 날짜·비용·정비소·메모를 다이어리에 남기고 거리 0km부터 다시 셉니다.

## 커뮤니티 안전 · 회원 관리
- **신고·차단**: 글·댓글 ⋯ 메뉴에서 신고(서로 다른 3명이면 자동 숨김)·차단(그 사람 글·댓글이 나에게 안 보임). 관리자는 `/admin/reports`에서 숨기기·다시 보이기·삭제.
- **설정** `/settings`: 닉네임 변경(지난 글·댓글 이름도 바뀜), 알림, 비밀번호 변경, 차단 목록, 회원 탈퇴(사진 정리 후 계정·연결 데이터 삭제).
- **비밀번호 찾기** `/forgot-password` → 메일 링크 → `/auth/callback` → `/reset-password`. Supabase 기본 메일 서버는 **프로젝트 팀원 이메일로만**, 시간당 2통까지만 보내서 일반 사용자는 메일을 못 받아요. 출시 전에 SMTP를 꼭 연결하세요(Gmail로 5분, 한국어 메일 문구 포함): [docs/email-templates.md](docs/email-templates.md)
- **약관**: `/terms`, `/privacy`, `/location-terms`, `/contact` 초안. 출시 전 법률 검토와 위치정보사업 신고·등록 필요 여부 확인을 권장해요.

## 푸시 알림
- 발견 제보·연락 요청, 내 분실 글 댓글, 내 댓글 답글, 정비 시기(매일 09시)에 알림. 설정 화면에서 켜고 끄고, 종류별로 고를 수 있어요.
- 흐름: DB 트리거 → `send_push`(pg_net) → `/api/push`(비밀값 확인 후 web-push로 발송). 끝난 기기 구독은 자동으로 지워요. 아이폰은 '홈 화면에 추가'한 앱에서만 받을 수 있어요.

## 운영 · 분석
- `/admin` 운영 통계(가입자, 이동수단, 스티커 등록률, 회수율, 발견 제보, 라이딩, 주별 그래프, 스티커 묶음별 등록률). 관리자만.
- 카카오톡 공유 미리보기: 사이트 기본 카드와 분실 글 카드(`opengraph-image`), `robots.txt`, `sitemap.xml`, 기본 보안 헤더.

## 로딩 화면
- 데이터를 불러오는 모든 화면은 `loading.tsx` 스켈레톤(shimmer)으로, 버튼 제출 대기만 버튼 안 인라인 스피너로 통일했습니다. 커뮤니티 탭·검색 전환도 목록 자리에 스켈레톤이 나옵니다.

## 앱 설치 (PWA)
- `src/app/manifest.ts`(앱 정보), `src/app/icons/[file]`(앱 아이콘을 코드로 그림), `public/sw.js`(설치 조건 + 오프라인 안내 화면만 저장, 개인 화면은 저장 안 함)
- 화면 맨 아래 **앱 설치** 버튼: 크롬·삼성 인터넷은 바로 설치 창, 아이폰은 '홈 화면에 추가' 방법 안내, 카카오톡 안 브라우저는 다른 브라우저로 열기 안내. 설치한 앱으로 열면 버튼이 보이지 않습니다.
- 휴대폰에서는 아래쪽 메뉴(홈·커뮤니티·QR 스캔·내 이동수단)로 이동합니다.

## 폴더 구성
```
src/
  app/                    화면 (위 표의 경로)
  components/ui/          공통 부품 (Button, Card, Input, Modal, Toast, PhotoPicker, StatusBadge …)
  components/vehicle/     이동수단 카드·사진
  config/site.ts          서비스 이름 (B-LOCK) — 여기만 바꾸면 전체 반영
  lib/supabase/           Supabase 연결 (브라우저 / 서버)
  lib/                    상태·종류 정의, 사진 처리, QR 주소, 날짜 형식
  middleware.ts           로그인 유지, 로그인 필요한 화면 보호
supabase/schema.sql       데이터베이스·권한·저장소 설정
```

## 다음 단계 아이디어
제보·댓글·정비 알림 푸시(웹 푸시), 라이딩 백그라운드 기록(네이티브 앱), 소유권 확인용 구매 영수증 첨부, 글 신고·차단
