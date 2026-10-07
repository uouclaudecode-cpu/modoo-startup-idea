"use client";

/* eslint-disable @next/next/no-img-element -- 잠깐 열리는 비공개 사진 주소라 기본 img 사용 */
import { useState } from "react";
import { Camera, ChevronDown, Clock, ExternalLink, MapPin, MessageCircle, Phone } from "lucide-react";
import { Badge, Button, Card } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import type { Report } from "@/lib/types";

export function ReportCard({ report: r, imageUrl }: { report: Report; imageUrl: string | null }) {
  const [open, setOpen] = useState(false);
  const hasCoords = r.latitude != null && r.longitude != null;
  const place = r.location_text || (hasCoords ? `위도 ${r.latitude!.toFixed(5)}, 경도 ${r.longitude!.toFixed(5)}` : "위치 정보 없음");
  // 지도 API가 아닌 무료 링크: 카카오맵 앱/웹에서 위치를 보여줍니다.
  const mapHref = hasCoords ? `https://map.kakao.com/link/map/${encodeURIComponent("발견 위치")},${r.latitude},${r.longitude}` : null;

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between gap-2">
        {r.kind === "found" ? (
          <Badge tone="warning" icon={<MapPin className="h-3.5 w-3.5" />}>
            발견 제보
          </Badge>
        ) : (
          <Badge tone="brand" icon={<MessageCircle className="h-3.5 w-3.5" />}>
            연락 요청
          </Badge>
        )}
        <span className="flex items-center gap-1 text-[13px] text-ink-muted">
          <Clock aria-hidden className="h-3.5 w-3.5" />
          {formatDateTime(r.created_at)}
        </span>
      </div>

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
          {r.contact ? "연락 가능" : "연락처 없음"}
        </li>
      </ul>

      {open && (
        <div className="space-y-3 border-t border-line pt-3">
          <p className="whitespace-pre-line rounded-xl bg-slate-50 p-3 text-[15px] leading-relaxed">{r.description}</p>
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
            <p className="rounded-xl bg-brand-50 p-3 text-[15px]">
              <span className="text-[13px] font-semibold text-brand-700">발견자 연락처</span>
              <br />
              {r.contact}
            </p>
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
