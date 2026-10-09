import type { ReactNode } from "react";
import Link from "next/link";
import { site } from "@/config/site";

/** 약관·방침 공통 틀: 제목, 시행일, 목차 링크, 본문 */
export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="mx-auto max-w-2xl space-y-6 rounded-2xl bg-white p-5 shadow-card ring-1 ring-line/70 sm:p-8">
      <header className="space-y-1 border-b border-line pb-4">
        <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
        <p className="text-sm text-ink-muted">
          시행일 {site.policyDate} · {site.operator}
        </p>
      </header>
      <div className="legal space-y-6 text-[15px] leading-relaxed text-ink-soft">{children}</div>
      <nav aria-label="다른 문서" className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-4 text-sm">
        <Link href="/terms" className="font-semibold text-brand-700 hover:underline">
          이용약관
        </Link>
        <Link href="/privacy" className="font-semibold text-brand-700 hover:underline">
          개인정보처리방침
        </Link>
        <Link href="/location-terms" className="font-semibold text-brand-700 hover:underline">
          위치정보 이용약관
        </Link>
        <Link href="/contact" className="font-semibold text-brand-700 hover:underline">
          문의하기
        </Link>
      </nav>
    </article>
  );
}

/** 조항 하나 */
export function Clause({ n, title, children }: { n?: number; title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-bold text-ink">
        {n != null ? `제${n}조 ` : ""}
        {title}
      </h2>
      {children}
    </section>
  );
}

export function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1 pl-5">
      {items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ul>
  );
}

/** 문의 연락처 (설정되지 않았으면 준비 중) */
export function ContactLine() {
  return site.contactEmail ? (
    <a href={`mailto:${site.contactEmail}`} className="font-semibold text-brand-700 hover:underline">
      {site.contactEmail}
    </a>
  ) : (
    <span>문의 메일 주소 준비 중 (그동안 커뮤니티를 이용해 주세요)</span>
  );
}
