import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronDown, Mail, MessagesSquare, ShieldAlert } from "lucide-react";
import { site } from "@/config/site";
import { ButtonLink, Card } from "@/components/ui";

export const metadata: Metadata = { title: "문의하기" };

/** 답 안의 화면 바로가기 */
function L({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="font-semibold text-brand-700 underline underline-offset-2 hover:text-brand-800">
      {children}
    </Link>
  );
}

/** 문의 · 도움말 */
export default function ContactPage() {
  const faqs: { q: string; a: ReactNode }[] = [
    {
      q: "QR 스티커는 어디서 받나요?",
      a: "'스티커 받는 곳'에서 무료로 받거나, 'QR 출력하기'로 직접 뽑아요.",
    },
    {
      q: "자전거를 잃어버렸어요.",
      a: (
        <>
          내 이동수단에서 &lsquo;분실·도난 신고&rsquo;를 누르고, <L href="/community/new">커뮤니티에 분실 글</L>도 올려 주세요.
        </>
      ),
    },
    {
      q: "도둑맞았어요. 무엇부터 하나요?",
      a: (
        <>
          먼저 112에 신고하고, 내 이동수단 화면에서 도난 경보를 보내 주세요. 경보 화면에서 112 도난 신고서도 만들 수 있어요.
        </>
      ),
    },
    {
      q: "남의 자전거를 발견했어요.",
      a: (
        <>
          스티커가 있으면 <L href="/scan">QR을 찍어</L> 제보하고, 없으면 <L href="/community/new?kind=found">&lsquo;주인을 찾아요&rsquo; 글</L>을 올려 주세요. 직접 가져가지는 마세요.
        </>
      ),
    },
    {
      q: "제보한 뒤 주인의 답장은 어디서 보나요?",
      a: (
        <>
          <L href="/scan">QR 스캔 화면</L>의 &lsquo;내가 보낸 제보 대화&rsquo;에서 볼 수 있어요. 대화는 14일 동안 열려요.
        </>
      ),
    },
    {
      q: "중고로 사기 전에 도난품인지 확인하려면?",
      a: (
        <>
          <L href="/check">도난 조회</L>에서 QR이나 차대번호로 무료로 확인해요. 도난품이면 사지 말고 주인에게 알려 주세요.
        </>
      ),
    },
    {
      q: "중고로 사고팔 때 소유권은 어떻게 넘기나요?",
      a: "판매자가 '소유권 넘기기'로 QR이나 링크를 만들고, 구매자가 숨은 스티커를 찍으면 넘어가요.",
    },
    {
      q: "숨겨 둔 스티커가 떨어지거나 없어졌어요.",
      a: "새 스티커를 연결하고 위치를 다시 적어 두세요. 없어진 스티커로는 내 정보가 보이지 않아요.",
    },
    {
      q: "사례금은 어떻게 주고받나요?",
      a: "주인이 제보자에게 직접 주고, B-LOCK은 돈을 맡지 않아요. 돈을 먼저 보내라는 사람은 사기이니 신고해 주세요.",
    },
    {
      q: "소유 증명서는 무엇인가요?",
      a: "차대번호·영수증·사진을 모아 경찰·보험에 낼 증명서를 만들 수 있어요.",
    },
    {
      q: "위치가 실시간으로 추적되나요?",
      a: "아니에요. 제보를 보낸 순간의 위치만 전달돼요.",
    },
    {
      q: "알림이 안 와요.",
      a: (
        <>
          <L href="/settings">설정 → 휴대폰 알림</L>에서 켜 주세요. iPhone은 &lsquo;홈 화면에 추가&rsquo;한 앱에서만 받을 수 있어요.
        </>
      ),
    },
  ];
  return (
    <div className="mx-auto max-w-xl space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">문의하기</h1>
        <p className="mt-1 text-sm text-ink-muted">궁금한 점이나 불편한 점을 알려 주세요.</p>
      </div>

      <Card className="space-y-3">
        <p className="flex items-center gap-2 font-bold">
          <Mail aria-hidden className="h-5 w-5 text-brand-600" />
          이메일 문의
        </p>
        {site.contactEmail ? (
          <>
            <p className="text-[15px] text-ink-soft">평일 1~2일 안에 답장해 드려요.</p>
            <ButtonLink href={`mailto:${site.contactEmail}?subject=${encodeURIComponent(`[${site.name}] 문의`)}`} full icon={<Mail aria-hidden className="h-4 w-4" />}>
              {site.contactEmail}
            </ButtonLink>
          </>
        ) : (
          <p className="text-[15px] text-ink-soft">문의 메일 주소를 준비하고 있어요. 그동안 커뮤니티를 이용해 주세요.</p>
        )}
      </Card>

      <Card className="space-y-3">
        <p className="flex items-center gap-2 font-bold">
          <ShieldAlert aria-hidden className="h-5 w-5 text-rose-600" />
          불쾌한 글·댓글을 봤다면
        </p>
        <p className="text-[15px] text-ink-soft">
          ⋯ 메뉴에서 신고하거나 차단할 수 있어요. 운영자가 확인해요.
        </p>
      </Card>

      <section aria-labelledby="faq-title" className="space-y-2">
        <h2 id="faq-title" className="flex items-center gap-2 text-lg font-bold">
          <MessagesSquare aria-hidden className="h-5 w-5 text-brand-600" />
          자주 묻는 질문
        </h2>
        <p className="text-[13px] text-ink-muted">질문을 누르면 답이 펼쳐져요.</p>
        {faqs.map(({ q, a }) => (
          <details key={q} className="group rounded-2xl bg-white shadow-card ring-1 ring-line/70">
            {/* 브라우저 기본 ▶ 표시는 숨기고, 모든 브라우저에서 같은 화살표로 열림·닫힘을 보여 줘요 */}
            <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 rounded-2xl p-4 font-semibold text-ink marker:hidden [&::-webkit-details-marker]:hidden">
              <span className="min-w-0 flex-1">
                <span className="mr-1 text-brand-600">Q.</span>
                {q}
              </span>
              <ChevronDown aria-hidden className="h-5 w-5 flex-none text-ink-muted transition-transform group-open:rotate-180" />
            </summary>
            <p className="px-4 pb-4 text-[15px] leading-relaxed text-ink-soft">{a}</p>
          </details>
        ))}
      </section>
    </div>
  );
}
