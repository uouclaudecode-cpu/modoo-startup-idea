/**
 * 서비스 기본 정보. 이름은 여기(또는 환경변수 NEXT_PUBLIC_SITE_NAME)만 바꾸면 전체에 반영됩니다.
 * 운영자·문의 정보는 약관·개인정보처리방침·문의하기에 쓰여요. (출시 전에 환경변수로 꼭 채워 주세요)
 */
export const site = {
  name: process.env.NEXT_PUBLIC_SITE_NAME || "B-LOCK",
  tagline: "자전거·개인 킥보드 디지털 신분증",
  description:
    "자전거와 개인 킥보드에 QR 디지털 신분증을 만들고, 잃어버렸을 때 주변 사람의 발견 위치 제보를 받을 수 있는 생활 안전 서비스입니다.",
  /** 운영자(사업자) 이름 */
  operator: process.env.NEXT_PUBLIC_OPERATOR_NAME || "B-LOCK 운영팀",
  /** 문의·개인정보 보호책임자 연락 이메일 (없으면 문의 메뉴에 '준비 중'으로 보여요) */
  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL || "",
  /** 약관·방침 시행일 */
  policyDate: "2026년 10월 8일",
};
