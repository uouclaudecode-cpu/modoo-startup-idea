"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { ArrowRightLeft, CircleCheck, Clock, Copy, Handshake, Link2, Lock, Package, ScanLine, Share2, Tag } from "lucide-react";
import { Button, ButtonLink, Card, Input, useToast } from "@/components/ui";
import { copyText } from "@/lib/clipboard";
import { formatDateTime, friendlyError } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { transferUrl } from "@/lib/trade";

type Stage = "form" | "waiting" | "done" | "expired";
/** 구매자가 실물을 확인하는 방법: 숨은 스티커 / 차대번호 / 눈으로만 */
type Check = "sticker" | "serial" | "none";
/** qr: 직접 만나서 (대면, 10분) / link: 링크로 보내기 (비대면, 7일) */
type Mode = "qr" | "link";

// 넘기면 무엇이 어떻게 되는지 (accept_transfer 와 같게 유지)
const FATE: [string, string][] = [
  ["함께 넘어가요", "정비 기록 · QR 스티커 · 차대번호 등록"],
  ["새로 바뀌어요", "앱 QR (내가 출력해 붙여 둔 예전 앱 QR은 더 이상 안 돼요)"],
  ["나에게 남아요", "라이딩 기록"],
  ["지워져요", "발견 제보·대화 · 구매 정보 · 등록 사진 · 소유 증명 자료 (발급한 증명서도 무효) · 스티커 위치 메모"],
];

const CHECK_STEP: Record<Check, string> = {
  sticker: "구매자가 숨은 스티커를 찍거나 QR 아래 조회 번호를 넣어 같은 기기인지 확인해요. 스티커 위치를 알려 주세요.",
  serial: "구매자가 프레임에 새겨진 차대번호를 직접 보고 적어서 같은 기기인지 확인해요.",
  none: "구매자가 사진과 실물이 같은지 눈으로 확인해요.",
};

/** 링크 방식은 화면을 떠나도 다시 복사할 수 있게 이 기기에만 잠깐 보관해요 (서버에는 해시만 있어요) */
const linkKey = (vehicleId: string) => `b-lock:transfer-link:${vehicleId}`;
type SavedLink = { transferId: string; token: string; expiresAt: string };

function loadSaved(vehicleId: string): SavedLink | null {
  try {
    const s = JSON.parse(localStorage.getItem(linkKey(vehicleId)) ?? "null") as SavedLink | null;
    return s && new Date(s.expiresAt).getTime() > Date.now() ? s : null;
  } catch {
    return null;
  }
}
function saveLink(vehicleId: string, v: SavedLink | null) {
  try {
    if (v) localStorage.setItem(linkKey(vehicleId), JSON.stringify(v));
    else localStorage.removeItem(linkKey(vehicleId));
  } catch {
    // 저장소를 못 쓰면 새 링크를 만들면 돼요
  }
}

export function TransferStart({
  vehicleId,
  vehicleName,
  searching,
  check,
  stickerCount,
}: {
  vehicleId: string;
  vehicleName: string;
  searching: boolean;
  check: Check;
  stickerCount: number;
}) {
  const toast = useToast();
  const [mode, setMode] = useState<Mode>("qr");
  const [stage, setStage] = useState<Stage>("form");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [transferId, setTransferId] = useState("");
  const [token, setToken] = useState("");
  const [qr, setQr] = useState("");
  const [expiresAt, setExpiresAt] = useState(0);
  const [left, setLeft] = useState(0);
  const [cancelling, setCancelling] = useState(false);
  const stageRef = useRef<Stage>("form");
  stageRef.current = stage;

  // 보내 둔 링크가 아직 살아 있으면 그 화면으로 (택배 거래 중 다시 들어온 경우)
  useEffect(() => {
    const saved = loadSaved(vehicleId);
    if (!saved) return;
    createClient()
      .from("ownership_transfers")
      .select("status")
      .eq("id", saved.transferId)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.status !== "pending") return saveLink(vehicleId, null);
        setMode("link");
        setTransferId(saved.transferId);
        setToken(saved.token);
        setExpiresAt(new Date(saved.expiresAt).getTime());
        setStage("waiting");
      });
  }, [vehicleId]);

  // 남은 시간 + 구매자가 받았는지 확인 (QR은 3초, 링크는 10초마다)
  useEffect(() => {
    if (stage !== "waiting" || !transferId) return;
    const supabase = createClient();
    const tickTimer = setInterval(() => {
      const s = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
      setLeft(s);
      if (s === 0) {
        // 마지막 몇 초에 받았을 수 있어서 한 번 더 확인
        supabase
          .from("ownership_transfers")
          .select("status")
          .eq("id", transferId)
          .maybeSingle()
          .then(({ data }) => setStage(data?.status === "completed" ? "done" : "expired"));
      }
    }, 1000);
    const pollTimer = setInterval(
      async () => {
        if (document.visibilityState !== "visible") return;
        const { data, error: err } = await supabase.from("ownership_transfers").select("status").eq("id", transferId).maybeSingle();
        if (err) return console.error(err);
        if (stageRef.current !== "waiting") return;
        if (data?.status === "completed") {
          saveLink(vehicleId, null);
          setStage("done");
        } else if (data && data.status !== "pending") {
          saveLink(vehicleId, null);
          setStage("expired");
        }
      },
      mode === "link" ? 10000 : 3000,
    );
    return () => {
      clearInterval(tickTimer);
      clearInterval(pollTimer);
    };
  }, [stage, transferId, expiresAt, mode, vehicleId]);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!password) return setError("비밀번호를 입력해 주세요.");
    setLoading(true);
    try {
      const res = await fetch("/api/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vehicleId, password, mode }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; transferId?: string; token?: string; expiresAt?: string };
      if (!res.ok || !json.token || !json.transferId || !json.expiresAt) {
        setError(json.error ?? "양도를 시작하지 못했어요. 잠시 후 다시 시도해 주세요.");
        return;
      }
      setQr(mode === "qr" ? await QRCode.toDataURL(transferUrl(json.token), { width: 640, margin: 1, errorCorrectionLevel: "M" }) : "");
      setTransferId(json.transferId);
      setToken(json.token);
      const exp = new Date(json.expiresAt).getTime();
      setExpiresAt(exp);
      setLeft(Math.max(0, Math.round((exp - Date.now()) / 1000)));
      if (mode === "link") saveLink(vehicleId, { transferId: json.transferId, token: json.token, expiresAt: json.expiresAt });
      setPassword("");
      setStage("waiting");
    } catch (err) {
      console.error(err);
      setError(friendlyError(err, "양도를 시작하지 못했어요. 잠시 후 다시 시도해 주세요."));
    } finally {
      setLoading(false);
    }
  }

  async function cancel() {
    setCancelling(true);
    const { error: err } = await createClient().rpc("cancel_transfer", { p_transfer: transferId });
    setCancelling(false);
    if (err) {
      console.error(err);
      return toast.error(friendlyError(err, "취소하지 못했어요."));
    }
    saveLink(vehicleId, null);
    toast.success(mode === "link" ? "링크를 취소했어요. 보낸 링크로는 이제 받을 수 없어요." : "소유권 넘기기를 취소했어요.");
    setStage("form");
    setQr("");
    setToken("");
  }

  const link = token ? transferUrl(token) : "";
  const shareText = `[B-LOCK] ${vehicleName} 소유권 받기 링크예요. 로그인한 뒤 열고, 자전거에 붙은 숨은 스티커를 찍으면 내 이동수단이 돼요.`;

  async function copyLink() {
    const ok = await copyText(`${shareText}\n${link}`);
    if (ok) toast.success("링크를 복사했어요. 구매자에게 채팅으로 보내 주세요.");
    else toast.error("복사하지 못했어요. 주소를 길게 눌러 복사해 주세요.");
  }

  async function shareLink() {
    try {
      if (navigator.share) {
        await navigator.share({ title: "B-LOCK 소유권 받기", text: shareText, url: link });
        return;
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
    }
    copyLink();
  }

  if (searching) {
    return <Card className="text-[15px] text-rose-700">수색 중인 이동수단은 넘길 수 없어요. 찾은 뒤 상태를 바꿔 주세요.</Card>;
  }

  if (stage === "done") {
    return (
      <Card className="flex flex-col items-center gap-3 py-10 text-center">
        <CircleCheck aria-hidden className="h-12 w-12 text-emerald-600" />
        <p className="text-xl font-extrabold">소유권을 넘겼어요</p>
        <p className="text-[15px] leading-relaxed text-ink-muted">
          {vehicleName}은(는) 이제 구매자의 이동수단이에요. 정비 기록과 스티커는 함께 넘어갔고, 발견 제보·구매 정보·사진은 지웠어요. 라이딩 기록은 내 기록에 남아 있어요.
        </p>
        <ButtonLink href="/dashboard" full size="lg" className="mt-2">
          MY로 가기
        </ButtonLink>
      </Card>
    );
  }

  if (stage === "waiting" || stage === "expired") {
    const mm = String(Math.floor(left / 60)).padStart(2, "0");
    const ss = String(left % 60).padStart(2, "0");
    if (stage === "expired") {
      return (
        <Card className="space-y-4 text-center">
          <Clock aria-hidden className="mx-auto h-10 w-10 text-ink-muted" />
          <p className="font-bold">{mode === "link" ? "링크 시간이 지났거나 취소됐어요" : "QR 시간이 지났거나 취소됐어요"}</p>
          <Button full onClick={() => setStage("form")}>
            다시 만들기
          </Button>
        </Card>
      );
    }
    return (
      <Card className="space-y-4 text-center">
        {mode === "qr" ? (
          <>
            <p className="font-bold">구매자에게 이 QR을 보여 주세요</p>
            {qr && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt="소유권 넘기기 QR" className="mx-auto w-full max-w-[280px] rounded-2xl ring-1 ring-line" />
            )}
            <p className="flex items-center justify-center gap-1.5 text-lg font-bold tabular-nums text-brand-700">
              <Clock aria-hidden className="h-5 w-5" />
              {mm}:{ss}
            </p>
            {/* 구매자 카메라가 안 되면 같은 링크를 채팅으로 */}
            <Button variant="secondary" full icon={<Copy aria-hidden className="h-4 w-4" />} onClick={copyLink}>
              링크 복사해서 보내기
            </Button>
          </>
        ) : (
          <>
            <p className="font-bold">구매자에게 이 링크를 보내 주세요</p>
            <p className="break-all rounded-xl bg-slate-50 p-3 text-left text-[13px] text-ink-soft">{link}</p>
            <div className="grid grid-cols-2 gap-2">
              <Button icon={<Copy aria-hidden className="h-4 w-4" />} onClick={copyLink}>
                링크 복사
              </Button>
              <Button variant="secondary" icon={<Share2 aria-hidden className="h-4 w-4" />} onClick={shareLink}>
                공유하기
              </Button>
            </div>
            <p className="text-[13px] text-ink-muted">{formatDateTime(new Date(expiresAt).toISOString())}까지 쓸 수 있어요</p>
          </>
        )}
        <ol className="space-y-2 rounded-xl bg-slate-50 p-4 text-left text-[14px] leading-relaxed text-ink-soft">
          <li className="flex gap-2">
            {mode === "qr" ? (
              <ScanLine aria-hidden className="mt-0.5 h-4 w-4 flex-none text-brand-600" />
            ) : (
              <Package aria-hidden className="mt-0.5 h-4 w-4 flex-none text-brand-600" />
            )}
            {mode === "qr"
              ? "구매자가 B-LOCK에 로그인하고 이 QR을 찍어요. (휴대폰 카메라나 앱의 QR 스캔)"
              : "구매자가 물건을 받은 뒤, B-LOCK에 로그인하고 이 링크를 열어요."}
          </li>
          <li className="flex gap-2">
            <Tag aria-hidden className="mt-0.5 h-4 w-4 flex-none text-brand-600" />
            {CHECK_STEP[check]}
          </li>
          <li className="flex gap-2">
            <ArrowRightLeft aria-hidden className="mt-0.5 h-4 w-4 flex-none text-brand-600" />
            {mode === "qr" ? "받기를 누르면 바로 넘어가고, 이 화면이 ‘소유권을 넘겼어요’로 바뀌어요." : "받기를 누르면 넘어가고, 나에게 알림이 와요. 이 화면을 닫아도 괜찮아요."}
          </li>
        </ol>
        <Button variant="ghost" full loading={cancelling} loadingText="취소 중..." onClick={cancel}>
          {mode === "link" ? "링크 취소" : "넘기기 취소"}
        </Button>
      </Card>
    );
  }

  return (
    <Card>
      <form onSubmit={start} className="space-y-4" noValidate>
        <div>
          <p className="mb-2 text-sm font-semibold">어떻게 넘길까요?</p>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["qr", "직접 만나서", "대면 거래 · QR 10분", Handshake],
                ["link", "링크로 보내기", "비대면 거래 · 7일 유효", Link2],
              ] as const
            ).map(([value, title, desc, Icon]) => (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value)}
                aria-pressed={mode === value}
                className={`flex flex-col items-center gap-1 rounded-xl p-3 text-center ring-1 ring-inset transition-colors ${mode === value ? "bg-brand-50 ring-brand-500" : "bg-white ring-line hover:bg-slate-50"}`}
              >
                <Icon aria-hidden className={`h-5 w-5 ${mode === value ? "text-brand-600" : "text-ink-muted"}`} />
                <span className="text-[15px] font-bold">{title}</span>
                <span className="text-[12px] text-ink-muted">{desc}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2 rounded-xl bg-amber-50 p-4 text-[14px] leading-relaxed text-amber-900">
          <p className="font-bold">넘기기 전에 확인해 주세요</p>
          <ul className="list-disc space-y-1 pl-5">
            {mode === "qr" ? (
              <>
                <li>돈을 받은 뒤에 QR을 보여 주세요. 넘긴 뒤에는 되돌릴 수 없어요.</li>
                <li>QR은 10분 동안만 쓸 수 있어요.</li>
              </>
            ) : (
              <>
                <li>돈을 받은 뒤에 링크를 보내 주세요. 링크를 받은 사람은 물건을 받은 뒤 숨은 스티커(또는 차대번호)를 확인해야 받을 수 있어요.</li>
                <li>링크는 7일 동안 쓸 수 있고, 그 전에는 언제든 취소할 수 있어요.</li>
              </>
            )}
            <li>구매자가 받는 순간 나는 이 이동수단을 더 이상 볼 수 없어요.</li>
          </ul>
        </div>

        <div className="space-y-2 rounded-xl bg-slate-50 p-4">
          <p className="font-bold">넘기면 이렇게 돼요</p>
          <dl className="grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-2 text-[14px] leading-relaxed">
            {FATE.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="font-semibold text-ink-muted">{k}</dt>
                <dd className="text-ink-soft">{v}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="flex items-start gap-2 rounded-xl bg-slate-50 p-4 text-[14px] leading-relaxed text-ink-soft">
          <Tag aria-hidden className="mt-0.5 h-4 w-4 flex-none text-brand-600" />
          {check === "sticker" ? (
            <p>
              구매자가 {stickerCount > 1 ? `연결된 스티커 ${stickerCount}장 중 하나를` : "숨은 스티커를"} 찍어서 확인해요. 떨어졌거나 잃어버린 스티커가 있다면 먼저{" "}
              <Link href={`/vehicles/${vehicleId}`} className="font-semibold text-brand-700 underline">
                이동수단 화면
              </Link>
              에서 그 스티커의 연결을 끊어 주세요. 자전거에 붙은 스티커는 없는데 연결만 남아 있으면 구매자가 받을 수 없어요.
            </p>
          ) : check === "serial" ? (
            <p>스티커가 없어서 구매자가 프레임에 새겨진 차대번호를 직접 보고 확인해요.</p>
          ) : (
            <p>스티커도 차대번호도 없어서 구매자가 사진과 실물을 눈으로만 확인해요. 넘기기 전에 이동수단 화면에서 차대번호를 등록하면 더 안전해요.</p>
          )}
        </div>
        <Input
          label="비밀번호 다시 입력"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={error}
        />
        <Button type="submit" full size="lg" loading={loading} loadingText="확인 중..." icon={<Lock aria-hidden className="h-5 w-5" />}>
          {mode === "qr" ? "넘기기 QR 만들기" : "넘기기 링크 만들기"}
        </Button>
      </form>
    </Card>
  );
}
