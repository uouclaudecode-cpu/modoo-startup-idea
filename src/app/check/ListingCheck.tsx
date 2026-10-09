"use client";

import Link from "next/link";
import { useState } from "react";
import { Copy, ExternalLink, FileSearch, MessageSquareText, ShieldAlert, ShieldCheck, TriangleAlert } from "lucide-react";
import { Button, Card, Textarea, useToast } from "@/components/ui";
import { VehicleImage } from "@/components/vehicle/VehicleImage";
import { vehicleTitle } from "@/lib/alerts";
import { copyText } from "@/lib/clipboard";
import { formatDate } from "@/lib/format";
import { vehicleImageUrl } from "@/lib/images";
import type { VehicleType } from "@/lib/types";

type Match = {
  alert_id: string;
  lost_at: string;
  place_label: string | null;
  bounty_amount: number | null;
  vehicle: { type: VehicleType; brand: string | null; model: string | null; color: string | null; image_path: string | null };
  matched: ("brand" | "model" | "color")[];
};
type Res = {
  fetched: "ok" | "failed" | "text";
  listing: { title: string; description: string; image: string | null } | null;
  matches: Match[];
  codes: string[];
};

const MATCHED: Record<Match["matched"][number], string> = { brand: "브랜드", model: "모델", color: "색상" };

const SELLER_MSG = `안녕하세요! 구매 전에 확인하고 싶어서요.
B-LOCK에 등록돼 있다면 '안심거래 인증 링크'를 보내 주실 수 있을까요?
(B-LOCK 앱 → 내 이동수단 → 중고거래 → 인증 링크)
거래할 때는 '소유권 넘기기'로 넘겨주시면 좋겠어요.
https://b-lock-app.vercel.app/check`;

/** 중고 판매 글 확인: 링크·내용으로 도난 신고와 비교 + 판매자에게 확인 요청 + 사기 확인 */
export function ListingCheck() {
  const toast = useToast();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [res, setRes] = useState<Res | null>(null);

  async function run() {
    if (input.trim().length < 2) return setError("판매 글 주소나 내용을 넣어 주세요.");
    setError("");
    setLoading(true);
    setRes(null);
    try {
      const r = await fetch("/api/listing-check", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ input }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "확인하지 못했어요.");
      setRes(j as Res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "확인하지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  }

  async function copyMsg() {
    if (await copyText(SELLER_MSG)) toast.success("메시지를 복사했어요. 판매자 채팅에 붙여 넣어 주세요.");
    else toast.error("복사하지 못했어요.");
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <FileSearch aria-hidden className="h-5 w-5 text-brand-600" />
            판매 글로 확인하기
          </h2>
          <p className="mt-1 text-[14px] leading-relaxed text-ink-muted">
            당근·번개장터·중고나라 판매 글 주소를 붙여 넣으세요. 지금 도난 신고된 자전거·킥보드와 브랜드·모델·색상을 비교해요. 주소가 안 열리면 글 내용을 복사해 넣어도 돼요.
          </p>
        </div>
        <Textarea
          label="판매 글 주소 또는 내용"
          placeholder={"예) https://www.daangn.com/kr/buy-sell/...\n또는  삼천리 하운드 블랙 자전거 팝니다"}
          rows={3}
          maxLength={4000}
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <Button full loading={loading} loadingText="비교하는 중..." icon={<FileSearch aria-hidden className="h-4 w-4" />} onClick={run}>
          도난 신고와 비교하기
        </Button>
        {error && (
          <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
            {error}
          </p>
        )}
      </Card>

      {res && (
        <Card className="space-y-3">
          {res.fetched === "failed" && (
            <p className="rounded-xl bg-amber-50 p-3 text-[13px] leading-relaxed text-amber-900">
              판매 글을 열지 못했어요. 글의 제목과 설명을 복사해서 넣으면 더 정확하게 비교할 수 있어요.
            </p>
          )}
          {res.listing && (
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-[12px] font-semibold text-ink-muted">읽어 온 판매 글</p>
              <p className="mt-0.5 font-bold">{res.listing.title}</p>
              {res.listing.description && <p className="mt-1 line-clamp-3 text-[13px] text-ink-soft">{res.listing.description}</p>}
            </div>
          )}

          {res.matches.length > 0 ? (
            <>
              <div className="flex items-center gap-3 rounded-xl bg-rose-600 p-4 text-white">
                <ShieldAlert aria-hidden className="h-7 w-7 flex-none" />
                <div>
                  <p className="font-extrabold">비슷한 도난 신고가 {res.matches.length}건 있어요</p>
                  <p className="text-[13px] text-rose-50">사진과 특징을 비교해 보세요. 같은 것 같으면 사지 말고 주인에게 알려 주세요.</p>
                </div>
              </div>
              <ul className="space-y-2">
                {res.matches.map((m) => (
                  <li key={m.alert_id}>
                    <Link href={`/alerts/${m.alert_id}`} className="flex items-center gap-3 rounded-xl p-2 ring-1 ring-line hover:bg-slate-50">
                      <VehicleImage src={vehicleImageUrl(m.vehicle.image_path)} type={m.vehicle.type} alt="" className="h-16 w-16 flex-none rounded-lg" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-bold">{vehicleTitle(m.vehicle)}</p>
                        <p className="truncate text-[13px] text-ink-muted">
                          {formatDate(m.lost_at)} {m.place_label ? `· ${m.place_label}` : ""}
                        </p>
                        <p className="text-[12px] font-semibold text-rose-700">겹치는 정보: {m.matched.map((k) => MATCHED[k]).join(", ")}</p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="flex items-center gap-3 rounded-xl bg-emerald-600 p-4 text-white">
              <ShieldCheck aria-hidden className="h-7 w-7 flex-none" />
              <div>
                <p className="font-extrabold">비슷한 도난 신고는 없어요</p>
                <p className="text-[13px] text-emerald-50">B-LOCK 도난 신고와 비교한 결과예요. 아래 확인 방법도 함께 써 주세요.</p>
              </div>
            </div>
          )}

          {res.codes.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[13px] font-semibold">글에 조회 번호처럼 보이는 게 있어요</p>
              <div className="flex flex-wrap gap-2">
                {res.codes.map((c) => (
                  <a key={c} href={`/check?q=${c}`} className="rounded-full bg-brand-50 px-3 py-1.5 text-[13px] font-bold tracking-wider text-brand-700 ring-1 ring-brand-200">
                    {c.slice(0, 4)} {c.slice(4)} 조회
                  </a>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      <Card className="space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <MessageSquareText aria-hidden className="h-5 w-5 text-brand-600" />
          판매자에게 확인 요청하기
        </h2>
        <p className="text-[14px] leading-relaxed text-ink-muted">
          진짜 주인이라면 B-LOCK &lsquo;안심거래 링크&rsquo;를 보낼 수 있어요. 아래 메시지를 복사해 판매자 채팅에 보내 보세요. 이유 없이 거절하거나 말을 돌리면 조심하세요.
        </p>
        <pre className="whitespace-pre-wrap rounded-xl bg-slate-50 p-3 font-sans text-[13px] leading-relaxed text-ink-soft">{SELLER_MSG}</pre>
        <Button variant="secondary" full icon={<Copy aria-hidden className="h-4 w-4" />} onClick={copyMsg}>
          메시지 복사
        </Button>
      </Card>

      <Card className="space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <TriangleAlert aria-hidden className="h-5 w-5 text-orange-600" />
          사기 피하는 법
        </h2>
        <ul className="list-disc space-y-1.5 pl-5 text-[14px] leading-relaxed text-ink-soft">
          <li>시세보다 너무 싸면 먼저 의심하세요.</li>
          <li>직거래를 피하고 택배·선입금만 고집하면 조심하세요.</li>
          <li>카카오톡 등 다른 메신저로 옮기자고 하면 거절하세요.</li>
          <li>입금 전에 판매자 계좌·전화번호를 아래에서 조회해 보세요.</li>
          <li>프레임 차대번호가 갈려 있거나 스티커를 뗀 흔적이 있으면 사지 마세요.</li>
        </ul>
        <div className="grid grid-cols-2 gap-2">
          <a
            href="https://ecrm.police.go.kr/minwon/main"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-white px-3 text-[14px] font-semibold text-ink ring-1 ring-inset ring-line hover:bg-slate-50"
          >
            경찰청 사기 조회
            <ExternalLink aria-hidden className="h-4 w-4" />
          </a>
          <a
            href="https://thecheat.co.kr"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-white px-3 text-[14px] font-semibold text-ink ring-1 ring-inset ring-line hover:bg-slate-50"
          >
            더치트 조회
            <ExternalLink aria-hidden className="h-4 w-4" />
          </a>
        </div>
      </Card>
    </div>
  );
}
