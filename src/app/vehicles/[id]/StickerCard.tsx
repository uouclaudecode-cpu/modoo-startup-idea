"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { EyeOff, QrCode, ScanLine, Tag, Unlink, Copy } from "lucide-react";
import { Button, ButtonLink, Card, Modal, useToast } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatDate, friendlyError } from "@/lib/format";
import { copyText } from "@/lib/clipboard";
import { lookupCode } from "@/lib/qr";
import { createClient } from "@/lib/supabase/client";

/** 화면에 넘기는 스티커 정보: 조회 번호(코드 앞 8자리)만. 전체 코드는 양도·회수 때 실물 확인에 쓰는 값이라 보내지 않아요. */
export type LinkedSticker = { code8: string; claimedAt: string | null };

type Reason = "lost" | "move";

const REASONS: { value: Reason; title: string; body: string }[] = [
  {
    value: "lost",
    title: "잃어버렸거나 망가졌어요",
    body: "이 스티커는 다시 쓸 수 없게 막아요. 누가 주워서 찍어도 등록할 수 없어요.",
  },
  {
    value: "move",
    title: "다른 이동수단에 붙일래요",
    body: "새 스티커로 돌아가요. 다시 연결하기 전에는 누구나 찍어서 등록할 수 있으니, 떼어 낸 뒤 바로 다시 찍어 원하는 이동수단에 연결해 주세요.",
  },
];

/** 이동수단 화면의 QR · 스티커 칸: 앱 QR 보기, 연결된 스티커 목록과 연결 끊기, 숨긴 위치 */
export function StickerCard({ vehicleId, stickers, stickerSpot }: { vehicleId: string; stickers: LinkedSticker[]; stickerSpot: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const [target, setTarget] = useState<LinkedSticker | null>(null);
  const [reason, setReason] = useState<Reason>("lost");
  const [loading, setLoading] = useState(false);

  function ask(s: LinkedSticker) {
    setReason("lost");
    setTarget(s);
  }

  async function copyCode(code8: string) {
    const ok = await copyText(lookupCode(code8));
    if (ok) toast.success("조회 번호를 복사했어요.");
    else toast.error("복사하지 못했어요.");
  }

  async function unlink() {
    if (!target) return;
    setLoading(true);
    const { error } = await createClient().rpc("unlink_sticker", { p_vehicle: vehicleId, p_code: target.code8, p_reuse: reason === "move" });
    setLoading(false);
    if (error) {
      console.error(error);
      return toast.error(friendlyError(error, "연결을 끊지 못했어요. 잠시 후 다시 시도해 주세요."));
    }
    setTarget(null);
    toast.success(reason === "move" ? "연결을 끊었어요. 스티커를 바로 다시 찍어서 원하는 이동수단에 연결해 주세요." : "연결을 끊었어요. 이 스티커는 이제 쓸 수 없어요.");
    router.refresh();
  }

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 font-bold">
          <QrCode aria-hidden className="h-4 w-4 text-brand-600" />
          QR · 스티커
        </p>
        <span className="text-sm text-ink-muted">{stickers.length ? `스티커 ${stickers.length}장 연결됨` : "연결한 스티커 없음"}</span>
      </div>

      <ButtonLink href={`/vehicles/${vehicleId}/qr`} variant="secondary" full size="lg" icon={<QrCode aria-hidden className="h-5 w-5" />}>
        QR 보기·저장
      </ButtonLink>

      {stickers.length > 0 && (
        <ul className="space-y-2">
          {stickers.map((s) => (
            <li key={s.code8} className="space-y-2 rounded-xl bg-slate-50 p-3">
              <div className="flex items-start gap-3">
                <Tag aria-hidden className="mt-0.5 h-4 w-4 flex-none text-brand-600" />
                <p className="min-w-0 flex-1 text-[14px]">
                  스티커 · 조회 번호 <b className="whitespace-nowrap tracking-wide text-ink">{lookupCode(s.code8)}</b>
                  {s.claimedAt && <span className="block text-[12px] text-ink-muted">{formatDate(s.claimedAt)} 연결</span>}
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" className="h-10 px-3 text-sm" icon={<Copy aria-hidden className="h-4 w-4" />} onClick={() => copyCode(s.code8)}>
                  번호 복사
                </Button>
                <Button variant="ghost" className="h-10 px-3 text-sm text-rose-600" onClick={() => ask(s)}>
                  연결 끊기
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-[14px] leading-relaxed text-ink-soft">
        <EyeOff aria-hidden className="mt-0.5 h-4 w-4 flex-none" />
        {stickerSpot ? (
          <span>
            붙인 위치 (나만 보기): <b className="text-ink">{stickerSpot}</b>
          </span>
        ) : (
          <span>붙인 위치를 적어 두면, 커뮤니티에서 &ldquo;이건가요?&rdquo;라고 묻는 사람에게 비밀 답글로 바로 알려 줄 수 있어요.</span>
        )}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <ButtonLink href="/scan" variant="secondary" icon={<ScanLine aria-hidden className="h-4 w-4" />}>
          스티커 연결
        </ButtonLink>
        <ButtonLink href={`/vehicles/${vehicleId}/edit`} variant="secondary" icon={<EyeOff aria-hidden className="h-4 w-4" />}>
          위치 적기
        </ButtonLink>
      </div>

      <Modal
        open={Boolean(target)}
        onClose={() => !loading && setTarget(null)}
        title="스티커 연결 끊기"
        footer={
          <>
            <Button variant="ghost" onClick={() => setTarget(null)} disabled={loading}>
              취소
            </Button>
            <Button variant="danger" loading={loading} loadingText="끊는 중..." icon={<Unlink aria-hidden className="h-4 w-4" />} onClick={unlink}>
              연결 끊기
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-[15px] leading-relaxed text-ink-soft">
            조회 번호 <b className="text-ink">{target ? lookupCode(target.code8) : ""}</b> 스티커를 이 이동수단에서 떼어 낼게요. 어떤 경우인가요?
          </p>
          <div role="radiogroup" aria-label="연결을 끊는 이유" className="space-y-2">
            {REASONS.map((r) => (
              <label
                key={r.value}
                className={cn(
                  "block cursor-pointer rounded-xl border-2 p-3 transition-colors",
                  reason === r.value ? "border-brand-600 bg-brand-50" : "border-line bg-white hover:border-brand-300",
                )}
              >
                <input type="radio" name="unlink-reason" className="sr-only" checked={reason === r.value} onChange={() => setReason(r.value)} />
                <span className={cn("block text-[15px] font-semibold", reason === r.value ? "text-brand-800" : "text-ink")}>{r.title}</span>
                <span className="mt-0.5 block text-[13px] leading-relaxed text-ink-muted">{r.body}</span>
              </label>
            ))}
          </div>
          <p className="rounded-xl bg-slate-100 p-3 text-[13px] leading-relaxed text-ink-soft">
            {reason === "lost" ? "되돌릴 수 없어요. " : ""}연결된 스티커가 하나도 남지 않으면, 소유권을 넘길 때 구매자는 차대번호로 확인해요. 차대번호도 없으면 사진과 실물을 눈으로 확인해요.
          </p>
        </div>
      </Modal>
    </Card>
  );
}
