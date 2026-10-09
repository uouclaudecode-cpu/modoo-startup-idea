import { Home, RotateCw, ScanLine, Search } from "lucide-react";
import { ButtonLink, buttonClass } from "@/components/ui";

/**
 * 잘못됐거나 쓸 수 없는 QR 화면에서 다음에 할 일.
 * - 기본: QR 다시 스캔 · 조회 번호로 도난 조회 · 홈
 * - retryHref가 있으면(불러오기 실패): 다시 시도 · 홈
 */
export function BadQrActions({ retryHref }: { retryHref?: string }) {
  if (retryHref) {
    return (
      <div className="grid gap-2">
        {/* 연결이 끊겼다 돌아온 경우라 화면을 통째로 다시 불러와요 */}
        <a href={retryHref} className={buttonClass("primary", "md", true)}>
          <RotateCw aria-hidden className="h-4 w-4" />
          다시 시도
        </a>
        <ButtonLink href="/" full variant="ghost" icon={<Home aria-hidden className="h-4 w-4" />}>
          홈으로
        </ButtonLink>
      </div>
    );
  }
  return (
    <div className="grid gap-2">
      <ButtonLink href="/scan" full icon={<ScanLine aria-hidden className="h-4 w-4" />}>
        QR 다시 스캔하기
      </ButtonLink>
      <ButtonLink href="/check" full variant="secondary" icon={<Search aria-hidden className="h-4 w-4" />}>
        조회 번호로 도난 조회
      </ButtonLink>
      <ButtonLink href="/" full variant="ghost" icon={<Home aria-hidden className="h-4 w-4" />}>
        홈으로
      </ButtonLink>
    </div>
  );
}
