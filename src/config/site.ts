/**
 * 서비스 기본 정보. 아이디어가 정해지면 여기(또는 환경변수 NEXT_PUBLIC_SITE_NAME)만 바꾸면 전체에 반영됩니다.
 */
export const site = {
  name: process.env.NEXT_PUBLIC_SITE_NAME || "모두의 창업",
  tagline: "한 줄 소개를 여기에 적어 주세요",
  description: "서비스 설명을 여기에 적어 주세요.",
  /** 머리글 메뉴 */
  nav: [
    { href: "/#features", label: "기능" },
    { href: "/#how", label: "이용 방법" },
  ],
};
