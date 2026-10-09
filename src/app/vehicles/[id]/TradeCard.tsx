"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { ArrowRightLeft, Copy, Hash, Link2, ShieldCheck } from "lucide-react";
import { Button, ButtonLink, Card, Input, Modal, useToast } from "@/components/ui";
import { copyText } from "@/lib/clipboard";
import { formatDateTime, friendlyError } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { verifyUrl } from "@/lib/trade";

type Link = { id: string; token: string; check_code: string; expires_at: string; view_count: number };

const TTL = [
  { hours: 24, label: "1일" },
  { hours: 72, label: "3일" },
  { hours: 168, label: "7일" },
];

/** 중고거래: 차대번호 · 안심거래 인증 링크 · 직거래 소유권 넘기기 */
export function TradeCard({ vehicleId, serialLast4, searching }: { vehicleId: string; serialLast4: string | null; searching: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [serialOpen, setSerialOpen] = useState(false);
  const [serial, setSerial] = useState("");
  const [serialError, setSerialError] = useState("");
  const [savingSerial, setSavingSerial] = useState(false);

  const [linkOpen, setLinkOpen] = useState(false);
  const [hours, setHours] = useState(72);
  const [creating, setCreating] = useState(false);
  const [links, setLinks] = useState<Link[] | null>(null);
  const [current, setCurrent] = useState<Link | null>(null);
  const [qr, setQr] = useState("");

  async function loadLinks() {
    const { data, error } = await createClient()
      .from("trade_links")
      .select("id, token, check_code, expires_at, view_count")
      .eq("vehicle_id", vehicleId)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });
    if (error) {
      console.error(error);
      toast.error("링크 목록을 불러오지 못했어요.");
      setLinks([]);
      return;
    }
    setLinks(data as Link[]);
  }

  useEffect(() => {
    if (!current) return setQr("");
    QRCode.toDataURL(verifyUrl(current.token), { width: 480, margin: 1, errorCorrectionLevel: "M" })
      .then(setQr)
      .catch((e) => console.error(e));
  }, [current]);

  function openLinks() {
    setLinkOpen(true);
    setCurrent(null);
    setLinks(null);
    loadLinks();
  }

  async function create() {
    setCreating(true);
    const { data, error } = await createClient().rpc("create_trade_link", { p_vehicle: vehicleId, p_hours: hours });
    setCreating(false);
    if (error) {
      console.error(error);
      return toast.error(friendlyError(error, "링크를 만들지 못했어요."));
    }
    const d = data as { token: string; check_code: string; expires_at: string };
    setCurrent({ id: "", token: d.token, check_code: d.check_code, expires_at: d.expires_at, view_count: 0 });
    loadLinks();
  }

  async function revoke(l: Link) {
    const { error } = await createClient().rpc("revoke_trade_link", { p_link: l.id });
    if (error) {
      console.error(error);
      return toast.error(friendlyError(error, "링크를 끄지 못했어요."));
    }
    toast.success("링크를 껐어요. 이제 그 주소로는 인증 화면이 보이지 않아요.");
    if (current?.token === l.token) setCurrent(null);
    loadLinks();
  }

  async function copy(l: Link) {
    const ok = await copyText(`[B-LOCK 안심거래 인증] ${verifyUrl(l.token)}\n확인 코드: ${l.check_code}`);
    if (ok) toast.success("복사했어요. 중고거래 글에 붙여넣어 주세요.");
    else toast.error("복사하지 못했어요. 주소를 길게 눌러 복사해 주세요.");
  }

  async function saveSerial(e: React.FormEvent) {
    e.preventDefault();
    setSerialError("");
    setSavingSerial(true);
    const { error } = await createClient().rpc("set_vehicle_serial", { p_vehicle: vehicleId, p_serial: serial });
    setSavingSerial(false);
    if (error) {
      console.error(error);
      return setSerialError(friendlyError(error, "저장하지 못했어요."));
    }
    toast.success(serial.trim() ? "차대번호를 등록했어요." : "차대번호를 지웠어요.");
    setSerialOpen(false);
    setSerial("");
    router.refresh();
  }

  // 지금 보고 있는 링크의 id를 목록에서 찾아 끄기 버튼에 써요
  const currentWithId = current && links ? (links.find((l) => l.token === current.token) ?? current) : current;

  return (
    <Card className="space-y-3">
      <div>
        <p className="flex items-center gap-2 font-bold">
          <ShieldCheck aria-hidden className="h-4 w-4 text-brand-600" />
          중고거래
        </p>
        <p className="mt-0.5 text-[13px] leading-relaxed text-ink-muted">
          당근·번개장터 글에 인증 링크를 붙이고, 직거래 현장에서 QR 한 번으로 소유권을 넘겨요.
        </p>
      </div>

      <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
        <Hash aria-hidden className="h-4 w-4 flex-none text-ink-muted" />
        <p className="min-w-0 flex-1 text-[14px]">
          차대번호(프레임 번호) <b className="text-ink">{serialLast4 ? `••••${serialLast4}` : "등록 안 함"}</b>
          <span className="block text-[12px] text-ink-muted">프레임에 새겨진 번호예요. 같은 번호는 다른 계정에 등록할 수 없어요.</span>
        </p>
        <Button variant="secondary" className="h-9 flex-none px-3 text-sm" onClick={() => setSerialOpen(true)}>
          {serialLast4 ? "바꾸기" : "등록"}
        </Button>
      </div>

      {searching && <p className="rounded-xl bg-rose-50 p-3 text-[13px] text-rose-700">수색 중인 이동수단은 거래 기능을 쓸 수 없어요.</p>}

      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" disabled={searching} icon={<Link2 aria-hidden className="h-4 w-4" />} onClick={openLinks}>
          인증 링크
        </Button>
        {searching ? (
          <Button variant="secondary" disabled icon={<ArrowRightLeft aria-hidden className="h-4 w-4" />}>
            소유권 넘기기
          </Button>
        ) : (
          <ButtonLink href={`/vehicles/${vehicleId}/transfer`} variant="secondary" icon={<ArrowRightLeft aria-hidden className="h-4 w-4" />}>
            소유권 넘기기
          </ButtonLink>
        )}
      </div>

      <Modal
        open={serialOpen}
        onClose={() => !savingSerial && setSerialOpen(false)}
        title="차대번호 등록"
        footer={
          <>
            <Button variant="ghost" onClick={() => setSerialOpen(false)} disabled={savingSerial}>
              취소
            </Button>
            <Button type="submit" form="serial-form" loading={savingSerial} loadingText="저장 중...">
              저장
            </Button>
          </>
        }
      >
        <form id="serial-form" onSubmit={saveSerial} className="space-y-3">
          <p className="text-[14px] leading-relaxed text-ink-soft">
            흔히 &lsquo;프레임 번호&rsquo;·&lsquo;시리얼 번호&rsquo;라고 불러요. 자전거는 자전거를 뒤집으면 페달 사이 프레임 아랫면(바텀 브래킷)에, 전동킥보드는 발판 아래나 핸들 기둥에 새겨져 있어요. 없는 자전거도 있는데, 그럴 땐 숨은 QR 스티커만으로도 충분해요. 번호 전체는 암호처럼 바꿔 저장하고, 화면에는 끝 4자리만 보여요. 비워서 저장하면 지워져요.
          </p>
          <Input label="차대번호 (프레임 번호)" placeholder="예: WTU123A4567B" value={serial} onChange={(e) => setSerial(e.target.value)} error={serialError} autoComplete="off" autoCapitalize="characters" />
        </form>
      </Modal>

      <Modal open={linkOpen} onClose={() => !creating && setLinkOpen(false)} title="안심거래 인증 링크">
        <div className="space-y-4">
          {currentWithId ? (
            <div className="space-y-3">
              {qr && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qr} alt="안심거래 인증 QR" className="mx-auto w-48 rounded-xl ring-1 ring-line" />
              )}
              <p className="break-all rounded-xl bg-slate-50 p-3 text-[13px] text-ink-soft">{verifyUrl(currentWithId.token)}</p>
              <p className="text-center text-[15px]">
                확인 코드 <b className="text-xl tracking-[0.2em] text-brand-700">{currentWithId.check_code}</b>
              </p>
              <p className="text-center text-[12px] text-ink-muted">구매자가 보는 인증 화면에 같은 코드가 떠요. 캡처로 속이는 걸 막아요.</p>
              <div className="grid grid-cols-2 gap-2">
                <Button icon={<Copy aria-hidden className="h-4 w-4" />} onClick={() => copy(currentWithId)}>
                  복사
                </Button>
                <Button variant="secondary" onClick={() => setCurrent(null)}>
                  목록으로
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div>
                <p className="mb-2 text-sm font-semibold">유효기간</p>
                <div className="grid grid-cols-3 gap-2">
                  {TTL.map((t) => (
                    <button
                      key={t.hours}
                      type="button"
                      onClick={() => setHours(t.hours)}
                      aria-pressed={hours === t.hours}
                      className={`h-11 rounded-xl text-[15px] font-semibold ring-1 ring-inset transition-colors ${hours === t.hours ? "bg-brand-600 text-white ring-brand-600" : "bg-white text-ink ring-line hover:bg-slate-50"}`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <Button full size="lg" loading={creating} loadingText="만드는 중..." icon={<Link2 aria-hidden className="h-5 w-5" />} onClick={create}>
                새 인증 링크 만들기
              </Button>
              <div>
                <p className="mb-2 text-sm font-semibold">사용 중인 링크</p>
                {links === null ? (
                  <p className="text-sm text-ink-muted">불러오는 중...</p>
                ) : links.length === 0 ? (
                  <p className="text-sm text-ink-muted">사용 중인 링크가 없어요.</p>
                ) : (
                  <ul className="space-y-2">
                    {links.map((l) => (
                      <li key={l.id} className="flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-[13px]">
                        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setCurrent(l)}>
                          <span className="block font-semibold text-ink">코드 {l.check_code}</span>
                          <span className="text-ink-muted">
                            {formatDateTime(l.expires_at)}까지 · 조회 {l.view_count}회
                          </span>
                        </button>
                        <Button variant="ghost" className="h-9 flex-none px-3 text-sm text-rose-600" onClick={() => revoke(l)}>
                          끄기
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      </Modal>
    </Card>
  );
}
