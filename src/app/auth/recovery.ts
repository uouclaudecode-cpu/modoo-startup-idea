/**
 * 비밀번호 찾기 메일의 링크로 들어왔다는 표시 (값은 그 사용자 id, 1시간).
 * 이 표시가 있을 때만 /reset-password 에서 지금 비밀번호 없이 새 비밀번호를 정할 수 있어요.
 * (로그인된 휴대폰을 빌린 사람이 그 주소로 바로 들어가 비밀번호를 바꾸지 못하게)
 */
export const RECOVERY_COOKIE = "b-lock-recovery";
export const RECOVERY_MAX_AGE = 60 * 60;
