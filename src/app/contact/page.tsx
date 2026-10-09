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
      a: "학교·편의점 등 배포처에 놓인 B-LOCK 스티커를 받아 앱으로 찍어 등록하세요. 스티커가 없으면 내 이동수단 → QR 보기에서 직접 출력해도 돼요.",
    },
    {
      q: "자전거를 잃어버렸어요.",
      a: (
        <>
          내 이동수단에서 &lsquo;분실·도난 신고&rsquo;를 누르면 QR을 찍은 사람에게 분실 안내가 보이고 발견 제보를 받을 수 있어요.{" "}
          <L href="/community/new">커뮤니티에 분실 글</L>도 올려 주세요. 신고하면 &lsquo;수색 1회&rsquo; 기록이 남아 나중에 중고로 팔 때 안심거래
          화면에도 보이니, 잠깐 둔 곳을 잊은 거라면 주변부터 찾아보세요.
        </>
      ),
    },
    {
      q: "도둑맞았어요. 무엇부터 하나요?",
      a: (
        <>
          먼저 경찰(112)에 신고하고, 내 이동수단 화면의 &lsquo;도둑맞았어요 · 근처에 도난 경보 보내기&rsquo;를 눌러 주세요. 근처에서 경보 알림을 켠
          사람들에게 알림이 가고, 목격 제보가 오면 바로 알려 드려요. 경보 화면에서 &lsquo;112 도난 신고서&rsquo;도 만들 수 있어요.
        </>
      ),
    },
    {
      q: "남의 자전거를 발견했어요.",
      a: (
        <>
          B-LOCK 스티커가 있으면 <L href="/scan">QR을 찍어</L> &lsquo;발견 제보&rsquo;로 위치와 사진을 보내 주세요. 로그인 없이도 돼요. 스티커가
          없으면 커뮤니티에 <L href="/community/new?kind=found">&lsquo;주인을 찾아요&rsquo; 글</L>을 올려 주세요. 직접 가져가지는 마세요.
        </>
      ),
    },
    {
      q: "제보한 뒤 주인의 답장은 어디서 보나요?",
      a: (
        <>
          제보를 보낸 기기에서 <L href="/scan">QR 스캔 화면</L>의 &lsquo;내가 보낸 제보 대화&rsquo;를 누르면 주인과 익명으로 대화할 수 있어요. 답장
          알림을 켜 두면 주인이 답할 때 알려 드려요. 대화는 제보 후 14일 동안 열려요.
        </>
      ),
    },
    {
      q: "중고로 사기 전에 도난품인지 확인하려면?",
      a: (
        <>
          <L href="/check">도난 조회</L>에서 QR을 찍거나, QR 아래 적힌 8자리 조회 번호 또는 프레임에 새겨진 차대번호를 넣어 보세요. 로그인 없이
          무료예요. 도난 신고된 이동수단이면 사지 말고 &lsquo;주인에게 몰래 알리기&rsquo;를 눌러 주세요.
        </>
      ),
    },
    {
      q: "중고로 사고팔 때 소유권은 어떻게 넘기나요?",
      a: "판매자가 이동수단 화면의 '소유권 넘기기'를 누르면 직접 만날 때 쓰는 10분짜리 QR이나, 비대면 거래용 7일짜리 링크를 만들 수 있어요. 구매자가 QR이나 링크를 열고 숨은 스티커를 찍으면 바로 구매자 것이 돼요. 스티커가 없으면 차대번호를 넣어요. 팔기 전에 '안심거래 인증' 링크를 보내면 사는 사람이 도난 이력·등록일을 미리 볼 수 있어요.",
    },
    {
      q: "숨겨 둔 스티커가 떨어지거나 없어졌어요.",
      a: "새 스티커를 받아 이동수단 화면의 '스티커 연결'로 찍고, 붙인 위치를 다시 적어 두세요. 없어진 스티커를 다른 사람이 찍어도 내 이름·연락처는 보이지 않아요. 아예 못 쓰게 하고 싶으면 아래 이메일로 알려 주세요.",
    },
    {
      q: "사례금은 어떻게 주고받나요?",
      a: "사례금은 경보를 낸 주인이 제보자에게 직접 주는 약속이에요. B-LOCK은 돈을 맡거나 보내지 않아요. 되찾은 뒤 주인이 '보냈어요'를, 제보자가 '받았어요'를 누르면 끝나요. 3일이 지나도 못 받았다면 제보자가 '못 받았어요'를 누를 수 있고, 이 기록은 주인의 다음 경보에 보여요. 위치를 알려 주는 대가로 돈을 먼저 보내라는 사람은 사기이니 신고해 주세요.",
    },
    {
      q: "소유 증명서는 무엇인가요?",
      a: "이동수단 화면의 '소유 증명'에 차대번호·영수증·사진을 모아 두면 경찰·보험 제출용 증명서를 만들 수 있어요. 증명서 주소로 누구나 발급 사실과 보유 기간을 확인할 수 있고, 사진·연락처 같은 개인정보는 보이지 않아요.",
    },
    {
      q: "위치가 실시간으로 추적되나요?",
      a: "아니에요. 발견한 사람이 보낸 그 순간의 위치만 주인에게 전달돼요. 라이딩 기록도 본인이 기록하는 동안만 저장돼요.",
    },
    {
      q: "알림이 안 와요.",
      a: (
        <>
          <L href="/settings">설정 → 알림</L>에서 켜 주세요. 아이폰은 Safari에서 &lsquo;홈 화면에 추가&rsquo;한 앱에서만 알림을 받을 수 있어요. 휴대폰
          알림을 못 받아도 위쪽 종 모양 <L href="/notifications">알림함</L>에서 지난 알림을 다시 볼 수 있어요.
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
            <p className="text-[15px] text-ink-soft">평일 기준 1~2일 안에 답장드려요. 계정 관련 문의는 가입한 이메일로 보내 주세요.</p>
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
          글이나 댓글의 ⋯ 메뉴에서 신고하거나 그 사용자를 차단할 수 있어요. 신고가 쌓이면 자동으로 숨겨지고 운영자가 확인해요. 같은 일을 되풀이하는
          계정은 이용을 제한해요.
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
