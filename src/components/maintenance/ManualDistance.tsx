"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Button, Input, Modal, useToast } from "@/components/ui";
import { friendlyError } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";

/** 앱을 켜지 않고 탄 거리를 직접 더해요 (누적 주행·소모품 계산에 반영) */
export function ManualDistance({ vehicleId }: { vehicleId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [km, setKm] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    const n = Number(km.replace(/[,\s]/g, ""));
    if (!Number.isFinite(n) || n < 0.1 || n > 300) return setError("0.1~300km 사이로 적어 주세요.");
    setError("");
    setSaving(true);
    const { error: err } = await createClient().rpc("add_manual_distance", { p_vehicle: vehicleId, p_km: n, p_note: note.trim() || null });
    setSaving(false);
    if (err) {
      console.error(err);
      return setError(friendlyError(err, "더하지 못했어요. 잠시 후 다시 시도해 주세요."));
    }
    toast.success(`${n}km를 더했어요. 소모품 계산에도 반영됐어요.`);
    setOpen(false);
    setKm("");
    setNote("");
    router.refresh();
  }

  return (
    <>
      <Button variant="secondary" className="flex-none" icon={<Plus aria-hidden className="h-4 w-4" />} onClick={() => setOpen(true)}>
        탄 거리 더하기
      </Button>
      <Modal
        open={open}
        onClose={() => !saving && setOpen(false)}
        title="앱 없이 탄 거리 더하기"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
              취소
            </Button>
            <Button loading={saving} loadingText="더하는 중..." onClick={save}>
              더하기
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-[14px] leading-relaxed text-ink-soft">라이딩을 기록하지 않고 탄 거리를 적으면 누적 주행과 소모품 수명에 더해져요.</p>
          <Input label="탄 거리 (km)" inputMode="decimal" placeholder="예) 12.5" value={km} onChange={(e) => setKm(e.target.value)} error={error} />
          <Input label="메모 (선택)" placeholder="예) 출퇴근 왕복" value={note} maxLength={100} onChange={(e) => setNote(e.target.value)} />
        </div>
      </Modal>
    </>
  );
}
