"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { ArrowRightLeft, CircleCheck, Clock, Lock, ScanLine, Tag } from "lucide-react";
import { Button, ButtonLink, Card, Input, useToast } from "@/components/ui";
import { friendlyError } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { transferUrl } from "@/lib/trade";

type Stage = "form" | "waiting" | "done" | "expired";

export function TransferStart({ vehicleId, vehicleName, searching }: { vehicleId: string; vehicleName: string; searching: boolean }) {
  const toast = useToast();
  const [stage, setStage] = useState<Stage>("form");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [transferId, setTransferId] = useState("");
  const [qr, setQr] = useState("");
  const [expiresAt, setExpiresAt] = useState(0);
  const [left, setLeft] = useState(0);
  const [cancelling, setCancelling] = useState(false);
  const stageRef = useRef<Stage>("form");
  stageRef.current = stage;

  // 남은 시간 + 구매자가 받았는지 3초마다 확인
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
    const pollTimer = setInterval(async () => {
      const { data, error: err } = await supabase.from("ownership_transfers").select("status").eq("id", transferId).maybeSingle();
      if (err) return console.error(err);
      if (stageRef.current !== "waiting") return;
      if (data?.status === "completed") setStage("done");
      else if (data && data.status !== "pending") setStage("expired");
    }, 3000);
    return () => {
      clearInterval(tickTimer);
      clearInterval(pollTimer);
    };
  }, [stage, transferId, expiresAt]);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!password) return setError("비밀번호를 입력해 주세요.");
    setLoading(true);
    try {
      const res = await fetch("/api/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vehicleId, password }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; transferId?: string; token?: string; expiresAt?: string };
      if (!res.ok || !json.token || !json.transferId || !json.expiresAt) {
        setError(json.error ?? "양도를 시작하지 못했어요. 잠시 후 다시 시도해 주세요.");
        return;
      }
      const url = await QRCode.toDataURL(transferUrl(json.token), { width: 640, margin: 1, errorCorrectionLevel: "M" });
      setQr(url);
      setTransferId(json.transferId);
      const exp = new Date(json.expiresAt).getTime();
      setExpiresAt(exp);
      setLeft(Math.max(0, Math.round((exp - Date.now()) / 1000)));
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
    toast.success("양도를 취소했어요.");
    setStage("form");
    setQr("");
  }

  if (searching) {
    return <Card className="text-[15px] text-rose-700">수색 중인 이동수단은 넘길 수 없어요. 찾은 뒤 상태를 바꿔 주세요.</Card>;
  }

  if (stage === "done") {
    return (
      <Card className="flex flex-col items-center gap-3 py-10 text-center">
        <CircleCheck aria-hidden className="h-12 w-12 text-emerald-600" />
        <p className="text-xl font-extrabold">양도가 끝났어요</p>
        <p className="text-[15px] leading-relaxed text-ink-muted">
          {vehicleName}은(는) 이제 구매자의 이동수단이에요. 이 기기의 정보·제보·QR 권한은 모두 넘어갔어요.
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
    return (
      <Card className="space-y-4 text-center">
        {stage === "waiting" ? (
          <>
            <p className="font-bold">구매자에게 이 QR을 보여 주세요</p>
            {qr && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt="소유권 양도 QR" className="mx-auto w-full max-w-[280px] rounded-2xl ring-1 ring-line" />
            )}
            <p className="flex items-center justify-center gap-1.5 text-lg font-bold tabular-nums text-brand-700">
              <Clock aria-hidden className="h-5 w-5" />
              {mm}:{ss}
            </p>
            <ol className="space-y-2 rounded-xl bg-slate-50 p-4 text-left text-[14px] leading-relaxed text-ink-soft">
              <li className="flex gap-2">
                <ScanLine aria-hidden className="mt-0.5 h-4 w-4 flex-none text-brand-600" />
                구매자가 B-LOCK에 로그인하고 이 QR을 찍어요. (휴대폰 카메라나 앱의 QR 스캔)
              </li>
              <li className="flex gap-2">
                <Tag aria-hidden className="mt-0.5 h-4 w-4 flex-none text-brand-600" />
                구매자가 자전거의 숨은 스티커를 찍어 같은 기기인지 확인해요.
              </li>
              <li className="flex gap-2">
                <ArrowRightLeft aria-hidden className="mt-0.5 h-4 w-4 flex-none text-brand-600" />
                받기를 누르면 바로 넘어가고, 이 화면이 &lsquo;양도 완료&rsquo;로 바뀌어요.
              </li>
            </ol>
            <Button variant="ghost" full loading={cancelling} loadingText="취소 중..." onClick={cancel}>
              양도 취소
            </Button>
          </>
        ) : (
          <>
            <Clock aria-hidden className="mx-auto h-10 w-10 text-ink-muted" />
            <p className="font-bold">QR 시간이 지났거나 취소됐어요</p>
            <Button full onClick={() => setStage("form")}>
              다시 만들기
            </Button>
          </>
        )}
      </Card>
    );
  }

  return (
    <Card>
      <form onSubmit={start} className="space-y-4" noValidate>
        <div className="space-y-2 rounded-xl bg-amber-50 p-4 text-[14px] leading-relaxed text-amber-900">
          <p className="font-bold">넘기기 전에 확인해 주세요</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>돈을 받은 뒤에 QR을 보여 주세요. 넘긴 뒤에는 되돌릴 수 없어요.</li>
            <li>정비 기록·스티커는 함께 넘어가요. 라이딩 기록과 발견 제보는 나에게 남거나 지워져요.</li>
            <li>QR은 10분 동안만 쓸 수 있어요.</li>
          </ul>
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
          양도 QR 만들기
        </Button>
      </form>
    </Card>
  );
}
