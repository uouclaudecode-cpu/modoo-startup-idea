/**
 * 서비스 기본 정보. 이름은 여기(또는 환경변수 NEXT_PUBLIC_SITE_NAME)만 바꾸면 전체에 반영됩니다.
 */
export const site = {
  name: process.env.NEXT_PUBLIC_SITE_NAME || "B-LOCK",
  tagline: "자전거·개인 킥보드 디지털 신분증",
  description:
    "자전거와 개인 킥보드에 QR 디지털 신분증을 만들고, 잃어버렸을 때 주변 사람의 발견 위치 제보를 받을 수 있는 생활 안전 서비스입니다.",
};
