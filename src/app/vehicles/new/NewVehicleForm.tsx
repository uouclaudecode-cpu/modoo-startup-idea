"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card, Input, Textarea, useToast } from "@/components/ui";
import { PhotoPicker } from "@/components/ui/PhotoPicker";
import { cn } from "@/lib/cn";
import { friendlyError } from "@/lib/format";
import { prepareImage } from "@/lib/images";
import { createClient } from "@/lib/supabase/client";
import { VEHICLE_TYPES, type VehicleType } from "@/lib/types";

type Form = { type: VehicleType; name: string; brand: string; model: string; color: string; description: string };

export function NewVehicleForm() {
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = useState<Form>({ type: "bicycle", name: "", brand: "", model: "", color: "", description: "" });
  const [photo, setPhoto] = useState<File | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof Form | "photo" | "form", string>>>({});
  const [loading, setLoading] = useState(false);

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs: typeof errors = {};
    if (!form.name.trim()) errs.name = "이름을 입력해 주세요.";
    if (form.description.trim().length > 500) errs.description = "특징은 500자 이하로 적어 주세요.";
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setLoading(true);
    const supabase = createClient();
    let imagePath: string | null = null;
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login?next=/vehicles/new");
        return;
      }

      // 1) 사진 올리기 (본인 폴더: {사용자ID}/{무작위}.jpg)
      if (photo) {
        let blob: Blob;
        try {
          blob = await prepareImage(photo);
        } catch (err) {
          setErrors({ photo: err instanceof Error ? err.message : "사진을 처리하지 못했어요." });
          return;
        }
        imagePath = `${user.id}/${crypto.randomUUID()}.jpg`;
        const { error: upErr } = await supabase.storage
          .from("vehicle-images")
          .upload(imagePath, blob, { contentType: "image/jpeg", upsert: false });
        if (upErr) {
          console.error(upErr);
          imagePath = null;
          setErrors({ photo: "사진 업로드에 실패했습니다. 다시 시도해주세요." });
          return;
        }
      }

      // 2) 이동수단 저장 → QR 토큰은 데이터베이스가 무작위로 만듭니다.
      const { data, error } = await supabase
        .from("vehicles")
        .insert({
          type: form.type,
          name: form.name.trim(),
          brand: form.brand.trim() || null,
          model: form.model.trim() || null,
          color: form.color.trim() || null,
          description: form.description.trim() || null,
          image_path: imagePath,
        })
        .select("id")
        .single();
      if (error) throw error;

      toast.success("등록되었습니다! 고유 QR이 만들어졌어요.");
      router.replace(`/vehicles/${data.id}/qr?new=1`);
      router.refresh();
    } catch (err) {
      console.error(err);
      // 저장에 실패하면 먼저 올린 사진을 지워 쓰레기 파일이 남지 않게 합니다.
      if (imagePath) await supabase.storage.from("vehicle-images").remove([imagePath]);
      setErrors({ form: friendlyError(err, "등록에 실패했습니다. 잠시 후 다시 시도해 주세요.") });
      toast.error("등록에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <Card className="space-y-5">
        <fieldset>
          <legend className="mb-1.5 block text-sm font-semibold text-ink-soft">
            이동수단 종류<span className="ml-0.5 text-rose-600">*</span>
          </legend>
          <div className="grid grid-cols-3 gap-2">
            {VEHICLE_TYPES.map((t) => (
              <label
                key={t.value}
                className={cn(
                  "flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 py-3 text-sm font-semibold transition-colors",
                  form.type === t.value ? "border-brand-600 bg-brand-50 text-brand-700" : "border-line bg-white text-ink-soft hover:border-brand-300",
                )}
              >
                <input
                  type="radio"
                  name="type"
                  value={t.value}
                  checked={form.type === t.value}
                  onChange={() => setForm({ ...form, type: t.value })}
                  className="sr-only"
                />
                <span className="text-2xl" aria-hidden>
                  {t.emoji}
                </span>
                {t.label}
              </label>
            ))}
          </div>
        </fieldset>
        <Input label="이름" placeholder="예) 출퇴근용 자전거" value={form.name} onChange={set("name")} error={errors.name} maxLength={40} required />
        <div className="grid grid-cols-2 gap-3">
          <Input label="브랜드" placeholder="예) 삼천리" value={form.brand} onChange={set("brand")} maxLength={40} />
          <Input label="모델" placeholder="예) 하운드" value={form.model} onChange={set("model")} maxLength={40} />
        </div>
        <Input label="색상" placeholder="예) 무광 검정" value={form.color} onChange={set("color")} maxLength={30} />
        <Textarea
          label="특징"
          placeholder="예) 안장 오른쪽에 작은 흠집이 있습니다."
          hint="흠집·스티커·부착물처럼 내 것임을 알아볼 수 있는 특징을 적어 주세요. 소유권을 확인할 때 쓰여요."
          value={form.description}
          onChange={set("description")}
          error={errors.description}
          maxLength={500}
          rows={4}
        />
      </Card>
      <Card>
        <PhotoPicker
          label="사진"
          hint="전체가 잘 보이는 사진 1장. 발견한 사람이 알아볼 수 있게 도와줘요."
          value={photo}
          onChange={(f) => {
            setPhoto(f);
            setErrors((e) => ({ ...e, photo: undefined }));
          }}
          error={errors.photo}
        />
      </Card>
      {errors.form && (
        <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
          {errors.form}
        </p>
      )}
      <Button type="submit" full size="lg" loading={loading} loadingText="등록 중...">
        등록하고 QR 만들기
      </Button>
    </form>
  );
}
