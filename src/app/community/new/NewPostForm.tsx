"use client";

/* eslint-disable @next/next/no-img-element -- Supabase 저장소 사진이라 기본 img 사용 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Send, Siren } from "lucide-react";
import { Button, Card, Input, Textarea, useToast } from "@/components/ui";
import { PhotoPicker } from "@/components/ui/PhotoPicker";
import { cn } from "@/lib/cn";
import { friendlyError } from "@/lib/format";
import { uploadPhoto, vehicleImageUrl } from "@/lib/images";
import type { VehicleStatus } from "@/lib/status";
import { createClient } from "@/lib/supabase/client";
import { VEHICLE_TYPES, typeEmoji, type VehicleType } from "@/lib/types";

export type VehicleOption = {
  id: string;
  type: VehicleType;
  name: string;
  brand: string | null;
  model: string | null;
  color: string | null;
  description: string | null;
  image_path: string | null;
  status: VehicleStatus;
};

type Form = {
  type: VehicleType;
  title: string;
  lost_area: string;
  lost_on: string;
  brand: string;
  model: string;
  color: string;
  body: string;
};

/** 오늘 날짜 (한국 시간, YYYY-MM-DD) */
const todayKst = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

function fromVehicle(v: VehicleOption | undefined, prev: Form): Form {
  if (!v) return prev;
  return {
    ...prev,
    type: v.type,
    brand: v.brand ?? "",
    model: v.model ?? "",
    color: v.color ?? "",
    body: prev.body || (v.description ? `특징: ${v.description}` : ""),
  };
}

export function NewPostForm({ vehicles, initialVehicleId }: { vehicles: VehicleOption[]; initialVehicleId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [vehicleId, setVehicleId] = useState(initialVehicleId);
  const vehicle = vehicles.find((v) => v.id === vehicleId);
  const [form, setForm] = useState<Form>(() =>
    fromVehicle(vehicles.find((v) => v.id === initialVehicleId), {
      type: "bicycle",
      title: "",
      lost_area: "",
      lost_on: todayKst(),
      brand: "",
      model: "",
      color: "",
      body: "",
    }),
  );
  const [photo, setPhoto] = useState<File | null>(null);
  const [alsoSearch, setAlsoSearch] = useState(true);
  const [errors, setErrors] = useState<Partial<Record<keyof Form | "photo" | "form", string>>>({});
  const [loading, setLoading] = useState(false);

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });

  function pickVehicle(id: string) {
    setVehicleId(id);
    setForm((f) => fromVehicle(vehicles.find((v) => v.id === id), f));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs: typeof errors = {};
    if (form.title.trim().length < 2) errs.title = "제목을 2자 이상 적어 주세요.";
    if (!form.lost_area.trim()) errs.lost_area = "잃어버린 곳을 적어 주세요.";
    if (!form.body.trim()) errs.body = "잃어버린 상황과 특징을 적어 주세요.";
    if (form.lost_on && form.lost_on > todayKst()) errs.lost_on = "오늘 이후 날짜는 고를 수 없어요.";
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setLoading(true);
    const supabase = createClient();
    let uploaded: string | null = null;
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login?next=/community/new");
        return;
      }

      // 새 사진이 있으면 올리고, 없으면 연결한 이동수단 사진을 그대로 씁니다.
      let image: { image_bucket: string | null; image_path: string | null } = { image_bucket: null, image_path: null };
      if (photo) {
        try {
          uploaded = await uploadPhoto(supabase, "community-images", user.id, photo);
        } catch (err) {
          setErrors({ photo: err instanceof Error ? err.message : "사진을 처리하지 못했어요." });
          return;
        }
        image = { image_bucket: "community-images", image_path: uploaded };
      } else if (vehicle?.image_path) {
        image = { image_bucket: "vehicle-images", image_path: vehicle.image_path };
      }

      const { data, error } = await supabase
        .from("lost_posts")
        .insert({
          vehicle_id: vehicle?.id ?? null,
          type: form.type,
          title: form.title.trim(),
          body: form.body.trim(),
          lost_area: form.lost_area.trim(),
          lost_on: form.lost_on || null,
          brand: form.brand.trim() || null,
          model: form.model.trim() || null,
          color: form.color.trim() || null,
          ...image,
        })
        .select("id")
        .single();
      if (error) throw error;

      // 연결한 이동수단을 '수색 중'으로 바꾸면 QR을 스캔한 사람에게도 분실 안내가 보여요.
      if (vehicle && vehicle.status !== "searching" && alsoSearch) {
        const { error: vErr } = await supabase.from("vehicles").update({ status: "searching" }).eq("id", vehicle.id);
        if (vErr) {
          console.error(vErr);
          toast.error("글은 올렸지만 이동수단 상태를 바꾸지 못했어요. 내 이동수단에서 다시 시도해 주세요.");
        }
      }

      toast.success("분실 글을 올렸어요. 댓글이 달리면 이 글에서 확인할 수 있어요.");
      router.replace(`/community/${data.id}`);
      router.refresh();
    } catch (err) {
      console.error(err);
      if (uploaded) await supabase.storage.from("community-images").remove([uploaded]);
      setErrors({ form: friendlyError(err, "글을 올리지 못했습니다. 잠시 후 다시 시도해 주세요.") });
      toast.error("글을 올리지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {vehicles.length > 0 && (
        <Card className="space-y-3">
          <div>
            <p className="text-sm font-semibold text-ink-soft">내 이동수단 연결 (선택)</p>
            <p className="mt-0.5 text-[13px] text-ink-muted">연결하면 사진·색상·브랜드가 채워지고, QR을 스캔한 사람도 이 글을 볼 수 있어요.</p>
          </div>
          <div className="grid gap-2">
            {[{ id: "", name: "연결 안 함" } as Partial<VehicleOption>, ...vehicles].map((v) => (
              <label
                key={v.id || "none"}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-xl border-2 p-2.5 text-[15px] font-semibold transition-colors",
                  vehicleId === v.id ? "border-brand-600 bg-brand-50 text-brand-800" : "border-line bg-white text-ink-soft hover:border-brand-300",
                )}
              >
                <input type="radio" name="vehicle" className="sr-only" checked={vehicleId === v.id} onChange={() => pickVehicle(v.id ?? "")} />
                <span className="grid h-11 w-11 flex-none place-items-center overflow-hidden rounded-lg bg-slate-100 text-xl">
                  {v.image_path ? (
                    <img src={vehicleImageUrl(v.image_path)!} alt="" className="h-full w-full object-cover" />
                  ) : v.type ? (
                    typeEmoji(v.type)
                  ) : (
                    "—"
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate">{v.name}</span>
                {v.status === "searching" && <span className="text-[13px] text-rose-600">수색 중</span>}
              </label>
            ))}
          </div>
          {vehicle && vehicle.status !== "searching" && (
            <label className="flex cursor-pointer items-start gap-2.5 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">
              <input type="checkbox" checked={alsoSearch} onChange={(e) => setAlsoSearch(e.target.checked)} className="mt-0.5 h-4 w-4 accent-rose-600" />
              <span>
                <Siren aria-hidden className="mr-1 inline h-4 w-4 align-[-3px]" />
                <b>{vehicle.name}</b> 상태도 &lsquo;수색 중&rsquo;으로 바꾸기
                <span className="mt-0.5 block text-[13px] text-rose-700/80">QR을 스캔한 사람에게 분실 안내가 보이고 발견 제보를 받을 수 있어요.</span>
              </span>
            </label>
          )}
        </Card>
      )}

      <Card className="space-y-5">
        <fieldset>
          <legend className="mb-1.5 block text-sm font-semibold text-ink-soft">
            종류<span className="ml-0.5 text-rose-600">*</span>
          </legend>
          <div className="grid grid-cols-3 gap-2">
            {VEHICLE_TYPES.map((t) => (
              <label
                key={t.value}
                className={cn(
                  "flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 py-2.5 text-sm font-semibold transition-colors",
                  form.type === t.value ? "border-brand-600 bg-brand-50 text-brand-700" : "border-line bg-white text-ink-soft hover:border-brand-300",
                )}
              >
                <input type="radio" name="type" className="sr-only" checked={form.type === t.value} onChange={() => setForm({ ...form, type: t.value })} />
                <span className="text-xl" aria-hidden>
                  {t.emoji}
                </span>
                {t.label}
              </label>
            ))}
          </div>
        </fieldset>
        <Input
          label="제목"
          placeholder="예) 울산대 정문 근처에서 검정 자전거를 잃어버렸어요"
          value={form.title}
          onChange={set("title")}
          error={errors.title}
          maxLength={60}
          required
        />
        <div className="grid gap-3 sm:grid-cols-[1fr_11rem]">
          <Input
            label="잃어버린 곳"
            placeholder="예) 울산대학교 정문 자전거 거치대"
            value={form.lost_area}
            onChange={set("lost_area")}
            error={errors.lost_area}
            maxLength={100}
            required
          />
          <Input label="잃어버린 날" type="date" max={todayKst()} value={form.lost_on} onChange={set("lost_on")} error={errors.lost_on} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Input label="색상" placeholder="검정" value={form.color} onChange={set("color")} maxLength={30} />
          <Input label="브랜드" placeholder="삼천리" value={form.brand} onChange={set("brand")} maxLength={40} />
          <Input label="모델" placeholder="하운드" value={form.model} onChange={set("model")} maxLength={40} />
        </div>
        <Textarea
          label="자세한 내용"
          placeholder={"예) 10월 7일 오후 3시쯤 세워 뒀는데 저녁에 보니 없어졌어요.\n안장 오른쪽에 흠집, 앞바퀴에 파란 스티커가 있어요."}
          hint="흠집·스티커·부착물 같은 특징을 적어 주세요. 전화번호·주소는 적지 마세요."
          value={form.body}
          onChange={set("body")}
          error={errors.body}
          maxLength={2000}
          rows={6}
          required
        />
      </Card>

      <Card>
        <PhotoPicker
          label={vehicle?.image_path ? "사진 (선택 · 안 고르면 등록된 사진 사용)" : "사진 (선택)"}
          hint="전체가 잘 보이는 사진이 있으면 알아보기 쉬워요."
          value={photo}
          onChange={(f) => {
            setPhoto(f);
            setErrors((x) => ({ ...x, photo: undefined }));
          }}
          error={errors.photo}
        />
      </Card>

      {errors.form && (
        <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
          {errors.form}
        </p>
      )}
      <Button type="submit" full size="lg" loading={loading} loadingText="올리는 중..." icon={<Send aria-hidden className="h-5 w-5" />}>
        분실 글 올리기
      </Button>
    </form>
  );
}
