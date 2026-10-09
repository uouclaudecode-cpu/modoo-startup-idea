"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Crosshair, MapPin, MessageCircle, PhoneCall, Send, BellOff, Zap } from "lucide-react";
import { Button, Card, Input, Textarea, useToast } from "@/components/ui";
import { PhotoPicker } from "@/components/ui/PhotoPicker";
import { saveFinderThread } from "@/lib/finderThreads";
import { friendlyError } from "@/lib/format";
import { prepareImage } from "@/lib/images";
import { createClient } from "@/lib/supabase/client";

type Coords = { lat: number; lng: number; accuracy: number };
type ContactMode = "chat" | "callback" | "none";

const MODES: { value: ContactMode; label: string; desc: string; Icon: typeof MessageCircle }[] = [
  { value: "chat", label: "익명 대화", desc: "번호 없이 앱에서 주인과 대화해요", Icon: MessageCircle },
  { value: "callback", label: "콜백 요청", desc: "내 번호를 남기면 주인이 전화해요", Icon: PhoneCall },
  { value: "none", label: "연락 안 받기", desc: "알리기만 하고 끝내요", Icon: BellOff },
];

/** 브라우저 위치 권한으로 지금 위치를 한 번만 (실시간 추적 아님) */
function getPosition(): Promise<Coords> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("위치 권한을 사용할 수 없어요. 위치를 직접 입력해 주세요."));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy) }),
      () => reject(new Error("위치 권한을 사용할 수 없어요. 위치를 직접 입력해 주세요.")),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  });
}

export function ReportForm({ token, mode, vehicleLabel }: { token: string; mode: "found" | "contact"; vehicleLabel?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [coords, setCoords] = useState<Coords | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [locationText, setLocationText] = useState("");
  const [description, setDescription] = useState("");
  const [contactMode, setContactMode] = useState<ContactMode>("chat");
  const [contact, setContact] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [errors, setErrors] = useState<{ description?: string; photo?: string; location?: string; contact?: string; form?: string }>({});
  const [loading, setLoading] = useState(false);
  const [quick, setQuick] = useState(false);

  async function locate() {
    setLocationError("");
    setLocating(true);
    try {
      setCoords(await getPosition());
    } catch (e) {
      setLocationError((e as Error).message);
    } finally {
      setLocating(false);
    }
  }

  async function send(opts: { coords: Coords | null; description: string; photo: File | null; contactMode: ContactMode; contact: string }) {
    const supabase = createClient();
    let imagePath: string | null = null;
    if (opts.photo) {
      let blob: Blob;
      try {
        blob = await prepareImage(opts.photo);
      } catch (err) {
        throw new Error(err instanceof Error ? err.message : "사진을 처리하지 못했어요.");
      }
      imagePath = `reports/${crypto.randomUUID()}.jpg`;
      const { error: upErr } = await supabase.storage.from("report-images").upload(imagePath, blob, { contentType: "image/jpeg" });
      if (upErr) {
        console.error(upErr);
        throw new Error("사진 업로드에 실패했어요. 다시 시도해 주세요.");
      }
    }
    const { data, error } = await supabase.rpc("submit_report_v2", {
      p_token: token,
      p_kind: mode,
      p_description: opts.description,
      p_latitude: opts.coords?.lat ?? null,
      p_longitude: opts.coords?.lng ?? null,
      p_location_text: locationText.trim() || null,
      p_image_path: imagePath,
      p_contact: opts.contact.trim() || null,
      p_contact_mode: opts.contactMode,
    });
    if (error) throw error;
    const finderToken = (data as { finder_token: string | null }).finder_token;
    if (finderToken) {
      saveFinderThread({ token: finderToken, createdAt: new Date().toISOString(), label: vehicleLabel ?? "발견 제보" });
      router.replace(`/r#t=${finderToken}`);
    } else {
      router.replace(`/report/${encodeURIComponent(token)}/done?kind=${mode}`);
    }
  }

  /** 원터치: 위치만 바로 알리기 (익명 대화로 이어갈 수 있어요) */
  async function quickSend() {
    setErrors({});
    setQuick(true);
    try {
      const c = coords ?? (await getPosition());
      setCoords(c);
      await send({ coords: c, description: "", photo: null, contactMode: "chat", contact: "" });
    } catch (err) {
      console.error(err);
      const msg = friendlyError(err, "보내지 못했어요. 잠시 후 다시 시도해 주세요.");
      setLocationError(msg);
      toast.error(msg);
    } finally {
      setQuick(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs: typeof errors = {};
    if (mode === "contact" && !description.trim()) errs.description = "전할 말을 적어 주세요.";
    if (mode === "found" && !coords && !locationText.trim()) errs.location = "현재 위치를 가져오거나 위치를 직접 입력해 주세요.";
    if (contactMode === "callback" && contact.trim().length < 4) errs.contact = "콜백 받을 전화번호를 적어 주세요.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setLoading(true);
    try {
      await send({ coords, description: description.trim(), photo, contactMode, contact });
    } catch (err) {
      console.error(err);
      setErrors({ form: friendlyError(err, "제보를 보내지 못했어요. 잠시 후 다시 시도해 주세요.") });
      toast.error("제보를 보내지 못했어요.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {mode === "found" && (
        <Card className="space-y-3 bg-brand-50/60 ring-brand-100">
          <p className="flex items-center gap-1.5 font-bold text-brand-800">
            <Zap aria-hidden className="h-4 w-4" />
            통화나 글쓰기가 곤란하면
          </p>
          <Button full size="lg" loading={quick} loadingText="위치 보내는 중..." icon={<MapPin aria-hidden className="h-5 w-5" />} onClick={quickSend} disabled={loading}>
            📍 위치만 바로 알리기
          </Button>
          <p className="text-[12px] leading-relaxed text-ink-muted">
            누르면 지금 위치를 한 번만 주인에게 보내요. 이름·번호는 보내지 않고, 보낸 뒤 원하면 익명으로 대화할 수 있어요.
          </p>
        </Card>
      )}

      {mode === "found" && (
        <Card className="space-y-4">
          <div>
            <p className="text-sm font-semibold text-ink-soft">
              발견 위치<span className="ml-0.5 text-rose-600">*</span>
            </p>
            <p className="mt-0.5 text-[13px] text-ink-muted">지금 있는 곳의 위치를 한 번만 보내요. 실시간으로 추적하지 않아요.</p>
          </div>
          {coords ? (
            <div className="flex items-start gap-3 rounded-xl bg-emerald-50 p-3 text-emerald-800 ring-1 ring-emerald-200">
              <MapPin aria-hidden className="mt-0.5 h-5 w-5 flex-none" />
              <div className="text-sm">
                <p className="font-semibold">현재 위치를 가져왔어요</p>
                <p className="mt-0.5 text-[13px]">오차 약 {coords.accuracy}m</p>
              </div>
            </div>
          ) : (
            <Button variant="secondary" full loading={locating} loadingText="위치 확인 중..." icon={<Crosshair aria-hidden className="h-4 w-4" />} onClick={locate}>
              현재 위치 가져오기
            </Button>
          )}
          {locationError && <p className="text-sm text-orange-700">{locationError}</p>}
          <Input
            label="장소 설명 (선택)"
            placeholder="예) 울산대학교 학생회관 뒤쪽 자전거 거치대"
            value={locationText}
            onChange={(e) => setLocationText(e.target.value)}
            error={errors.location}
            maxLength={200}
          />
        </Card>
      )}

      <Card className="space-y-4">
        {mode === "found" && (
          <PhotoPicker
            label="사진 (선택)"
            hint="찍기 곤란하면 건너뛰어도 돼요."
            value={photo}
            onChange={(f) => {
              setPhoto(f);
              setErrors((x) => ({ ...x, photo: undefined }));
            }}
            error={errors.photo}
          />
        )}
        <Textarea
          label={mode === "contact" ? "전할 말" : "설명 (선택)"}
          placeholder={mode === "contact" ? "예) 자전거가 쓰러져 있어서 세워 두었어요." : "예) 학생회관 뒤쪽에 세워져 있었어요."}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          error={errors.description}
          maxLength={1000}
          rows={3}
        />
      </Card>

      <Card className="space-y-3">
        <p className="text-sm font-semibold text-ink-soft">주인과 연락하는 방법</p>
        <div className="grid gap-2">
          {MODES.map(({ value, label, desc, Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setContactMode(value)}
              aria-pressed={contactMode === value}
              className={`flex items-center gap-3 rounded-xl p-3 text-left ring-1 ring-inset transition-colors ${contactMode === value ? "bg-brand-50 ring-brand-500" : "bg-white ring-line hover:bg-slate-50"}`}
            >
              <Icon aria-hidden className={`h-5 w-5 flex-none ${contactMode === value ? "text-brand-600" : "text-ink-muted"}`} />
              <span className="min-w-0">
                <span className="block font-semibold">{label}</span>
                <span className="block text-[13px] text-ink-muted">{desc}</span>
              </span>
            </button>
          ))}
        </div>
        {contactMode === "callback" && (
          <Input
            label="콜백 받을 전화번호"
            type="tel"
            inputMode="tel"
            placeholder="010-0000-0000"
            hint="이 번호는 이 이동수단의 주인에게만 보여요."
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            error={errors.contact}
            maxLength={100}
          />
        )}
      </Card>

      {errors.form && (
        <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
          {errors.form}
        </p>
      )}
      <Button type="submit" full size="lg" loading={loading} loadingText="보내는 중..." icon={<Send aria-hidden className="h-5 w-5" />} disabled={quick}>
        {mode === "contact" ? "소유자에게 보내기" : "발견 제보 보내기"}
      </Button>
    </form>
  );
}
