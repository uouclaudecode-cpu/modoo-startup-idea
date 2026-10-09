import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { FinderThreadsLink } from "./FinderThreadsLink";
import { Scanner } from "./Scanner";

export const metadata: Metadata = { title: "QR 스캔" };

export default function ScanPage() {
  return (
    <div className="mx-auto max-w-md space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">QR 스캔</h1>
        <p className="mt-1 text-sm text-ink-muted">이동수단에 붙은 QR을 카메라에 비춰 주세요. 휴대폰 기본 카메라로 찍어도 돼요.</p>
      </div>
      <FinderThreadsLink />
      <Link href="/check" className="flex items-center gap-3 rounded-2xl bg-white p-4 ring-1 ring-line hover:bg-slate-50">
        <Search aria-hidden className="h-5 w-5 flex-none text-brand-600" />
        <span className="flex-1 text-[15px] font-semibold">중고로 사기 전에? <span className="text-brand-700">도난 조회</span>로 확인하기</span>
      </Link>
      <Scanner />
    </div>
  );
}
