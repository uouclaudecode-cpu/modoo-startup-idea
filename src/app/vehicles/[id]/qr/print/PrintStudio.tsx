"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { Info, Printer } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { cn } from "@/lib/cn";
import { lookupCode, scanUrl } from "@/lib/qr";
import { createClient } from "@/lib/supabase/client";

export type PrintSource = { token: string; lookup: string | null; label: string };

/** QR 한 변 길이(cm) 고르기: 쓰임새별로 묶었어요 */
const SIZE_GROUPS: { title: string; hint: string; sizes: number[] }[] = [
  { title: "아주 작게", hint: "열쇠고리·좁은 틈", sizes: [1.5, 2, 2.5, 3] },
  { title: "작게", hint: "프레임·포크·킥보드 기둥", sizes: [3.5, 4, 4.5, 5, 6] },
  { title: "보통", hint: "안장 밑·바구니·발판", sizes: [7, 8, 9, 10, 12] },
  { title: "크게", hint: "안장 가방에 넣거나 접어서 보관", sizes: [14, 15, 16] },
];
const A4_FULL = 17.5; // A4 한 장 가득 (인쇄 여백·글자 줄 빼고)
const MIN_CM = 1.5;
const MAX_CM = A4_FULL;

type Style = "full" | "code" | "qr";
const STYLES: { value: Style; label: string; desc: string; min: number }[] = [
  { value: "full", label: "QR + 안내 문구", desc: "B-LOCK 이름·안내·조회 번호", min: 4 },
  { value: "code", label: "QR + 조회 번호", desc: "QR 아래 8자리 번호만", min: 2 },
  { value: "qr", label: "QR만", desc: "가장 작게 붙일 때", min: 0 },
];

// A4에서 인쇄할 수 있는 영역 (globals.css 기본 여백 14mm·12mm를 뺀 크기)
const AREA_W = 186;
const AREA_H = 269;
const GAP = 3;

/** 스티커 한 칸의 크기(mm): QR + 여백 + 글자 줄 */
function cellSize(qrMm: number, style: Style) {
  const pad = Math.min(4, Math.max(1.2, qrMm * 0.05));
  const text = style === "qr" ? 0 : style === "code" ? Math.max(2.6, qrMm * 0.09) * 1.5 : qrMm * 0.4;
  return { w: qrMm + pad * 2, h: qrMm + pad * 2 + text, pad };
}

export function PrintStudio({ vehicleId, vehicleName, sources }: { vehicleId: string; vehicleName: string; sources: PrintSource[] }) {
  const [src, setSrc] = useState(0);
  const [cm, setCm] = useState(5);
  const [custom, setCustom] = useState("");
  const [style, setStyle] = useState<Style>("full");
  const [mode, setMode] = useState<"one" | "fill" | "count">("fill");
  const [count, setCount] = useState("6");
  const [cut, setCut] = useState(true);
  const [svg, setSvg] = useState("");
  const previewRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);

  const source = sources[src] ?? sources[0];
  const url = scanUrl(source.token);
  const code = lookupCode(source.lookup || source.token);

  useEffect(() => {
    QRCode.toString(url, { type: "svg", margin: 0, errorCorrectionLevel: "H" })
      .then((s) => setSvg(s.replace("<svg ", '<svg width="100%" height="100%" shape-rendering="crispEdges" ')))
      .catch((e) => console.error(e));
  }, [url]);

  // 미리 보기: A4를 화면 폭에 맞춰 줄여 보여 줘요
  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    const fit = () => setScale(Math.min(1, el.clientWidth / ((210 / 25.4) * 96)));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 글자가 들어가기엔 너무 작으면 자동으로 단순한 모양으로
  const wantMm = Math.round(cm * 10 * 10) / 10;
  const effStyle: Style = wantMm < 20 ? "qr" : style === "full" && wantMm < 40 ? "code" : style;
  // 종이(인쇄 영역)를 넘지 않게 줄여요
  let qrMm = wantMm;
  while (qrMm > 10) {
    const c = cellSize(qrMm, effStyle);
    if (c.w <= AREA_W && c.h <= AREA_H) break;
    qrMm -= 1;
  }
  const cell = cellSize(qrMm, effStyle);
  const cols = Math.max(1, Math.floor((AREA_W + GAP) / (cell.w + GAP)));
  const rows = Math.max(1, Math.floor((AREA_H + GAP) / (cell.h + GAP)));
  const perPage = cols * rows;
  const total = mode === "one" ? 1 : mode === "fill" ? perPage : Math.min(Math.max(1, Number(count) || 1), perPage * 5);
  const pages = useMemo(() => {
    const out: number[] = [];
    for (let left = total; left > 0; left -= perPage) out.push(Math.min(left, perPage));
    return out;
  }, [total, perPage]);

  function pickCustom(v: string) {
    setCustom(v);
    const n = Number(v.replace(",", "."));
    if (Number.isFinite(n) && n >= MIN_CM && n <= MAX_CM) setCm(n);
  }

  async function print() {
    // 시작 안내의 'QR 붙이기'를 끝낸 것으로 표시 (실패해도 인쇄는 계속)
    createClient()
      .rpc("mark_qr_printed", { p_vehicle: vehicleId })
      .then(({ error }) => error && console.error(error));
    window.print();
  }

  const chip = (active: boolean) =>
    cn(
      "h-10 rounded-xl px-3 text-[14px] font-semibold ring-1 ring-inset transition-colors",
      active ? "bg-brand-600 text-white ring-brand-600" : "bg-white text-ink ring-line hover:bg-slate-50",
    );

  return (
    <div className="space-y-4 print:space-y-0">
      <div className="space-y-4 print:hidden">
        {sources.length > 1 && (
          <Card className="space-y-2">
            <p className="font-bold">어떤 QR을 출력할까요?</p>
            <div className="flex flex-wrap gap-2">
              {sources.map((s, i) => (
                <button key={s.token} type="button" className={chip(src === i)} aria-pressed={src === i} onClick={() => setSrc(i)}>
                  {s.label}
                </button>
              ))}
            </div>
          </Card>
        )}

        <Card className="space-y-4">
          <div>
            <p className="font-bold">QR 크기 (한 변)</p>
            <p className="text-[13px] text-ink-muted">붙일 곳에 맞게 골라요. 숫자는 QR 네모 한 변의 길이예요.</p>
          </div>
          {SIZE_GROUPS.map((g) => (
            <div key={g.title}>
              <p className="mb-1.5 text-[13px] font-semibold text-ink-soft">
                {g.title} <span className="font-normal text-ink-muted">· {g.hint}</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {g.sizes.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={chip(cm === s && !custom)}
                    aria-pressed={cm === s && !custom}
                    onClick={() => {
                      setCustom("");
                      setCm(s);
                    }}
                  >
                    {s}cm
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={chip(cm === A4_FULL && !custom)}
              aria-pressed={cm === A4_FULL && !custom}
              onClick={() => {
                setCustom("");
                setCm(A4_FULL);
                setMode("one");
              }}
            >
              A4 한 장 가득
            </button>
            <label className="flex items-center gap-2 text-[14px]">
              <span className="font-semibold">직접 입력</span>
              <input
                inputMode="decimal"
                placeholder="예) 3.2"
                value={custom}
                onChange={(e) => pickCustom(e.target.value)}
                className="h-10 w-24 rounded-xl px-3 text-base ring-1 ring-inset ring-line focus:ring-2 focus:ring-brand-500"
              />
              <span className="text-ink-muted">cm ({MIN_CM}~{MAX_CM})</span>
            </label>
            {custom && !(Number(custom.replace(",", ".")) >= MIN_CM && Number(custom.replace(",", ".")) <= MAX_CM) && (
              <p className="w-full text-[13px] text-rose-600">
                {MIN_CM}~{MAX_CM}cm 사이로 적어 주세요. 지금은 {cm}cm로 보여요.
              </p>
            )}
          </div>
        </Card>

        <Card className="space-y-4">
          <div>
            <p className="mb-2 font-bold">모양</p>
            <div className="grid gap-2 sm:grid-cols-3">
              {STYLES.map((s) => {
                const tooSmall = qrMm < s.min * 10;
                return (
                  <button
                    key={s.value}
                    type="button"
                    disabled={tooSmall}
                    aria-pressed={style === s.value}
                    onClick={() => setStyle(s.value)}
                    className={cn(
                      "rounded-xl p-3 text-left ring-1 ring-inset transition-colors disabled:opacity-40",
                      effStyle === s.value ? "bg-brand-50 ring-2 ring-brand-500" : "bg-white ring-line hover:bg-slate-50",
                    )}
                  >
                    <span className="block text-[14px] font-bold">{s.label}</span>
                    <span className="block text-[12px] text-ink-muted">{tooSmall ? `${s.min}cm 이상에서 골라요` : s.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <p className="mb-2 font-bold">몇 개 찍을까요?</p>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className={chip(mode === "one")} aria-pressed={mode === "one"} onClick={() => setMode("one")}>
                1개
              </button>
              <button type="button" className={chip(mode === "fill")} aria-pressed={mode === "fill"} onClick={() => setMode("fill")}>
                한 장 가득 ({perPage}개)
              </button>
              <button type="button" className={chip(mode === "count")} aria-pressed={mode === "count"} onClick={() => setMode("count")}>
                직접
              </button>
              {mode === "count" && (
                <input
                  inputMode="numeric"
                  value={count}
                  onChange={(e) => setCount(e.target.value.replace(/\D/g, "").slice(0, 3))}
                  className="h-10 w-20 rounded-xl px-3 text-base ring-1 ring-inset ring-line focus:ring-2 focus:ring-brand-500"
                  aria-label="개수"
                />
              )}
            </div>
          </div>
          <label className="flex items-center gap-2 text-[14px] font-semibold">
            <input type="checkbox" className="h-5 w-5 accent-brand-600" checked={cut} onChange={(e) => setCut(e.target.checked)} />
            자르는 선(점선) 넣기
          </label>
        </Card>

        <div className="flex gap-2 rounded-xl bg-brand-50 p-3 text-[13px] leading-relaxed text-brand-900">
          <Info aria-hidden className="mt-0.5 h-4 w-4 flex-none" />
          <div className="space-y-1">
            <p>
              인쇄 창에서 <b>배율을 &lsquo;100%&rsquo;(실제 크기)</b>로 두어야 고른 크기 그대로 나와요. &lsquo;페이지에 맞춤&rsquo;을 켜면 크기가 바뀌어요.
            </p>
            <p>
              <b>한 장에 찍힌 QR은 모두 같은 QR이에요.</b> 따로 등록할 필요 없이 내 이동수단 여러 곳(안장 밑·프레임 안쪽 등)에 숨겨 붙여 주세요. 남은 건 다른 이동수단에 붙이지 말고 버려 주세요.
            </p>
            <p>스티커 용지(라벨지)에 뽑으면 바로 붙일 수 있어요. 일반 종이라면 투명 테이프로 덮거나 코팅하면 비에 강해져요.</p>
            <p>A4로 크게 뽑아 접어서 안장 가방이나 안장 밑에 넣어 둬도 돼요. 찾은 사람이 보고 찍을 수 있어요.</p>
          </div>
        </div>

        <Button size="lg" full icon={<Printer aria-hidden className="h-5 w-5" />} onClick={print} disabled={!svg}>
          {total}개 인쇄하기 ({pages.length}장)
        </Button>
        <p className="text-center text-[13px] text-ink-muted">아래는 A4 미리보기예요.</p>
      </div>

      {/* 미리 보기 겸 인쇄 영역 (화면에서는 줄여 보여 주고, 인쇄할 때는 실제 크기) */}
      <div ref={previewRef} className="w-full print:!mt-0 print:w-auto">
        {pages.map((n, pi) => (
          <div
            key={pi}
            className="mb-4 overflow-hidden rounded-lg bg-white shadow-lift ring-1 ring-line print:mb-0 print:!h-auto print:!w-auto print:overflow-visible print:rounded-none print:shadow-none print:ring-0 print:[&:not(:last-child)]:break-after-page"
            style={{ width: `calc(210mm * ${scale})`, height: `calc(297mm * ${scale})` }}
          >
            <div
              className="origin-top-left print:!h-auto print:!w-auto print:!p-0 print:!transform-none"
              style={{ width: "210mm", height: "297mm", padding: "14mm 12mm", transform: `scale(${scale})` }}
            >
              <div className="flex flex-wrap content-start" style={{ gap: `${GAP}mm`, width: `${AREA_W}mm` }}>
                {Array.from({ length: n }, (_, i) => (
                  <Label key={i} svg={svg} qrMm={qrMm} style={effStyle} code={code} cut={cut} vehicleName={vehicleName} />
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Label({ svg, qrMm, style, code, cut, vehicleName }: { svg: string; qrMm: number; style: Style; code: string; cut: boolean; vehicleName: string }) {
  const { w, h, pad } = cellSize(qrMm, style);
  const big = qrMm * 0.075;
  return (
    <div
      className="flex flex-col items-center overflow-hidden bg-white text-center text-slate-900"
      style={{ width: `${w}mm`, height: `${h}mm`, padding: `${pad}mm`, outline: cut ? "0.2mm dashed #94a3b8" : undefined }}
      aria-label={`${vehicleName} QR`}
    >
      {style === "full" && (
        <div className="w-full font-extrabold text-white" style={{ background: "#2552e8", fontSize: `${big}mm`, lineHeight: 1.5, marginBottom: `${pad}mm` }}>
          B-LOCK
        </div>
      )}
      <div style={{ width: `${qrMm}mm`, height: `${qrMm}mm` }} dangerouslySetInnerHTML={{ __html: svg }} />
      {style === "code" && (
        <p className="font-mono font-bold tracking-wider" style={{ fontSize: `${Math.max(2.6, qrMm * 0.09)}mm`, lineHeight: 1.4 }}>
          {code}
        </p>
      )}
      {style === "full" && (
        <div style={{ marginTop: `${pad * 0.6}mm` }}>
          <p className="font-bold" style={{ fontSize: `${qrMm * 0.062}mm`, lineHeight: 1.35 }}>
            발견하셨다면 QR을 찍어 주세요
          </p>
          <p className="text-slate-500" style={{ fontSize: `${qrMm * 0.05}mm`, lineHeight: 1.35 }}>
            주인에게만 알려져요 · 조회 번호 <b className="font-mono text-slate-800">{code}</b>
          </p>
        </div>
      )}
    </div>
  );
}
