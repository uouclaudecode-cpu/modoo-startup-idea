import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireAdmin } from "@/lib/admin";
import { MemberSearch } from "./MemberSearch";

export const metadata: Metadata = { title: "회원 관리", robots: { index: false } };

export default async function AdminMembersPage() {
  await requireAdmin("/admin/members");
  return (
    <div className="mx-auto max-w-xl space-y-5">
      <Link href="/admin" className="-ml-2 inline-flex h-10 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-ink-muted hover:bg-slate-100 hover:text-ink">
        <ChevronLeft aria-hidden className="h-4 w-4" />
        운영 통계
      </Link>
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">회원 관리</h1>
        <p className="mt-1 text-sm leading-relaxed text-ink-muted">
          신분증 확인 등으로 직접 확인한 회원에게만 &lsquo;본인인증 완료&rsquo;를 켜 주세요. 제보·댓글의 신뢰 정보에 배지로 보여요. (휴대폰 본인인증 연동 전 임시 방식)
        </p>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
          사기 댓글·가짜 경보를 반복하는 계정은 &lsquo;이용 제한&rsquo;으로 막을 수 있어요. 제한 중에는 글·댓글·제보·경보·신고를 올릴 수 없고, 본인에게 알림이 가요.
        </p>
      </div>
      <MemberSearch />
    </div>
  );
}
