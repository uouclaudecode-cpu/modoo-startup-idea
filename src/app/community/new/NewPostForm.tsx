"use client";

/* eslint-disable @next/next/no-img-element -- Supabase 저장소 사진이라 기본 img 사용 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { QrCode, Save, Search, Send, Siren, UserSearch } from "lucide-react";
import { Button, Card, Input, Textarea, buttonClass, useToast } from "@/components/ui";
import { PhotoPicker } from "@/components/ui/PhotoPicker";
import { LocationPicker, type PickedLocation } from "@/components/map/LocationPicker";
import { cn } from "@/lib/cn";
import { POST_KIND_META, postImageUrl, type LostPost, type PostKind } from "@/lib/community";
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

/** 글 고치기 폼에 넘기는 지금 글 내용 */
export type EditablePost = Pick<
  LostPost,
  | "id"
  | "kind"
  | "vehicle_id"
  | "type"
  | "title"
  | "body"
  | "lost_area"
  | "lost_on"
  | "lost_lat"
  | "lost_lng"
  | "brand"
  | "model"
  | "color"
  | "image_bucket"
  | "image_path"
>;

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

type Image = { image_bucket: "vehicle-images" | "community-images" | null; image_path: string | null };
const NO_IMAGE: Image = { image_bucket: null, image_path: null };

/** 글 종류별 안내 문구 */
const KIND_COPY: Record<PostKind, { hint: string; title: string; place: string; body: string; bodyHint: string; bodyError: string }> = {
  lost: {
    hint: "내 자전거·킥보드를 찾고 있어요",
    title: "예) 울산대 정문 근처에서 검정 자전거를 잃어버렸어요",
    place: "예) 울산대학교 정문 자전거 거치대",
    body: "예) 10월 7일 오후 3시쯤 세워 뒀는데 저녁에 보니 없어졌어요.\n안장 오른쪽에 흠집, 앞바퀴에 파란 스티커가 있어요.",
    bodyHint: "흠집·스티커·부착물 같은 특징을 적어 주세요. 전화번호·주소는 적지 마세요.",
    bodyError: "잃어버린 상황과 특징을 적어 주세요.",
  },
  found: {
    hint: "주인 없는 자전거·킥보드를 발견했어요",
    title: "예) 학생회관 앞에 며칠째 세워진 검정 자전거 주인을 찾아요",
    place: "예) 울산대학교 학생회관 앞 거치대",
    body: "예) 10월 5일부터 자물쇠 없이 같은 자리에 세워져 있어요.\n앞바구니가 달린 검정 자전거예요.",
    bodyHint: "주인이 맞는지 물어볼 수 있게 눈에 띄는 특징 하나는 적지 말고 남겨 두세요. 전화번호·주소는 적지 마세요.",
    bodyError: "발견한 상황과 특징을 적어 주세요.",
  },
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

function fromPost(p: EditablePost): Form {
  return {
    type: p.type,
    title: p.title,
    lost_area: p.lost_area ?? "",
    lost_on: p.lost_on ?? "",
    brand: p.brand ?? "",
    model: p.model ?? "",
    color: p.color ?? "",
    body: p.body,
  };
}

/**
 * 커뮤니티 글쓰기 폼. post 를 넘기면 그 글을 고치는 폼이 돼요. (상태·댓글은 그대로)
 * 글 종류: 잃어버렸어요(내 이동수단 연결 가능) / 주인을 찾아요(발견한 사람이 올림, 이동수단 연결 없음)
 */
export function NewPostForm({
  vehicles,
  initialVehicleId,
  initialKind = "lost",
  post,
}: {
  vehicles: VehicleOption[];
  initialVehicleId: string;
  initialKind?: PostKind;
  post?: EditablePost;
}) {
  const router = useRouter();
  const toast = useToast();
  const editing = Boolean(post);
  const [kind, setKind] = useState<PostKind>(post?.kind ?? initialKind);
  // 고칠 때: 연결했던 이동수단을 그 사이 지웠거나 넘겼으면 '연결 안 함'으로 시작해요
  const [vehicleId, setVehicleId] = useState(post ? (vehicles.find((v) => v.id === post.vehicle_id)?.id ?? "") : initialVehicleId);
  // 발견 글에는 내 이동수단을 연결하지 않아요
  const vehicle = kind === "lost" ? vehicles.find((v) => v.id === vehicleId) : undefined;
  const [form, setForm] = useState<Form>(() =>
    post
      ? fromPost(post)
      : fromVehicle(vehicles.find((v) => v.id === initialVehicleId), {
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
  // 고칠 때: 지금 글에 붙은 사진을 지우기로 했는지
  const [removeCurrent, setRemoveCurrent] = useState(false);
  // 지도에서 고른 잃어버린(발견한) 위치 (선택)
  const [pin, setPin] = useState<PickedLocation | null>(
    post?.lost_lat != null && post?.lost_lng != null ? { lat: post.lost_lat, lng: post.lost_lng } : null,
  );
  const [alsoSearch, setAlsoSearch] = useState(true);
  const [errors, setErrors] = useState<Partial<Record<keyof Form | "photo" | "form", string>>>({});
  const [loading, setLoading] = useState(false);
  const meta = POST_KIND_META[kind];
  const copy = KIND_COPY[kind];

  // 고칠 때 그대로 둘 사진: 글에 올린 사진은 그대로, 이동수단 사진을 쓰던 글은 지금 연결한 이동수단의 사진으로
  const vehicleChanged = (vehicle?.id ?? null) !== (post?.vehicle_id ?? null);
  const keptImage: Image | null =
    !post || removeCurrent
      ? null
      : post.image_bucket === "community-images" && post.image_path
        ? { image_bucket: "community-images", image_path: post.image_path }
        : (post.image_bucket === "vehicle-images" || vehicleChanged) && vehicle?.image_path
          ? { image_bucket: "vehicle-images", image_path: vehicle.image_path }
          : null;
  const keptImageUrl = keptImage ? postImageUrl(keptImage) : null;

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });

  function pickVehicle(id: string) {
    setVehicleId(id);
    setForm((f) => fromVehicle(vehicles.find((v) => v.id === id), f));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs: typeof errors = {};
    if (form.title.trim().length < 2) errs.title = "제목을 2자 이상 적어 주세요.";
    if (!form.lost_area.trim()) errs.lost_area = `${meta.place}을 적어 주세요.`;
    if (!form.body.trim()) errs.body = copy.bodyError;
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
        router.replace(`/login?next=${encodeURIComponent(post ? `/community/${post.id}/edit` : "/community/new")}`);
        return;
      }

      // 새 사진이 있으면 올리고, 없으면 (새 글) 연결한 이동수단 사진 / (고치기) 그대로 둘 사진
      let image: Image = NO_IMAGE;
      if (photo) {
        try {
          uploaded = await uploadPhoto(supabase, "community-images", user.id, photo);
        } catch (err) {
          setErrors({ photo: err instanceof Error ? err.message : "사진을 처리하지 못했어요." });
          return;
        }
        image = { image_bucket: "community-images", image_path: uploaded };
      } else if (post) {
        image = keptImage ?? NO_IMAGE;
      } else if (vehicle?.image_path) {
        image = { image_bucket: "vehicle-images", image_path: vehicle.image_path };
      }

      const fields = {
        kind,
        vehicle_id: vehicle?.id ?? null,
        type: form.type,
        title: form.title.trim(),
        body: form.body.trim(),
        lost_area: form.lost_area.trim(),
        lost_on: form.lost_on || null,
        lost_lat: pin?.lat ?? null,
        lost_lng: pin?.lng ?? null,
        brand: form.brand.trim() || null,
        model: form.model.trim() || null,
        color: form.color.trim() || null,
        ...image,
      };

      if (post) {
        // 고치기: 바꾼 사진의 예전 파일은 데이터베이스가 정리 대기열에 넣어요
        const { data, error } = await supabase.from("lost_posts").update(fields).eq("id", post.id).select("id").maybeSingle();
        if (error) throw error;
        if (!data) throw new Error("글을 고칠 수 없어요. 지워졌거나 내가 쓴 글이 아니에요.");
        toast.success("글을 고쳤어요.");
        router.replace(`/community/${post.id}`);
        router.refresh();
        return;
      }

      const { data, error } = await supabase.from("lost_posts").insert(fields).select("id").single();
      if (error) throw error;

      // 연결한 이동수단을 '수색 중'으로 바꾸면 QR을 스캔한 사람에게도 분실 안내가 보여요.
      if (vehicle && vehicle.status !== "searching" && alsoSearch) {
        const { error: vErr } = await supabase.from("vehicles").update({ status: "searching" }).eq("id", vehicle.id);
        if (vErr) {
          console.error(vErr);
          toast.error("글은 올렸지만 이동수단 상태를 바꾸지 못했어요. 내 이동수단에서 다시 시도해 주세요.");
        }
      }

      toast.success(
        kind === "found"
          ? "발견 글을 올렸어요. 주인이 댓글을 남기면 이 글에서 확인할 수 있어요."
          : "분실 글을 올렸어요. 댓글이 달리면 이 글에서 확인할 수 있어요.",
      );
      router.replace(`/community/${data.id}`);
      router.refresh();
    } catch (err) {
      console.error(err);
      if (uploaded) await supabase.storage.from("community-images").remove([uploaded]);
      const what = post ? "글을 고치지" : "글을 올리지";
      setErrors({ form: friendlyError(err, `${what} 못했어요. 잠시 후 다시 시도해 주세요.`) });
      toast.error(`${what} 못했어요.`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <fieldset>
        <legend className="mb-1.5 block text-sm font-semibold text-ink-soft">
          어떤 글인가요?<span className="ml-0.5 text-rose-600">*</span>
        </legend>
        <div className="grid grid-cols-2 gap-2">
          {(["lost", "found"] as const).map((k) => {
            const Icon = k === "found" ? UserSearch : Search;
            return (
              <label
                key={k}
                className={cn(
                  "flex cursor-pointer flex-col gap-1 rounded-2xl border-2 bg-white p-3 transition-colors",
                  kind === k ? "border-brand-600 bg-brand-50" : "border-line hover:border-brand-300",
                )}
              >
                <input type="radio" name="kind" className="sr-only" checked={kind === k} onChange={() => setKind(k)} />
                <span className={cn("flex items-center gap-1.5 text-[15px] font-bold", kind === k ? "text-brand-800" : "text-ink")}>
                  <Icon aria-hidden className="h-4 w-4 flex-none" />
                  {POST_KIND_META[k].label}
                </span>
                <span className="text-[13px] leading-snug text-ink-muted">{KIND_COPY[k].hint}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {kind === "found" && (
        <div className="flex items-start gap-3 rounded-2xl bg-brand-50 p-4 text-[14px] leading-relaxed text-brand-900 ring-1 ring-brand-100">
          <QrCode aria-hidden className="mt-0.5 h-5 w-5 flex-none text-brand-600" />
          <p>
            <b>B-LOCK QR 스티커가 붙어 있나요?</b> 글보다{" "}
            <Link href="/scan" className="font-semibold underline underline-offset-2">
              QR을 찍어 발견 제보
            </Link>
            를 보내는 게 더 빨라요. 주인에게 바로 알림이 가요. 직접 가져가지는 말고, 도난이 의심되면 112에 알려 주세요.
          </p>
        </div>
      )}

      {kind === "lost" && vehicles.length > 0 && (
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
          {!editing && vehicle && vehicle.status !== "searching" && (
            <label className="flex cursor-pointer items-start gap-2.5 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">
              <input type="checkbox" checked={alsoSearch} onChange={(e) => setAlsoSearch(e.target.checked)} className="mt-0.5 h-4 w-4 accent-rose-600" />
              <span>
                <Siren aria-hidden className="mr-1 inline h-4 w-4 align-[-3px]" />
                <b>{vehicle.name}</b> 상태도 &lsquo;수색 중&rsquo;으로 바꾸기
                <span className="mt-0.5 block text-[13px] text-rose-700/80">
                  QR을 스캔한 사람에게 분실 안내가 보이고 발견 제보를 받을 수 있어요. 바꾸면 이동수단의 도난·분실 이력에 &lsquo;수색 1회&rsquo;가
                  남아서, 나중에 중고로 팔 때 안심거래 화면에서 사는 사람에게도 보여요. 잠깐 둔 곳을 잊은 거라면 끄고 올려도 돼요.
                </span>
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
        <Input label="제목" placeholder={copy.title} value={form.title} onChange={set("title")} error={errors.title} maxLength={60} required />
        <div className="grid gap-3 sm:grid-cols-[1fr_11rem]">
          <Input
            label={meta.place}
            placeholder={copy.place}
            value={form.lost_area}
            onChange={set("lost_area")}
            error={errors.lost_area}
            maxLength={100}
            required
          />
          <Input label={meta.day} type="date" max={todayKst()} value={form.lost_on} onChange={set("lost_on")} error={errors.lost_on} />
        </div>
        <LocationPicker label={`지도에 ${meta.place} 표시 (선택)`} value={pin} onChange={setPin} />
        <div className="grid grid-cols-3 gap-3">
          <Input label="색상" placeholder="검정" value={form.color} onChange={set("color")} maxLength={30} />
          <Input label="브랜드" placeholder="삼천리" value={form.brand} onChange={set("brand")} maxLength={40} />
          <Input label="모델" placeholder="하운드" value={form.model} onChange={set("model")} maxLength={40} />
        </div>
        <Textarea
          label="자세한 내용"
          placeholder={copy.body}
          hint={copy.bodyHint}
          value={form.body}
          onChange={set("body")}
          error={errors.body}
          maxLength={2000}
          rows={6}
          required
        />
      </Card>

      <Card>
        {keptImageUrl && !photo ? (
          <div className="space-y-1.5">
            <p className="text-sm font-semibold text-ink-soft">사진</p>
            <img src={keptImageUrl} alt="지금 글에 붙은 사진" className="aspect-[4/3] w-full rounded-xl object-cover ring-1 ring-line" />
            <div className="grid grid-cols-2 gap-2 pt-1">
              <Button variant="secondary" onClick={() => setRemoveCurrent(true)}>
                사진 지우기
              </Button>
              <label className={cn(buttonClass("secondary"), "cursor-pointer")}>
                사진 바꾸기
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => {
                    setPhoto(e.target.files?.[0] ?? null);
                    setErrors((x) => ({ ...x, photo: undefined }));
                  }}
                />
              </label>
            </div>
            {errors.photo && (
              <p role="alert" className="text-[13px] text-rose-600">
                {errors.photo}
              </p>
            )}
          </div>
        ) : (
          <PhotoPicker
            label="사진 (선택)"
            hint={!editing && vehicle?.image_path ? "안 고르면 등록된 이동수단 사진을 써요." : "전체가 잘 보이는 사진이 있으면 알아보기 쉬워요."}
            value={photo}
            onChange={(f) => {
              setPhoto(f);
              setErrors((x) => ({ ...x, photo: undefined }));
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
      {editing ? (
        <Button type="submit" full size="lg" loading={loading} loadingText="저장하는 중..." icon={<Save aria-hidden className="h-5 w-5" />}>
          고친 내용 저장
        </Button>
      ) : (
        <Button type="submit" full size="lg" loading={loading} loadingText="올리는 중..." icon={<Send aria-hidden className="h-5 w-5" />}>
          {kind === "found" ? "발견 글 올리기" : "분실 글 올리기"}
        </Button>
      )}
    </form>
  );
}
