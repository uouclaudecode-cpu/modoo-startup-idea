"use client";

/* eslint-disable @next/next/no-img-element -- 비공개 사진은 서명 주소라 기본 img 사용 */
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Camera, CircleCheck, FileBadge, Loader2, Trash2 } from "lucide-react";
import { Button, ButtonLink, Card, Input, Modal, useToast } from "@/components/ui";
import { EVIDENCE_SLOTS, evidenceLabel, type Evidence, type EvidenceKind } from "@/lib/evidence";
import { formatDateTime, friendlyError } from "@/lib/format";
import { IMAGE_ACCEPT, MAX_UPLOAD_MB, uploadPhoto } from "@/lib/images";
import { createClient } from "@/lib/supabase/client";

type Props = {
  vehicleId: string;
  items: Evidence[];
  signed: Record<string, string>;
  purchasedOn: string | null;
  purchasePlace: string | null;
  serialLast4: string | null;
};

export function EvidenceBoard({ vehicleId, items, signed, purchasedOn, purchasePlace, serialLast4 }: Props) {
  const router = useRouter();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [target, setTarget] = useState<EvidenceKind | null>(null);
  const [uploading, setUploading] = useState<EvidenceKind | null>(null);
  // 지울지 묻는 중인 사진 (한 번 눌러 바로 지워지지 않게)
  const [confirming, setConfirming] = useState<Evidence | null>(null);
  const [deleting, setDeleting] = useState("");
  const [date, setDate] = useState(purchasedOn ?? "");
  const [place, setPlace] = useState(purchasePlace ?? "");
  const [saving, setSaving] = useState(false);

  const filled = new Set(items.map((e) => e.kind));
  const done = EVIDENCE_SLOTS.filter((s) => filled.has(s.kind)).length;

  function pick(kind: EvidenceKind) {
    setTarget(kind);
    fileRef.current?.click();
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !target) return;
    if (file.size > MAX_UPLOAD_MB * 4 * 1024 * 1024) return toast.error("사진이 너무 커요.");
    const kind = target;
    setUploading(kind);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("로그인이 만료됐어요. 다시 로그인해 주세요.");
      const path = await uploadPhoto(supabase, "evidence", user.id, file);
      const { error } = await supabase.from("vehicle_evidence").insert({ vehicle_id: vehicleId, owner_id: user.id, kind, photo_path: path });
      if (error) {
        await supabase.storage.from("evidence").remove([path]);
        throw error;
      }
      toast.success("저장했어요.");
      router.refresh();
    } catch (err) {
      console.error(err);
      toast.error(friendlyError(err, "사진을 올리지 못했어요. 다시 시도해 주세요."));
    } finally {
      setUploading(null);
    }
  }

  async function remove(ev: Evidence) {
    setDeleting(ev.id);
    const supabase = createClient();
    const { error } = await supabase.from("vehicle_evidence").delete().eq("id", ev.id);
    if (!error) {
      const { error: fileErr } = await supabase.storage.from("evidence").remove([ev.photo_path]);
      if (fileErr) console.error(fileErr); // 기록은 지웠어요. 남은 파일은 서버 정리 대기열이 지워요.
    }
    setDeleting("");
    if (error) {
      console.error(error);
      return toast.error(friendlyError(error, "사진을 지우지 못했어요. 잠시 후 다시 시도해 주세요."));
    }
    setConfirming(null);
    toast.success("사진을 지웠어요.");
    router.refresh();
  }

  async function savePurchase(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { error } = await createClient()
      .from("vehicles")
      .update({ purchased_on: date || null, purchase_place: place.trim() || null })
      .eq("id", vehicleId)
      .select("id")
      .single();
    setSaving(false);
    if (error) {
      console.error(error);
      return toast.error(friendlyError(error, "저장하지 못했어요."));
    }
    toast.success("구매 정보를 저장했어요.");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <input ref={fileRef} type="file" accept={IMAGE_ACCEPT} className="hidden" onChange={onFile} />

      <Card className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="font-bold">채운 자료</p>
          <p className="text-sm font-semibold text-brand-700">
            {done} / {EVIDENCE_SLOTS.length}
          </p>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-brand-600 transition-[width]" style={{ width: `${Math.max(4, (done / EVIDENCE_SLOTS.length) * 100)}%` }} />
        </div>
        <p className="text-[13px] text-ink-muted">
          차대번호 {serialLast4 ? `등록됨 (••••${serialLast4})` : "미등록 — 이동수단 화면의 ‘중고거래 → 차대번호’에서 등록해 주세요"}
        </p>
      </Card>

      <ul className="grid grid-cols-2 gap-3">
        {EVIDENCE_SLOTS.map((slot) => {
          const mine = items.filter((e) => e.kind === slot.kind);
          const canAdd = slot.multi || mine.length === 0;
          // 여러 장 칸과 차대번호는 한 줄 전체: 그래야 앞·뒤, 왼쪽·오른쪽이 빈칸 없이 짝을 이뤄요
          const wide = slot.multi || slot.kind === "serial";
          return (
            <li key={slot.kind} className={wide ? "col-span-2" : ""}>
              <Card className="space-y-2 p-3">
                <p className="flex items-center gap-1.5 text-[14px] font-bold">
                  {mine.length > 0 && <CircleCheck aria-hidden className="h-4 w-4 text-emerald-600" />}
                  {slot.label}
                </p>
                <div className={wide ? "grid grid-cols-3 gap-2" : ""}>
                  {mine.map((ev) => (
                    <div key={ev.id} className="relative">
                      {signed[ev.photo_path] ? (
                        <a href={signed[ev.photo_path]} target="_blank" rel="noopener noreferrer">
                          <img src={signed[ev.photo_path]} alt={slot.label} className="aspect-square w-full rounded-lg object-cover" />
                        </a>
                      ) : (
                        <div className="aspect-square w-full rounded-lg bg-slate-100" />
                      )}
                      <button
                        type="button"
                        onClick={() => setConfirming(ev)}
                        disabled={deleting === ev.id}
                        className="absolute right-1 top-1 grid h-9 w-9 place-items-center rounded-full bg-black/60 text-white ring-2 ring-white/80"
                        aria-label={`${slot.label} 사진 지우기`}
                      >
                        {deleting === ev.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </button>
                      <p className="mt-1 text-[11px] text-ink-faint">{formatDateTime(ev.created_at)}</p>
                    </div>
                  ))}
                  {canAdd && (
                    <button
                      type="button"
                      onClick={() => pick(slot.kind)}
                      disabled={uploading !== null}
                      className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-line text-[12px] text-ink-muted hover:bg-slate-50"
                    >
                      {uploading === slot.kind ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
                      {uploading === slot.kind ? "올리는 중..." : "사진 추가"}
                    </button>
                  )}
                </div>
                <p className="text-[12px] leading-snug text-ink-muted">{slot.hint}</p>
              </Card>
            </li>
          );
        })}
      </ul>

      <Modal
        open={Boolean(confirming)}
        onClose={() => !deleting && setConfirming(null)}
        title="이 사진을 지울까요?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(null)} disabled={Boolean(deleting)}>
              취소
            </Button>
            <Button
              variant="danger"
              loading={Boolean(confirming) && deleting === confirming?.id}
              loadingText="지우는 중..."
              icon={<Trash2 aria-hidden className="h-4 w-4" />}
              onClick={() => confirming && remove(confirming)}
            >
              지우기
            </Button>
          </>
        }
      >
        <p>
          {confirming ? `${evidenceLabel(confirming.kind)} 사진` : "이 사진"}과 올린 시각 기록이 함께 지워지고, 소유 증명서에서도 빠져요. 되돌릴 수 없어요.
        </p>
        <p className="mt-2 text-[13px] text-ink-muted">다시 올리면 오늘 날짜로 남아서, 예전부터 가지고 있었다는 증거가 약해져요.</p>
      </Modal>

      <Card>
        <form onSubmit={savePurchase} className="space-y-3">
          <p className="font-bold">구매 정보</p>
          <div className="grid grid-cols-2 gap-3">
            <Input label="산 날 (선택)" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <Input label="산 곳 (선택)" placeholder="예) OO자전거 울산점" value={place} maxLength={60} onChange={(e) => setPlace(e.target.value)} />
          </div>
          <Button type="submit" variant="secondary" full loading={saving} loadingText="저장 중...">
            구매 정보 저장
          </Button>
        </form>
      </Card>

      <ButtonLink href={`/vehicles/${vehicleId}/certificate`} full size="lg" icon={<FileBadge aria-hidden className="h-5 w-5" />}>
        소유 증명서 보기·인쇄
      </ButtonLink>
      <p className="text-center text-[12px] leading-relaxed text-ink-muted">
        증명서는 경찰 신고·보험 청구 때 보여 줄 수 있어요. 소유권을 넘기면 이 자료(영수증 등)는 지워지고 새 주인에게 넘어가지 않아요.
      </p>
    </div>
  );
}
