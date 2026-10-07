"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Button, Card, Input } from "@/components/ui";
import { friendlyError } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";

export function NewBatchForm() {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [quantity, setQuantity] = useState("40");
  const [errors, setErrors] = useState<{ label?: string; quantity?: string; form?: string }>({});
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(quantity);
    const errs: typeof errors = {};
    if (!label.trim()) errs.label = "어디에 둘 스티커인지 적어 주세요.";
    if (!Number.isInteger(n) || n < 1 || n > 1000) errs.quantity = "1~1000장 사이로 적어 주세요.";
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setLoading(true);
    const { data, error } = await createClient().rpc("create_sticker_batch", { p_label: label.trim(), p_quantity: n });
    setLoading(false);
    if (error) {
      console.error(error);
      setErrors({ form: friendlyError(error, "스티커를 만들지 못했어요. 잠시 후 다시 시도해 주세요.") });
      return;
    }
    router.push(`/admin/stickers/${data}`);
  }

  return (
    <Card>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <Input label="묶음 이름 (둘 장소)" placeholder="예) 울산대 학생회관 1차" value={label} onChange={(e) => setLabel(e.target.value)} error={errors.label} maxLength={60} />
        <Input
          label="장수"
          type="number"
          inputMode="numeric"
          min={1}
          max={1000}
          hint="A4 한 장에 40장(5×8)씩 인쇄돼요."
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          error={errors.quantity}
        />
        {errors.form && (
          <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
            {errors.form}
          </p>
        )}
        <Button type="submit" full loading={loading} loadingText="만드는 중..." icon={<Plus aria-hidden className="h-4 w-4" />}>
          스티커 만들기
        </Button>
      </form>
    </Card>
  );
}
