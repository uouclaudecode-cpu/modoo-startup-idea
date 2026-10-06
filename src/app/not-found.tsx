import { ButtonLink, ErrorState } from "@/components/ui";

export default function NotFound() {
  return (
    <ErrorState
      title="페이지를 찾을 수 없어요"
      description="주소가 바뀌었거나 삭제된 페이지예요."
      action={<ButtonLink href="/" full>홈으로 가기</ButtonLink>}
    />
  );
}
