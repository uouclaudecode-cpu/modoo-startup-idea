"use client";

import { useState } from "react";
import { Download, Share2 } from "lucide-react";
import { Button, useToast } from "@/components/ui";

/** 공유 카드(사진)와 GPX 내보내기. 둘 다 출발·도착 근처 300m는 가려요 */
export function RideExport({ rideId }: { rideId: string }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function shareCard() {
    setBusy(true);
    try {
      const r = await fetch(`/rides/${rideId}/card`);
      if (!r.ok) throw new Error(String(r.status));
      const blob = await r.blob();
      const file = new File([blob], "b-lock-ride.png", { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "B-LOCK 라이딩" });
      } else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "b-lock-ride.png";
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        toast.success("사진을 저장했어요.");
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        console.error(e);
        toast.error("공유 카드를 만들지 못했어요. 잠시 후 다시 시도해 주세요.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" loading={busy} loadingText="만드는 중..." icon={<Share2 aria-hidden className="h-4 w-4" />} onClick={shareCard}>
          공유 카드
        </Button>
        <a
          href={`/rides/${rideId}/gpx?trim=1`}
          className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-white px-4 text-[15px] font-semibold text-ink ring-1 ring-inset ring-line hover:bg-slate-50"
        >
          <Download aria-hidden className="h-4 w-4" />
          GPX 파일
        </a>
      </div>
      <p className="text-[12px] leading-relaxed text-ink-muted">
        집·회사 위치가 드러나지 않게 출발·도착 근처 300m는 빼고 보여요. GPX는 스트라바·가민 등에 올릴 수 있어요.{" "}
        <a href={`/rides/${rideId}/gpx`} className="underline">
          전체 경로 GPX
        </a>
      </p>
    </div>
  );
}
