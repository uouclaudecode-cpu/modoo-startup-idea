import type { Metadata } from "next";
import { Mail, MessagesSquare, ShieldAlert } from "lucide-react";
import { site } from "@/config/site";
import { ButtonLink, Card } from "@/components/ui";

export const metadata: Metadata = { title: "문의하기" };

/** 문의 · 도움말 */
export default function ContactPage() {
  const faqs: [string, string][] = [
    ["QR 스티커는 어디서 받나요?", "학교·편의점 등 배포처에 놓인 B-LOCK 스티커를 받아 앱으로 찍어 등록하세요. 스티커가 없으면 내 이동수단 → QR 보기에서 직접 출력해도 돼요."],
    ["자전거를 잃어버렸어요.", "내 이동수단에서 '분실/도난 신고'를 누르고, 커뮤니티에 분실 글을 올리세요. 도난이라면 경찰(112)에도 꼭 신고해 주세요."],
    ["남의 자전거를 발견했어요.", "QR을 찍어 '발견 제보'로 위치와 사진을 보내 주세요. 로그인 없이도 돼요. 직접 가져가지는 마세요."],
    ["위치가 실시간으로 추적되나요?", "아니에요. 발견한 사람이 보낸 그 순간의 위치만 주인에게 전달돼요. 라이딩 기록도 본인이 기록하는 동안만 저장돼요."],
    ["알림이 안 와요.", "설정 → 알림에서 켜 주세요. 아이폰은 Safari에서 '홈 화면에 추가'한 앱에서만 알림을 받을 수 있어요."],
  ];
  return (
    <div className="mx-auto max-w-xl space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">문의하기</h1>
        <p className="mt-1 text-sm text-ink-muted">궁금한 점이나 불편한 점을 알려주세요.</p>
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
        <p className="text-[15px] text-ink-soft">글이나 댓글의 ⋯ 메뉴에서 신고하거나 그 사용자를 차단할 수 있어요. 신고가 쌓이면 자동으로 숨겨지고 운영자가 확인해요.</p>
      </Card>

      <section aria-labelledby="faq-title" className="space-y-2">
        <h2 id="faq-title" className="flex items-center gap-2 text-lg font-bold">
          <MessagesSquare aria-hidden className="h-5 w-5 text-brand-600" />
          자주 묻는 질문
        </h2>
        {faqs.map(([q, a]) => (
          <details key={q} className="group rounded-2xl bg-white p-4 shadow-card ring-1 ring-line/70">
            <summary className="cursor-pointer list-none font-semibold text-ink marker:hidden">
              <span className="mr-1 text-brand-600">Q.</span>
              {q}
            </summary>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">{a}</p>
          </details>
        ))}
      </section>
    </div>
  );
}
