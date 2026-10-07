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

## 보안 설계
- QR에는 예측할 수 없는 24자리 무작위 코드만 들어갑니다. (`/scan/MjdL-...`) 사용자 ID·개인정보 없음.
- Supabase RLS: 이동수단·제보·프로필은 **소유자만** 볼 수 있습니다.
- 공개 QR 화면은 `get_public_vehicle` 함수가 종류·색상·브랜드·모델·특징·사진·상태만 돌려줍니다. 이름·이메일·닉네임은 꺼낼 수 없습니다.
- 제보는 `submit_report` 함수로만 남길 수 있고(QR 코드 필수, 10분 20건 제한), 읽기는 소유자만 됩니다.
- 사진: `vehicle-images`는 공개(본인 폴더에만 올리기), `report-images`는 비공개(소유자만 1시간짜리 주소로 열람). 5MB·이미지만 허용, 올리기 전에 1600px로 줄입니다.
- 공개 키(publishable key)만 사용합니다. 비밀 키는 이 사이트에 필요 없습니다.

## 기술 스택
Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS 3.4 · Supabase (Auth · Postgres · Storage) · qrcode · jsQR · lucide-react
- 이 PC가 Node 18이라 Next.js 16 / Tailwind 4 / 최신 supabase-js 대신 Node 18에서 동작하는 버전을 고정했습니다. Vercel(Node 22)에서도 동작합니다.

## 처음 설정
1. Supabase 프로젝트를 만들고 **SQL Editor**에서 [`supabase/schema.sql`](supabase/schema.sql) 전체를 실행합니다.
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

## 배포 (Vercel)
1. Vercel → Add New → Project → 이 저장소 Import
2. Environment Variables에 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` 추가 후 Deploy
3. 배포 주소가 나오면 `NEXT_PUBLIC_SITE_URL`에 그 주소를 넣고 다시 배포 (QR에 들어가는 주소가 고정됩니다)
4. Supabase → Authentication → URL Configuration → Site URL에 배포 주소 입력

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
지도 표시(카카오맵 등), 제보 도착 알림(이메일·푸시), 이동수단 정보 수정, 소유권 확인용 구매 영수증 첨부
