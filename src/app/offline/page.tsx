import type { Metadata } from "next";
import { WifiOff } from "lucide-react";
import { ErrorState } from "@/components/ui";

export const metadata: Metadata = { title: "오프라인", robots: { index: false } };

/** 인터넷이 끊겼을 때 앱이 보여주는 화면 (서비스 워커가 미리 저장해 둠) */
export default function OfflinePage() {
  return (
    <div className="mx-auto max-w-md pt-6">
      <ErrorState
        icon={<WifiOff className="h-7 w-7" />}
        title="인터넷 연결을 확인해 주세요"
        description="연결되면 다시 열어 주세요. QR 스캔과 제보는 인터넷이 있어야 보낼 수 있어요."
      />
    </div>
  );
}
