# modoo-startup-idea

**모두의 창업 아이디어**를 구현하는 저장소입니다. 지금은 아이디어를 담을 **기본 웹사이트 뼈대**만 있어요.

## 아이디어
> 아직 정리 중이에요. 한두 줄 요약이 정해지면 여기에 적습니다.

- 문제: 
- 대상 사용자: 
- 해결 방법: 
- 핵심 기능: 

## 진행 상황
- [x] 기본 웹사이트 뼈대 (Next.js · TypeScript · Tailwind CSS, 모바일 우선)
- [ ] 아이디어 정리
- [ ] 화면 설계
- [ ] 첫 프로토타입
- [ ] 배포

## 기술 스택
| 항목 | 선택 | 이유 |
| --- | --- | --- |
| 프레임워크 | Next.js 15 (App Router) + React 19 | 화면과 서버 기능을 한 프로젝트에서 관리. Next.js 16은 Node 20 이상이 필요해 15를 사용 |
| 언어 | TypeScript | 실수를 미리 잡아 줌 |
| 스타일 | Tailwind CSS 3.4 | Tailwind 4는 Node 20 이상이 필요해 3.4를 사용 |
| 아이콘 | lucide-react | 가볍고 무료 |
| 글꼴 | Pretendard (CDN) | 무료 한글 글꼴 |

## 폴더 구성
```
src/
  app/                 화면(페이지)
    page.tsx           홈
    styleguide/        공통 부품 확인 페이지 (개발용)
    not-found.tsx      없는 페이지
    error.tsx          예상하지 못한 오류
  components/
    layout/Header.tsx  머리글
    ui/                공통 부품: Button, Card, Input, Modal, Toast, Badge, Loading, EmptyState, ErrorState
  config/site.ts       서비스 이름·소개·메뉴 (아이디어가 정해지면 여기부터 바꿈)
  lib/cn.ts            className 도우미
```

## 실행하기
```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # 배포 전 확인
```

서비스 이름은 `src/config/site.ts` 또는 환경변수 `NEXT_PUBLIC_SITE_NAME`으로 바꿉니다.
