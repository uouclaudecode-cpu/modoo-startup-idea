import type { Metadata } from "next";
import { Scanner } from "./Scanner";

export const metadata: Metadata = { title: "QR 스캔" };

export default function ScanPage() {
  return (
    <div className="mx-auto max-w-md space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">QR 스캔</h1>
        <p className="mt-1 text-sm text-ink-muted">이동수단에 붙은 QR을 카메라에 비춰 주세요. 휴대폰 기본 카메라로 찍어도 돼요.</p>
      </div>
      <Scanner />
    </div>
  );
}
