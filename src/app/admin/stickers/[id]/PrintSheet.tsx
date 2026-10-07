"use client";

/* eslint-disable @next/next/no-img-element -- 브라우저에서 만든 QR 이미지(data URL)라 기본 img 사용 */
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Download, Printer } from "lucide-react";
import { Button, Card, Loading } from "@/components/ui";
import { scanUrl } from "@/lib/qr";

const PER_PAGE = 40; // A4 한 장: 5칸 × 8줄

/**
 * 인쇄용 스티커 시트 (A4, 5×8). 브라우저 인쇄 → 'PDF로 저장'하면 인쇄소에 보낼 파일이 돼요.
 * 인쇄소가 '가변 데이터(QR 일련번호) 인쇄'를 지원하면 CSV 파일을 보내도 돼요.
 */
export function PrintSheet({ codes, label, siteName }: { codes: string[]; label: string; siteName: string }) {
  const [images, setImages] = useState<string[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all(codes.map((c) => QRCode.toDataURL(scanUrl(c), { width: 360, margin: 1, errorCorrectionLevel: "H" })))
      .then((urls) => !cancelled && setImages(urls))
      .catch((e) => {
        console.error(e);
        if (!cancelled) setError("QR을 만들지 못했어요. 새로고침해 주세요.");
      });
    return () => {
      cancelled = true;
    };
  }, [codes]);

  function downloadCsv() {
    const rows = ["번호,코드,QR주소", ...codes.map((c, i) => `${i + 1},${c},${scanUrl(c)}`)];
    // 엑셀에서 한글이 깨지지 않도록 BOM을 붙입니다.
    const blob = new Blob(["﻿" + rows.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${siteName}-스티커-${label}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  if (error) return <p className="text-sm text-rose-600">{error}</p>;
  if (!images) return <Loading text="QR 만드는 중..." />;

  const pages: number[][] = [];
  for (let i = 0; i < codes.length; i += PER_PAGE) pages.push(codes.slice(i, i + PER_PAGE).map((_, j) => i + j));

  return (
    <div className="space-y-4">
      <Card className="space-y-3 print:hidden">
        <div className="grid grid-cols-2 gap-2">
          <Button icon={<Printer aria-hidden className="h-4 w-4" />} onClick={() => window.print()}>
            인쇄 / PDF 저장
          </Button>
          <Button variant="secondary" icon={<Download aria-hidden className="h-4 w-4" />} onClick={downloadCsv}>
            CSV 받기
          </Button>
        </div>
        <ul className="list-disc space-y-1 pl-5 text-[13px] leading-relaxed text-ink-muted">
          <li>집·학교 프린터: A4 40칸 라벨지(예: 38.1×33.9mm)에 &lsquo;실제 크기(100%)&rsquo;로 인쇄해요.</li>
          <li>인쇄소 주문: 인쇄 창에서 &lsquo;PDF로 저장&rsquo;한 파일을 보내거나, QR 가변 인쇄가 되는 곳이면 CSV를 보내요.</li>
          <li>방수·코팅 스티커(유포지·PET)를 고르면 비에 젖어도 잘 읽혀요.</li>
        </ul>
      </Card>

      {pages.map((idxs, p) => (
        <div key={p} className="sticker-page mx-auto grid w-[210mm] max-w-full grid-cols-5 gap-[2mm] bg-white p-[6mm] shadow-card ring-1 ring-line print:shadow-none print:ring-0">
          {idxs.map((i) => (
            <div key={codes[i]} className="flex h-[33mm] flex-col items-center justify-center rounded-[2mm] border border-dashed border-slate-300 px-[1mm] text-center print:border-slate-200">
              <img src={images[i]} alt={`스티커 QR ${i + 1}`} className="h-[22mm] w-[22mm]" style={{ imageRendering: "pixelated" }} />
              <p className="mt-[0.5mm] text-[7pt] font-extrabold leading-none text-brand-700">{siteName}</p>
              <p className="mt-[0.5mm] text-[5.5pt] leading-tight text-slate-600">찍어서 내 자전거 등록 · {codes[i].slice(-4)}</p>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
