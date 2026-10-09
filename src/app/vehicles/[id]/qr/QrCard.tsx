"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Copy, Download, Share2 } from "lucide-react";
import { Button, Card, useToast } from "@/components/ui";
import { copyText } from "@/lib/clipboard";
import { lookupCode, scanUrl } from "@/lib/qr";

/** 화면용 QR + 부착용 스티커 이미지(PNG) 저장 + 공유 */
export function QrCard({
  token,
  vehicleName,
  siteName,
  caption,
  lookup,
}: {
  token: string;
  /** 데이터베이스가 정한 읽기 쉬운 조회 번호 (없으면 예전 방식: 코드 앞 8자리) */
  lookup?: string | null;
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
    ctx.fillText(`등록된 이동수단의 디지털 신분증 · 조회 번호 ${lookupCode(lookup || token)}`, W / 2, 1230);
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
      toast.error("저장하지 못했어요. 다시 시도해 주세요.");
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

  async function copyLookup() {
    const ok = await copyText(lookupCode(lookup || token));
    if (ok) toast.success("조회 번호를 복사했어요. 중고거래 채팅에 붙여넣어 주세요.");
    else toast.error("복사하지 못했어요. 번호를 길게 눌러 복사해 주세요.");
  }

  return (
    <Card className="space-y-5 p-6 text-center">
      <div>
        <p className="text-sm font-semibold text-brand-700">{vehicleName}</p>
        {caption && <p className="mt-0.5 text-[13px] leading-relaxed text-ink-muted">{caption}</p>}
      </div>
      <div className="mx-auto w-full max-w-[320px] rounded-2xl bg-white p-3 ring-1 ring-line">
        <canvas ref={canvasRef} className="h-auto w-full" style={{ imageRendering: "pixelated" }} aria-label="QR 코드" />
      </div>
      {/* 조회 번호: 사려는 사람이 '도난 조회'에 넣는 번호 */}
      <div className="mx-auto flex w-full max-w-[320px] items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-left">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-ink-muted">조회 번호</p>
          <p className="whitespace-nowrap font-mono text-xl font-extrabold tracking-[0.12em] text-ink">{lookupCode(lookup || token)}</p>
        </div>
        <Button variant="secondary" className="h-10 flex-none px-3 text-sm" icon={<Copy aria-hidden className="h-4 w-4" />} onClick={copyLookup}>
          복사
        </Button>
      </div>
      <p className="text-[13px] leading-relaxed text-ink-muted">사려는 사람은 B-LOCK의 &lsquo;도난 조회&rsquo;에 이 번호를 넣으면 도난 여부를 볼 수 있어요.</p>
      <p className="text-[15px] font-semibold leading-relaxed">이 QR은 이동수단의 디지털 신분증이에요.</p>
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
