import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireAdmin } from "@/lib/admin";
import { MemberSearch } from "./MemberSearch";

export const metadata: Metadata = { title: "회원 본인인증", robots: { index: false } };

export default async function AdminMembersPage() {
  await requireAdmin("/admin/members");
  return (
    <div className="mx-auto max-w-xl space-y-5">
      <Link href="/admin" className="inline-flex items-center gap-1 text-sm font-semibold text-ink-muted hover:text-ink">
        <ChevronLeft aria-hidden className="h-4 w-4" />
        운영 통계
      </Link>
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">회원 본인인증</h1>
        <p className="mt-1 text-sm leading-relaxed text-ink-muted">
          신분증 확인 등으로 직접 확인한 회원에게만 &lsquo;본인인증 완료&rsquo;를 켜 주세요. 제보·댓글의 신뢰 정보에 배지로 보여요. (휴대폰 본인인증 연동 전 임시 방식)
        </p>
      </div>
      <MemberSearch />
    </div>
  );
}
