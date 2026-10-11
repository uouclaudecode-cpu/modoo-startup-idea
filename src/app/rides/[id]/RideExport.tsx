"use client";

import { useState } from "react";
import { Download, Share2 } from "lucide-react";
import { Button, useToast } from "@/components/ui";

/** 공유 카드(사진)와 경로 파일(GPX) 저장. 둘 다 출발·도착 근처 300m는 가려요 */
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
          공유 카드 만들기
        </Button>
        <a
          href={`/rides/${rideId}/gpx?trim=1`}
          className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-white px-4 text-[15px] font-semibold text-ink ring-1 ring-inset ring-line hover:bg-slate-50"
        >
          <Download aria-hidden className="h-4 w-4" />
          경로 파일 저장
        </a>
      </div>
      <div className="space-y-1 rounded-xl bg-slate-50 p-3 text-[12px] leading-relaxed text-ink-muted">
        <p>
          <b className="text-ink-soft">공유 카드</b>: 사진 한 장으로 만들어 공유해요.
        </p>
        <p>
          <b className="text-ink-soft">경로 파일 저장</b>: 스트라바 같은 다른 앱으로 옮기는 파일(GPX)이에요.
        </p>
        <p>
          집·회사 위치가 드러나지 않게 출발·도착 근처와{" "}
          <a href="/settings/privacy-zones" className="font-semibold text-brand-700 underline">
            가림 장소
          </a>
          는 빼고 만들어요.{" "}
          <a href={`/rides/${rideId}/gpx`} className="underline">
            가리지 않은 전체 경로 파일 받기
          </a>
        </p>
      </div>
    </div>
  );
}
