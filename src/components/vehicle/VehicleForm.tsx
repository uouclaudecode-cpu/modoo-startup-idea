"use client";

/* eslint-disable @next/next/no-img-element -- Supabase 저장소 사진이라 기본 img 사용 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card, Input, Textarea, buttonClass, useToast } from "@/components/ui";
import { PhotoPicker } from "@/components/ui/PhotoPicker";
import { StickerSpotInput } from "@/components/vehicle/StickerSpotInput";
import { cn } from "@/lib/cn";
import { friendlyError } from "@/lib/format";
import { prepareImage, vehicleImageUrl } from "@/lib/images";
import { createClient } from "@/lib/supabase/client";
import { VEHICLE_TYPES, type Vehicle, type VehicleType } from "@/lib/types";

type Form = { type: VehicleType; name: string; brand: string; model: string; color: string; description: string };

/**
 * 이동수단 등록 폼. vehicle을 넘기면 정보 수정 폼이 됩니다. (QR은 바뀌지 않음)
 * stickerCode를 넘기면 등록하면서 그 스티커를 함께 연결합니다.
 */
export function VehicleForm({ vehicle, stickerCode }: { vehicle?: Vehicle; stickerCode?: string } = {}) {
  const router = useRouter();
  const toast = useToast();
  const editing = Boolean(vehicle);
  const [form, setForm] = useState<Form>({
    type: vehicle?.type ?? "bicycle",
    name: vehicle?.name ?? "",
    brand: vehicle?.brand ?? "",
    model: vehicle?.model ?? "",
    color: vehicle?.color ?? "",
    description: vehicle?.description ?? "",
  });
  const [photo, setPhoto] = useState<File | null>(null);
  const [spot, setSpot] = useState(vehicle?.sticker_spot ?? "");
  // 수정할 때: 지금 사진을 지우기로 했는지
  const [removeCurrent, setRemoveCurrent] = useState(false);
  const currentImage = vehicle?.image_path && !removeCurrent ? vehicleImageUrl(vehicle.image_path) : null;
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

      const fields = {
        type: form.type,
        name: form.name.trim(),
        brand: form.brand.trim() || null,
        model: form.model.trim() || null,
        color: form.color.trim() || null,
        description: form.description.trim() || null,
        sticker_spot: spot.trim() || null,
      };

      if (vehicle) {
        // 수정: 새 사진 > 사진 지우기 > 그대로. (예전 사진 파일은 커뮤니티 글이 쓰고 있을 수 있어 남겨 둡니다.)
        const image_path = imagePath ?? (removeCurrent ? null : vehicle.image_path);
        const { error } = await supabase.from("vehicles").update({ ...fields, image_path }).eq("id", vehicle.id);
        if (error) throw error;
        toast.success("정보를 수정했어요. QR은 그대로예요.");
        router.replace(`/vehicles/${vehicle.id}`);
        router.refresh();
        return;
      }

      // 2) 이동수단 저장 → QR 토큰은 데이터베이스가 무작위로 만듭니다.
      const { data, error } = await supabase.from("vehicles").insert({ ...fields, image_path: imagePath }).select("id").single();
      if (error) throw error;

      // 오프라인에서 받은 스티커를 함께 연결 (앱에서 만든 QR도 그대로 쓸 수 있어요)
      if (stickerCode) {
        const { error: claimErr } = await supabase.rpc("claim_sticker", { p_code: stickerCode, p_vehicle: data.id, p_spot: null });
        if (claimErr) {
          console.error(claimErr);
          toast.error(friendlyError(claimErr, "등록은 됐지만 스티커를 연결하지 못했어요. 스티커를 다시 찍어 주세요."));
          router.replace(`/vehicles/${data.id}`);
          router.refresh();
          return;
        }
        toast.success("등록하고 스티커도 연결했어요!");
      } else {
        toast.success("등록되었습니다! 고유 QR이 만들어졌어요.");
      }
      router.replace(`/vehicles/${data.id}/qr?new=1`);
      router.refresh();
    } catch (err) {
      console.error(err);
      // 저장에 실패하면 먼저 올린 사진을 지워 쓰레기 파일이 남지 않게 합니다.
      if (imagePath) await supabase.storage.from("vehicle-images").remove([imagePath]);
      setErrors({ form: friendlyError(err, `${editing ? "수정" : "등록"}에 실패했습니다. 잠시 후 다시 시도해 주세요.`) });
      toast.error(`${editing ? "수정" : "등록"}에 실패했습니다.`);
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
      <Card className="space-y-3">
        <p className="text-[13px] leading-relaxed text-ink-muted">
          {stickerCode
            ? "🏷️ 받은 스티커가 이 이동수단에 연결돼요. 주인만 아는 곳에 붙이고 위치를 적어 두세요."
            : "QR 스티커(받은 스티커나 직접 출력한 QR)를 붙였다면 위치를 적어 두세요. 커뮤니티에서 비밀 답글로 알려줄 때 써요."}
        </p>
        <StickerSpotInput value={spot} onChange={setSpot} />
      </Card>
      <Card>
        {currentImage && !photo ? (
          <div className="space-y-1.5">
            <p className="text-sm font-semibold text-ink-soft">사진</p>
            <img src={currentImage} alt="지금 등록된 사진" className="aspect-[4/3] w-full rounded-xl object-cover ring-1 ring-line" />
            <div className="grid grid-cols-2 gap-2 pt-1">
              <Button variant="secondary" onClick={() => setRemoveCurrent(true)}>
                사진 지우기
              </Button>
              <label className={buttonClass("secondary") + " cursor-pointer"}>
                사진 바꾸기
                <input type="file" accept="image/*" className="sr-only" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
              </label>
            </div>
          </div>
        ) : (
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
        )}
      </Card>
      {errors.form && (
        <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
          {errors.form}
        </p>
      )}
      <Button type="submit" full size="lg" loading={loading} loadingText={editing ? "저장 중..." : "등록 중..."}>
        {editing ? "수정 내용 저장" : "등록하고 QR 만들기"}
      </Button>
    </form>
  );
}
