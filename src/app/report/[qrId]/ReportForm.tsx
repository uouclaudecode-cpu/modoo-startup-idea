"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Crosshair, MapPin, Send } from "lucide-react";
import { Button, Card, Input, Textarea, useToast } from "@/components/ui";
import { PhotoPicker } from "@/components/ui/PhotoPicker";
import { friendlyError } from "@/lib/format";
import { prepareImage } from "@/lib/images";
import { createClient } from "@/lib/supabase/client";

type Coords = { lat: number; lng: number; accuracy: number };

export function ReportForm({ token, mode }: { token: string; mode: "found" | "contact" }) {
  const router = useRouter();
  const toast = useToast();
  const [coords, setCoords] = useState<Coords | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [locationText, setLocationText] = useState("");
  const [description, setDescription] = useState("");
  const [contact, setContact] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [errors, setErrors] = useState<{ description?: string; photo?: string; location?: string; form?: string }>({});
  const [loading, setLoading] = useState(false);

  /** 브라우저 위치 권한으로 현재 위치 가져오기 (실시간 추적이 아니라 지금 한 번만) */
  function locate() {
    setLocationError("");
    if (!navigator.geolocation) {
      setLocationError("위치 권한을 사용할 수 없습니다. 위치를 직접 입력해주세요.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy) });
        setLocating(false);
      },
      () => {
        setLocating(false);
        setLocationError("위치 권한을 사용할 수 없습니다. 위치를 직접 입력해주세요.");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs: typeof errors = {};
    if (!description.trim()) errs.description = mode === "contact" ? "전할 말을 적어 주세요." : "발견 상황을 적어 주세요.";
    if (mode === "found" && !coords && !locationText.trim()) errs.location = "현재 위치를 가져오거나 위치를 직접 입력해 주세요.";
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setLoading(true);
    const supabase = createClient();
    let imagePath: string | null = null;
    try {
      if (photo) {
        let blob: Blob;
        try {
          blob = await prepareImage(photo);
        } catch (err) {
          setErrors({ photo: err instanceof Error ? err.message : "사진을 처리하지 못했어요." });
          return;
        }
        imagePath = `reports/${crypto.randomUUID()}.jpg`;
        const { error: upErr } = await supabase.storage.from("report-images").upload(imagePath, blob, { contentType: "image/jpeg" });
        if (upErr) {
          console.error(upErr);
          setErrors({ photo: "사진 업로드에 실패했습니다. 다시 시도해주세요." });
          return;
        }
      }
      const { error } = await supabase.rpc("submit_report", {
        p_token: token,
        p_kind: mode,
        p_description: description.trim(),
        p_latitude: coords?.lat ?? null,
        p_longitude: coords?.lng ?? null,
        p_location_text: locationText.trim() || null,
        p_image_path: imagePath,
        p_contact: contact.trim() || null,
      });
      if (error) throw error;
      router.replace(`/report/${encodeURIComponent(token)}/done?kind=${mode}`);
    } catch (err) {
      console.error(err);
      setErrors({ form: friendlyError(err, "제보를 보내지 못했습니다. 잠시 후 다시 시도해 주세요.") });
      toast.error("제보를 보내지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
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
                <p className="mt-0.5 font-mono text-[13px]">
                  위도 {coords.lat.toFixed(5)}, 경도 {coords.lng.toFixed(5)} (오차 약 {coords.accuracy}m)
                </p>
              </div>
            </div>
          ) : (
            <Button variant="secondary" full loading={locating} loadingText="위치 확인 중..." icon={<Crosshair aria-hidden className="h-4 w-4" />} onClick={locate}>
              현재 위치 가져오기
            </Button>
          )}
          {locationError && <p className="text-sm text-orange-700">{locationError}</p>}
          <Input
            label="장소 설명"
            placeholder="예) 울산대학교 학생회관 뒤쪽 자전거 거치대"
            value={locationText}
            onChange={(e) => setLocationText(e.target.value)}
            error={errors.location}
            maxLength={200}
          />
        </Card>
      )}

      <Card className="space-y-4">
        <Textarea
          label={mode === "contact" ? "전할 말" : "설명"}
          placeholder={mode === "contact" ? "예) 자전거가 쓰러져 있어서 세워 두었어요." : "예) 울산대학교 학생회관 뒤쪽에 세워져 있었습니다."}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          error={errors.description}
          maxLength={1000}
          rows={4}
          required
        />
        {mode === "found" && (
          <PhotoPicker
            label="사진 (선택)"
            hint="발견한 이동수단 사진이 있으면 소유자가 확인하기 쉬워요."
            value={photo}
            onChange={(f) => {
              setPhoto(f);
              setErrors((x) => ({ ...x, photo: undefined }));
            }}
            error={errors.photo}
          />
        )}
        <Input
          label="연락처 (선택)"
          placeholder="소유자가 연락하길 원하면 전화번호나 이메일"
          hint="적지 않아도 제보할 수 있어요. 적은 연락처는 소유자에게만 보여요."
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          maxLength={100}
        />
      </Card>

      {errors.form && (
        <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
          {errors.form}
        </p>
      )}
      <Button type="submit" full size="lg" loading={loading} loadingText="보내는 중..." icon={<Send aria-hidden className="h-5 w-5" />}>
        {mode === "contact" ? "소유자에게 보내기" : "발견 제보 보내기"}
      </Button>
    </form>
  );
}
