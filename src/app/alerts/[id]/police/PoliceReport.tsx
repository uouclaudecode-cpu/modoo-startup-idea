"use client";

/* eslint-disable @next/next/no-img-element -- 인쇄용 문서라 기본 img 사용 */
import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronLeft, Copy, MessageSquareText, Printer, Lock } from "lucide-react";
import { Button, Card, Input, useToast } from "@/components/ui";
import type { AlertCard } from "@/lib/alerts";
import { copyText } from "@/lib/clipboard";
import { formatDateTime } from "@/lib/format";
import { typeLabel, type Vehicle } from "@/lib/types";

export type ReportPhoto = { src: string; label: string };

type Props = {
  alert: AlertCard;
  vehicle: Vehicle;
  stickerCodes: string[];
  qrValue: string;
  photos: ReportPhoto[];
  mapUrl: string;
  mapQr: string;
  alertQr: string;
  alertUrl: string;
  policeReportNo: string | null;
};

/**
 * 112 신고·경찰서 제출용 도난 피해 정보 정리서 (공식 서식 아님).
 * 이름·생년월일·연락처·차대번호 전체는 이 화면에서만 쓰고 저장하지 않아요.
 */
export function PoliceReport({ alert, vehicle, stickerCodes, qrValue, photos, mapUrl, mapQr, alertQr, alertUrl, policeReportNo }: Props) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [birth, setBirth] = useState("");
  const [phone, setPhone] = useState("");
  const [serial, setSerial] = useState("");
  const [address, setAddress] = useState(alert.place_label ?? "");
  const [kind, setKind] = useState("");

  const model = [vehicle.brand, vehicle.model].filter(Boolean).join(" ") || "모델 미상";
  const item = `${kind || typeLabel(vehicle.type)} · ${model} · ${vehicle.color || "색상 미상"}`;
  const serialText = serial.trim() || (vehicle.serial_last4 ? `끝 4자리 ${vehicle.serial_last4}` : "미확인");
  const marks = [alert.marks, vehicle.description].filter(Boolean).join(" / ");

  // 112 문자 신고용 짧은 문장 (문자는 길면 잘릴 수 있어 핵심만)
  const smsText = useMemo(
    () =>
      [
        `[${typeLabel(vehicle.type)} 도난 신고]`,
        `일시: ${formatDateTime(alert.lost_at)}경`,
        `장소: ${address.trim() || "지도 링크 참고"} (${alert.lat.toFixed(5)}, ${alert.lng.toFixed(5)})`,
        `물품: ${item}`,
        `차대번호: ${serialText}`,
        marks ? `특징: ${marks.slice(0, 80)}` : "",
        `신고자: ${name.trim() || "(이름)"} ${phone.trim() || "(연락처)"}`,
        `사진·정보: ${alertUrl}`,
      ]
        .filter(Boolean)
        .join("\n"),
    [vehicle.type, alert.lost_at, alert.lat, alert.lng, address, item, serialText, marks, name, phone, alertUrl],
  );

  async function copy() {
    const ok = await copyText(smsText);
    if (ok) toast.success("복사했어요. 문자 앱에서 받는 사람 112에 붙여넣어 보내세요.");
    else toast.error("복사하지 못했어요. 아래 글을 길게 눌러 복사해 주세요.");
  }

  const rows: [string, string][] = [
    ["도난 일시", `${formatDateTime(alert.lost_at)}경`],
    ["도난 추정 장소", `${address.trim() || "—"}\n좌표 ${alert.lat.toFixed(6)}, ${alert.lng.toFixed(6)}`],
    ["기종", kind || typeLabel(vehicle.type)],
    ["브랜드·모델", model],
    ["프레임 색상", vehicle.color || "—"],
    ["차대번호", serialText],
    ["특이사항", marks || "—"],
    ["B-LOCK QR (겉)", qrValue],
    ["숨은 스티커", stickerCodes.length ? `코드 ${stickerCodes.join(", ")}${vehicle.sticker_spot ? `\n부착 위치: ${vehicle.sticker_spot}` : ""}` : "없음"],
    ["경찰 접수번호", policeReportNo || "—"],
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="space-y-4 print:hidden">
        <Link href={`/alerts/${alert.id}`} className="inline-flex items-center gap-1 text-sm font-semibold text-ink-muted hover:text-ink">
          <ChevronLeft aria-hidden className="h-4 w-4" />
          도난 경보
        </Link>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">112 도난 신고서</h1>
          <p className="mt-1 text-[15px] leading-relaxed text-ink-muted">
            경찰서에 가져가거나 112 문자로 보낼 정보를 한 장으로 정리해요. 아래 칸은 이 화면에서만 쓰고 저장하지 않아요.
          </p>
        </div>
        <Card className="space-y-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-ink-soft">
            <Lock aria-hidden className="h-4 w-4" />
            신고자 정보 (저장 안 됨)
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Input label="이름" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            <Input label="생년월일" placeholder="예) 2001.03.15" value={birth} onChange={(e) => setBirth(e.target.value)} />
          </div>
          <Input label="연락처" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
          <Input
            label="차대번호 (프레임 번호 전체, 선택)"
            hint={vehicle.serial_last4 ? `등록된 번호 끝 4자리: ${vehicle.serial_last4}` : "프레임에 새겨진 번호를 적으면 수사에 도움이 돼요."}
            value={serial}
            onChange={(e) => setSerial(e.target.value.toUpperCase())}
            autoCapitalize="characters"
          />
          <div className="grid grid-cols-2 gap-3">
            <Input label="기종 (선택)" placeholder="예) MTB, 로드, 미니벨로" value={kind} onChange={(e) => setKind(e.target.value)} />
            <Input label="장소 주소" placeholder="예) 울산 남구 대학로 93" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
        </Card>
        <div className="grid grid-cols-2 gap-2">
          <Button icon={<Printer aria-hidden className="h-4 w-4" />} onClick={() => window.print()}>
            인쇄·PDF 저장
          </Button>
          <Button variant="secondary" icon={<Copy aria-hidden className="h-4 w-4" />} onClick={copy}>
            112 문자 복사
          </Button>
        </div>
        <Card className="space-y-2">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-ink-soft">
            <MessageSquareText aria-hidden className="h-4 w-4" />
            112 문자 미리보기
          </p>
          <pre className="whitespace-pre-wrap break-all rounded-xl bg-slate-50 p-3 font-sans text-[13px] leading-relaxed">{smsText}</pre>
          <a href={`sms:112?body=${encodeURIComponent(smsText)}`} className="block text-center text-sm font-semibold text-brand-700 underline">
            문자 앱으로 열기 (받는 사람 112)
          </a>
          <p className="text-[12px] leading-relaxed text-ink-muted">급한 상황(도둑이 근처에 있음 등)이면 문자보다 112 전화가 빨라요.</p>
        </Card>
      </div>

      <article className="space-y-4 rounded-2xl bg-white p-6 text-[13px] shadow-card ring-1 ring-line/70 print:p-0 print:shadow-none print:ring-0">
        <header className="flex items-start justify-between gap-4 border-b-2 border-ink pb-3">
          <div>
            <h2 className="text-xl font-extrabold tracking-tight">도난 피해 신고용 정보 정리서</h2>
            <p suppressHydrationWarning className="mt-0.5 text-[12px] text-ink-muted">112·경찰서 제출 참고용 · 작성 {formatDateTime(new Date().toISOString())} · B-LOCK</p>
          </div>
          <div className="flex flex-none gap-2 text-center">
            <figure>
              <img src={mapQr} alt="도난 장소 지도 QR" className="h-20 w-20" />
              <figcaption className="text-[10px] text-ink-muted">장소 지도</figcaption>
            </figure>
            <figure>
              <img src={alertQr} alt="도난 경보 QR" className="h-20 w-20" />
              <figcaption className="text-[10px] text-ink-muted">사진·정보</figcaption>
            </figure>
          </div>
        </header>

        <section>
          <h3 className="mb-1.5 font-bold">1. 신고자</h3>
          <table className="w-full border-collapse">
            <tbody>
              <tr>
                <th className="w-28 border border-line bg-slate-50 px-2 py-1.5 text-left font-semibold">이름</th>
                <td className="border border-line px-2 py-1.5">{name || " "}</td>
                <th className="w-24 border border-line bg-slate-50 px-2 py-1.5 text-left font-semibold">생년월일</th>
                <td className="border border-line px-2 py-1.5">{birth || " "}</td>
              </tr>
              <tr>
                <th className="border border-line bg-slate-50 px-2 py-1.5 text-left font-semibold">연락처</th>
                <td className="border border-line px-2 py-1.5" colSpan={3}>
                  {phone || " "}
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <section>
          <h3 className="mb-1.5 font-bold">2. 도난 내용 · 피해 물품</h3>
          <table className="w-full border-collapse">
            <tbody>
              {rows.map(([k, val]) => (
                <tr key={k}>
                  <th className="w-28 border border-line bg-slate-50 px-2 py-1.5 text-left align-top font-semibold">{k}</th>
                  <td className="whitespace-pre-line break-all border border-line px-2 py-1.5">{val}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {photos.length > 0 && (
          <section>
            <h3 className="mb-1.5 font-bold">3. 증빙 사진</h3>
            <div className="grid grid-cols-2 gap-2">
              {photos.map((p, i) => (
                <figure key={i} className="space-y-1">
                  <img src={p.src} alt={p.label} className="aspect-[4/3] w-full rounded-lg object-cover ring-1 ring-line" />
                  <figcaption className="text-[11px] text-ink-muted">{p.label}</figcaption>
                </figure>
              ))}
            </div>
          </section>
        )}

        <footer className="space-y-1 border-t border-line pt-2 text-[11px] leading-relaxed text-ink-muted">
          <p>지도: {mapUrl}</p>
          <p>
            이 문서는 피해자가 B-LOCK에 등록한 정보를 정리한 참고 자료로, 경찰청 공식 서식이 아니에요. 실제 신고는 112 또는 가까운 경찰서·지구대에서 해 주세요. 등록
            시각·소유 이력은 &lsquo;소유 증명서&rsquo;에서 확인할 수 있어요.
          </p>
        </footer>
      </article>
    </div>
  );
}
