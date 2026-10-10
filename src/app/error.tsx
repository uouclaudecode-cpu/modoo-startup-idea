"use client";

import { useEffect } from "react";
import { Button, ButtonLink, ErrorState } from "@/components/ui";
import { reportClientError } from "@/components/layout/ErrorReporter";

/** 예상하지 못한 오류가 났을 때 보이는 화면 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // 오류를 숨기지 않고 개발자 도구 콘솔에 남기고, 운영자 오류 알림으로도 보내요.
    console.error(error);
    reportClientError(`화면 오류: ${error.message}${error.digest ? ` (digest ${error.digest})` : ""}`, error.stack);
  }, [error]);

  const offline = typeof navigator !== "undefined" && !navigator.onLine;
  return (
    <ErrorState
      title={offline ? "인터넷 연결을 확인해 주세요" : "문제가 생겼어요"}
      description={offline ? "연결된 뒤 다시 시도해 주세요." : "잠시 후 다시 시도해 주세요. 계속되면 문의하기로 알려 주세요."}
      action={
        <div className="grid gap-2">
          <Button full onClick={reset}>
            다시 시도
          </Button>
          {!offline && (
            <ButtonLink href="/contact" full variant="ghost">
              문의하기
            </ButtonLink>
          )}
        </div>
      }
    />
  );
}
