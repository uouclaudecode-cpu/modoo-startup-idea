/** 신고 대상: 분실 글 / 댓글 (supabase/006_moderation.sql 의 content_reports.target_type) */
export type ReportTarget = "post" | "comment";

export type ReportReason = "spam" | "abuse" | "privacy" | "false" | "other";

/** 신고 이유. 순서대로 신고 창에 보여요. */
export const REPORT_REASONS: { value: ReportReason; label: string; hint: string }[] = [
  { value: "spam", label: "스팸·광고", hint: "광고, 같은 글 반복, 관계없는 홍보" },
  { value: "abuse", label: "욕설·비방", hint: "욕설, 놀림, 특정인을 깎아내리는 말" },
  { value: "privacy", label: "개인정보 노출", hint: "전화번호·주소·얼굴 등 남의 정보" },
  { value: "false", label: "허위 정보", hint: "거짓 분실 글, 잘못된 위치로 헷갈리게 함" },
  { value: "other", label: "기타", hint: "그 밖의 문제 (아래에 적어 주세요)" },
];

export const REPORT_DETAIL_MAX = 300;

export function reasonLabel(reason: string) {
  return REPORT_REASONS.find((r) => r.value === reason)?.label ?? "기타";
}

/** admin_list_reports 결과 한 줄 (같은 글·댓글에 들어온 신고를 모은 것) */
export type ReportSummary = {
  target_type: ReportTarget;
  target_id: string;
  report_count: number;
  reasons: ReportReason[];
  last_reported_at: string;
  hidden_at: string | null;
  deleted: boolean;
  /** 글 제목 또는 댓글 앞부분 (80자) */
  excerpt: string | null;
  post_id: string | null;
  author_name: string | null;
  is_secret: boolean;
  /** 신고한 사람들이 적은 자세한 내용 (최근 것부터) */
  details: string[];
};

/** my_blocks 결과 */
export type BlockedUser = {
  user_id: string;
  nickname: string;
  created_at: string;
};
