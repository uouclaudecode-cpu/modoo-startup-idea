"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Download, Share2 } from "lucide-react";
import { Button, Card, useToast } from "@/components/ui";
import { copyText } from "@/lib/clipboard";
import { scanUrl } from "@/lib/qr";

/** 화면용 QR + 부착용 스티커 이미지(PNG) 저장 + 공유 */
export function QrCard({
  token,
  vehicleName,
  siteName,
  caption,
}: {
  token: string;
  vehicleName: string;
  siteName: string;
  /** 카드 위쪽 설명 (예: 앱 QR / 스티커 QR) */
  caption?: string;
}) {
  const toast = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<"save" | "share" | null>(null);

  useEffect(() => {
    const link = scanUrl(token);
    setUrl(link);
    const canvas = canvasRef.current;
    if (canvas) {
      // 오류 정정 수준 H: 스티커가 일부 긁히거나 더러워져도 읽히도록
      QRCode.toCanvas(canvas, link, { width: 640, margin: 1, errorCorrectionLevel: "H" })
        .then(() => {
          // 라이브러리가 넣는 고정 크기(640px)를 지워 화면 폭에 맞춰 줄어들게 합니다.
          canvas.style.width = "100%";
          canvas.style.height = "auto";
        })
        .catch((e) => {
          console.error(e);
          toast.error("QR을 만들지 못했어요. 새로고침해 주세요.");
        });
    }
  }, [token, toast]);

  /** 스티커용 이미지: QR + 서비스 이름 + 안내 문구 */
  async function stickerBlob(): Promise<Blob> {
    const qr = document.createElement("canvas");
    await QRCode.toCanvas(qr, url, { width: 900, margin: 1, errorCorrectionLevel: "H" });
    const W = 1080;
    const H = 1300;
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#2552e8";
    ctx.fillRect(0, 0, W, 150);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 64px 'Pretendard Variable', 'Malgun Gothic', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(siteName, W / 2, 100);
    ctx.drawImage(qr, (W - 900) / 2, 190);
    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 46px 'Pretendard Variable', 'Malgun Gothic', sans-serif";
    ctx.fillText("발견하셨다면 QR을 스캔해 주세요", W / 2, 1170);
    ctx.fillStyle = "#64748b";
    ctx.font = "34px 'Pretendard Variable', 'Malgun Gothic', sans-serif";
    ctx.fillText("등록된 이동수단의 디지털 신분증입니다", W / 2, 1230);
    return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("이미지 생성 실패"))), "image/png"));
  }

  async function onSave() {
    setBusy("save");
    try {
      const blob = await stickerBlob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${siteName}-QR-${vehicleName}-${token.slice(-4)}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      toast.success("QR 이미지를 저장했어요.");
    } catch (e) {
      console.error(e);
      toast.error("저장에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setBusy(null);
    }
  }

  async function onShare() {
    setBusy("share");
    try {
      const blob = await stickerBlob();
      const file = new File([blob], `${siteName}-QR.png`, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `${vehicleName} QR` });
      } else if (navigator.share) {
        await navigator.share({ title: `${vehicleName} QR`, url });
      } else {
        const ok = await copyText(url);
        toast[ok ? "success" : "error"](ok ? "QR 주소를 복사했어요." : "복사하지 못했어요.");
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        console.error(e);
        toast.error("공유하지 못했어요.");
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="space-y-5 p-6 text-center">
      <div>
        <p className="text-sm font-semibold text-brand-700">{vehicleName}</p>
        {caption && <p className="mt-0.5 text-[13px] text-ink-muted">{caption}</p>}
      </div>
      <div className="mx-auto w-full max-w-[320px] rounded-2xl bg-white p-3 ring-1 ring-line">
        <canvas ref={canvasRef} className="h-auto w-full" style={{ imageRendering: "pixelated" }} aria-label="QR 코드" />
      </div>
      <p className="text-[15px] font-semibold leading-relaxed">이 QR은 등록된 이동수단의 디지털 신분증입니다.</p>
      <p className="text-[13px] leading-relaxed text-ink-muted">
        QR에는 무작위 코드만 들어 있어요. 이름·연락처 같은 개인정보는 담기지 않아요.
      </p>
      <div className="grid gap-2">
        <Button size="lg" full loading={busy === "save"} loadingText="저장 중..." icon={<Download aria-hidden className="h-5 w-5" />} onClick={onSave}>
          QR 이미지 저장
        </Button>
        <Button size="lg" full variant="secondary" loading={busy === "share"} loadingText="준비 중..." icon={<Share2 aria-hidden className="h-5 w-5" />} onClick={onShare}>
          공유
        </Button>
      </div>
    </Card>
  );
}
