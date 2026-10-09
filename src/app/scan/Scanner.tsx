"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { Camera, CameraOff, Search } from "lucide-react";
import { Button, Card, Input } from "@/components/ui";
import { appLinkPath, extractLookupCode, extractToken } from "@/lib/qr";

type CamState = "idle" | "starting" | "running" | "denied" | "unsupported";

/**
 * 브라우저 카메라로 QR 읽기. 카메라를 쓸 수 없으면 QR 아래 조회 번호(8자리)나 QR 주소를 직접 넣을 수 있어요.
 * onToken을 주면 이동하지 않고 읽은 코드만 넘겨요 (양도 화면의 숨은 스티커 확인 등).
 */
export function Scanner({ onToken, hideManual = false }: { onToken?: (token: string) => void; hideManual?: boolean } = {}) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const [cam, setCam] = useState<CamState>("idle");
  const [hint, setHint] = useState("");
  const [manual, setManual] = useState("");
  const [manualError, setManualError] = useState("");

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => stop, [stop]);

  const go = useCallback(
    (text: string) => {
      // 안심거래 인증(/v/…)·소유권 양도(/t/…)·소유 증명서(/c/…)·도난 경보(/alerts/…) QR은 그 화면으로
      const link = appLinkPath(text);
      if (link && !onToken) {
        stop();
        router.push(link);
        return true;
      }
      const token = extractToken(text);
      if (!token) {
        setHint("이 서비스의 QR이 아니에요. 이동수단에 붙은 QR을 비춰 주세요.");
        return false;
      }
      stop();
      if (onToken) {
        setCam("idle");
        onToken(token);
      } else {
        router.push(`/scan/${token}`);
      }
      return true;
    },
    [router, stop, onToken],
  );

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCam("unsupported");
      return;
    }
    setCam("starting");
    setHint("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      streamRef.current = stream;
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      setCam("running");
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      let last = 0;
      const tick = (t: number) => {
        rafRef.current = requestAnimationFrame(tick);
        if (t - last < 150 || video.readyState < 2) return; // 1초에 6~7번만 읽어 배터리 절약
        last = t;
        const w = Math.min(640, video.videoWidth);
        const h = Math.round((video.videoHeight / video.videoWidth) * w);
        canvas.width = w;
        canvas.height = h;
        ctx.drawImage(video, 0, 0, w, h);
        const code = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "dontInvert" });
        if (code?.data) go(code.data);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch (e) {
      console.error(e);
      stop();
      setCam((e as Error).name === "NotAllowedError" ? "denied" : "unsupported");
    }
  }

  function onManual(e: React.FormEvent) {
    e.preventDefault();
    setManualError("");
    // 스티커·QR 카드에는 주소 대신 조회 번호(8자리)만 인쇄돼 있어요 → 도난 조회 화면에서 이동수단을 찾아요
    const code = onToken ? null : extractLookupCode(manual);
    if (code) {
      stop();
      router.push(`/check?q=${encodeURIComponent(code)}`);
      return;
    }
    const link = onToken ? null : appLinkPath(manual);
    if (!link && !extractToken(manual)) {
      setManualError("QR 바로 아래에 적힌 조회 번호 8자리를 그대로 넣어 주세요. (예: aB3x Kp9Q)");
      return;
    }
    go(manual);
  }

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden p-0">
        <div className="relative aspect-square bg-slate-900">
          <video ref={videoRef} playsInline muted className={cam === "running" ? "h-full w-full object-cover" : "hidden"} />
          {cam === "running" && (
            <div className="pointer-events-none absolute inset-[18%] rounded-3xl border-4 border-white/90 shadow-[0_0_0_9999px_rgba(15,23,42,0.45)]" />
          )}
          {cam !== "running" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-white">
              {cam === "denied" || cam === "unsupported" ? (
                <>
                  <CameraOff aria-hidden className="h-10 w-10 text-rose-300" />
                  <p className="font-semibold">{cam === "denied" ? "카메라 권한이 필요해요." : "이 브라우저에서는 카메라를 쓸 수 없어요."}</p>
                  <p className="text-sm text-slate-300">
                    {hideManual
                      ? cam === "denied"
                        ? "브라우저 설정에서 카메라를 허용해 주세요."
                        : "크롬이나 사파리에서 다시 열어 주세요."
                      : cam === "denied"
                        ? "브라우저 설정에서 카메라를 허용하거나, 아래 칸에 QR 바로 밑에 적힌 조회 번호를 넣어 주세요."
                        : "아래 칸에 QR 바로 밑에 적힌 조회 번호를 넣어 주세요."}
                  </p>
                </>
              ) : (
                <>
                  <Camera aria-hidden className="h-10 w-10" />
                  <p className="text-sm text-slate-300">버튼을 누르면 카메라 권한을 요청해요.</p>
                </>
              )}
            </div>
          )}
        </div>
        <div className="p-4">
          {cam === "running" ? (
            <Button variant="secondary" full onClick={() => { stop(); setCam("idle"); }}>
              스캔 멈추기
            </Button>
          ) : (
            <Button full size="lg" loading={cam === "starting"} loadingText="카메라 켜는 중..." icon={<Camera aria-hidden className="h-5 w-5" />} onClick={start}>
              {cam === "denied" ? "다시 시도" : "카메라로 스캔하기"}
            </Button>
          )}
          {hint && <p className="mt-3 text-center text-sm text-orange-700">{hint}</p>}
        </div>
      </Card>

      {!hideManual && (
      <Card>
        <form onSubmit={onManual} className="space-y-3" noValidate>
          <Input
            label="QR 아래 조회 번호(8자리) 또는 QR 주소"
            placeholder="예) aB3x Kp9Q"
            hint="스티커나 QR 카드의 QR 바로 아래에 적힌 영문·숫자예요."
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            error={manualError}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          <Button type="submit" variant="secondary" full icon={<Search aria-hidden className="h-4 w-4" />} disabled={!manual.trim()}>
            찾아보기
          </Button>
        </form>
      </Card>
      )}
    </div>
  );
}
