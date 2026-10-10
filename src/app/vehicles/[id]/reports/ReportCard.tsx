"use client";

/* eslint-disable @next/next/no-img-element -- 잠깐 열리는 비공개 사진 주소라 기본 img 사용 */
import { useEffect, useState } from "react";
import { Ban, Camera, CheckCheck, ChevronDown, Clock, ExternalLink, MapPin, MessageCircle, Phone } from "lucide-react";
import { Badge, Button, Card, useToast } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatDateTime, friendlyError } from "@/lib/format";
import type { Report } from "@/lib/types";
import { MoneyWarning, TrustInfo } from "@/components/alerts/TrustInfo";
import { createClient } from "@/lib/supabase/client";
import { OwnerChat } from "./OwnerChat";
import { noticeInfo } from "@/lib/notices";
import { hasMoneyRequest, type Trust } from "@/lib/alerts";

/** 주인이 남긴 처리 표시 (확인함·연락함 / 대화 차단). 목록에서 읽어 오지 않았으면 undefined */
type ReportRow = Report & { handled_at?: string | null; chat_blocked_at?: string | null };

export function ReportCard({ report: r, imageUrl, trust }: { report: ReportRow; imageUrl: string | null; trust: Trust | null }) {
  const toast = useToast();
  // 대화·전화 요청은 처음부터 펼쳐서 대화창과 콜백 번호가 바로 보이게
  const [open, setOpen] = useState(r.contact_mode === "chat" || r.contact_mode === "callback");
  const [handledAt, setHandledAt] = useState<string | null>(r.handled_at ?? null);
  const [blockedAt, setBlockedAt] = useState<string | null>(r.chat_blocked_at ?? null);
  const [marking, setMarking] = useState(false);
  const needsAction = r.contact_mode === "chat" || r.contact_mode === "callback";
  // QR '주인에게 알리기'로 온 알림이면 사유 (037)
  const notice = noticeInfo(r.reason);
  const handledLabel = r.contact_mode === "callback" ? "연락함" : "확인함";

  // MY의 '받은 제보·대화'에서 눌러 들어오면(#r-아이디) 그 제보를 펼쳐요
  useEffect(() => {
    if (window.location.hash === `#r-${r.id}`) setOpen(true);
  }, [r.id]);

  // 목록에서 처리 표시를 함께 읽어 오지 않았으면 여기서 따로 읽어요
  useEffect(() => {
    if (!needsAction || r.handled_at !== undefined) return;
    let cancelled = false;
    createClient()
      .from("reports")
      .select("handled_at, chat_blocked_at")
      .eq("id", r.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled || error || !data) return;
        setHandledAt((data.handled_at as string | null) ?? null);
        setBlockedAt((data.chat_blocked_at as string | null) ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [needsAction, r.id, r.handled_at]);

  async function markHandled(next: boolean) {
    setMarking(true);
    const { data, error } = await createClient().rpc("mark_report_handled", { p_report: r.id, p_handled: next });
    setMarking(false);
    if (error) {
      console.error(error);
      return toast.error(friendlyError(error, "표시하지 못했어요. 잠시 후 다시 시도해 주세요."));
    }
    setHandledAt(next ? ((data as string | null) ?? new Date().toISOString()) : null);
    toast.success(next ? `'${handledLabel}'으로 표시했어요. MY의 답장 기다림에서 빠져요.` : "표시를 풀었어요.");
  }

  const hasCoords = r.latitude != null && r.longitude != null;
  const place = r.location_text || (hasCoords ? `위도 ${r.latitude!.toFixed(5)}, 경도 ${r.longitude!.toFixed(5)}` : "위치 정보 없음");
  // 지도 API가 아닌 무료 링크: 카카오맵 앱/웹에서 위치를 보여줍니다.
  const mapHref = hasCoords ? `https://map.kakao.com/link/map/${encodeURIComponent("발견 위치")},${r.latitude},${r.longitude}` : null;

  return (
    <Card id={`r-${r.id}`} className="scroll-mt-20 space-y-3 p-4">
      <div className="flex items-center justify-between gap-2">
        {r.kind === "found" ? (
          <Badge tone="warning" icon={<MapPin className="h-3.5 w-3.5" />}>
            발견 제보
          </Badge>
        ) : notice ? (
          <Badge tone={notice.urgent ? "danger" : "brand"}>
            <span aria-hidden>{notice.emoji}</span> {notice.urgent ? "급한 알림" : "QR 알림"}
            {(r.notice_count ?? 1) > 1 && ` · ${r.notice_count}명`}
          </Badge>
        ) : (
          <Badge tone="brand" icon={<MessageCircle className="h-3.5 w-3.5" />}>
            연락 요청
          </Badge>
        )}
        <span className="flex min-w-0 flex-wrap items-center justify-end gap-x-2 gap-y-1 text-[13px] text-ink-muted">
          {blockedAt ? (
            <Badge icon={<Ban className="h-3.5 w-3.5" />}>차단함</Badge>
          ) : (
            handledAt && (
              <Badge tone="success" icon={<CheckCheck className="h-3.5 w-3.5" />}>
                {handledLabel}
              </Badge>
            )
          )}
          <span className="flex items-center gap-1">
            <Clock aria-hidden className="h-3.5 w-3.5" />
            {formatDateTime(r.created_at)}
          </span>
        </span>
      </div>

      {notice && (
        <div className={cn("rounded-xl p-3", notice.urgent ? "bg-rose-50 text-rose-900" : "bg-brand-50/60")}>
          <p className="text-[17px] font-bold leading-snug">
            <span aria-hidden>{notice.emoji}</span> {notice.label}
          </p>
          {/* 사유 뒤에 붙인 한마디 */}
          {r.description.includes(" · ") && <p className="mt-1 text-[15px] leading-relaxed">{r.description.slice(r.description.indexOf(" · ") + 3)}</p>}
          {(r.notice_count ?? 1) > 1 && <p className="mt-1 text-[13px] text-ink-muted">{r.notice_count}명이 같은 내용을 알려 줬어요.</p>}
        </div>
      )}

      <ul className="space-y-1.5 text-[15px]">
        {r.kind === "found" && (
          <li className="flex items-start gap-2">
            <MapPin aria-hidden className="mt-0.5 h-4 w-4 flex-none text-orange-600" />
            <span className="font-semibold">{place}</span>
          </li>
        )}
        <li className="flex items-center gap-2 text-ink-soft">
          <Camera aria-hidden className="h-4 w-4 flex-none" />
          {r.image_path ? "사진 있음" : "사진 없음"}
        </li>
        <li className="flex items-center gap-2 text-ink-soft">
          <Phone aria-hidden className="h-4 w-4 flex-none" />
          {r.contact_mode === "chat" ? "익명 대화 가능" : r.contact_mode === "callback" ? "전화 요청 (전화를 원해요)" : r.contact ? "연락 가능" : "연락 안 받기"}
        </li>
      </ul>

      {open && (
        <div className="space-y-3 border-t border-line pt-3">
          <p className="whitespace-pre-line rounded-xl bg-slate-50 p-3 text-[15px] leading-relaxed">{r.description}</p>
          {hasMoneyRequest(`${r.description} ${r.contact ?? ""}`) ? <MoneyWarning trust={trust} anonymous={!r.reporter_id} /> : <TrustInfo trust={trust} anonymous={!r.reporter_id} />}
          {imageUrl ? (
            <a href={imageUrl} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl ring-1 ring-line">
              <img src={imageUrl} alt="발견자가 보낸 사진" className="max-h-96 w-full object-cover" />
            </a>
          ) : (
            r.image_path && <p className="text-sm text-ink-muted">사진을 불러오지 못했어요. 새로고침해 주세요.</p>
          )}
          {hasCoords && (
            <p className="font-mono text-[13px] text-ink-muted">
              위도 {r.latitude!.toFixed(6)}, 경도 {r.longitude!.toFixed(6)}
            </p>
          )}
          {r.contact && (
            <div className="flex items-center gap-3 rounded-xl bg-brand-50 p-3 text-[15px]">
              <p className="min-w-0 flex-1">
                <span className="text-[13px] font-semibold text-brand-700">{r.contact_mode === "callback" ? "전화 요청 번호" : "발견자 연락처"}</span>
                <br />
                <span className="break-all">{r.contact}</span>
              </p>
              {/^[\d\s+()-]{7,}$/.test(r.contact) && (
                <a href={`tel:${r.contact.replace(/[^\d+]/g, "")}`} className="inline-flex h-10 flex-none items-center gap-1.5 rounded-xl bg-brand-600 px-3 text-sm font-semibold text-white">
                  <Phone aria-hidden className="h-4 w-4" />
                  전화
                </a>
              )}
            </div>
          )}
          {r.contact_mode === "chat" && (
            <OwnerChat reportId={r.id} createdAt={r.created_at} trust={trust} anonymous={!r.reporter_id} blockedAt={blockedAt} onBlockedChange={setBlockedAt} />
          )}
          {needsAction && !blockedAt && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-[13px] leading-snug text-ink-soft">
              {handledAt ? (
                <>
                  <span className="flex min-w-0 items-center gap-1.5 font-semibold text-emerald-700">
                    <CheckCheck aria-hidden className="h-4 w-4 flex-none" />
                    {handledLabel}으로 표시했어요 · {formatDateTime(handledAt)}
                  </span>
                  <button
                    type="button"
                    onClick={() => markHandled(false)}
                    disabled={marking}
                    className="-my-2 py-2 font-semibold text-ink-muted underline-offset-2 hover:underline disabled:opacity-60"
                  >
                    표시 풀기
                  </button>
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1">
                    {r.contact_mode === "callback" ? "전화했다면 표시해 두세요. MY의 답장 기다림에서 빠져요." : "더 답장하지 않아도 되면 표시해 두세요."}
                  </span>
                  <Button variant="secondary" loading={marking} loadingText="표시 중..." icon={<CheckCheck aria-hidden className="h-4 w-4" />} onClick={() => markHandled(true)}>
                    {r.contact_mode === "callback" ? "연락했어요" : "확인했어요"}
                  </Button>
                </>
              )}
            </div>
          )}
          {mapHref && (
            <a
              href={mapHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 underline-offset-2 hover:underline"
            >
              지도 앱에서 위치 보기 <ExternalLink aria-hidden className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      )}

      <Button variant="secondary" full onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? "접기" : "상세 보기"}
        <ChevronDown aria-hidden className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </Button>
    </Card>
  );
}
