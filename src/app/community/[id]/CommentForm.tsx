"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Crosshair, Lock, MapPin, Send, X } from "lucide-react";
import { Button, Card, Input, Textarea, useToast } from "@/components/ui";
import { PhotoPicker } from "@/components/ui/PhotoPicker";
import { cn } from "@/lib/cn";
import { friendlyError } from "@/lib/format";
import { uploadPhoto } from "@/lib/images";
import { useCurrentLocation } from "@/lib/location";
import { createClient } from "@/lib/supabase/client";

/** 댓글 쓰기: 본 위치(현재 위치 또는 직접 입력)·사진·비밀 댓글 */
export function CommentForm({ postId, isAuthor }: { postId: string; isAuthor: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const loc = useCurrentLocation();
  const [body, setBody] = useState("");
  const [secret, setSecret] = useState(false);
  const [showExtras, setShowExtras] = useState(false);
  const [locationText, setLocationText] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [errors, setErrors] = useState<{ body?: string; photo?: string; form?: string }>({});
  const [loading, setLoading] = useState(false);

  function reset() {
    setBody("");
    setSecret(false);
    setShowExtras(false);
    setLocationText("");
    setPhoto(null);
    loc.clear();
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) {
      setErrors({ body: "내용을 적어 주세요." });
      return;
    }
    setErrors({});
    setLoading(true);
    const supabase = createClient();
    // 비밀 댓글 사진은 비공개 저장소에 올려서 글쓴이만 볼 수 있게 합니다.
    const bucket = secret ? "community-secret" : "community-images";
    let uploaded: string | null = null;
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace(`/login?next=/community/${postId}`);
        return;
      }
      if (photo) {
        try {
          uploaded = await uploadPhoto(supabase, bucket, user.id, photo);
        } catch (err) {
          setErrors({ photo: err instanceof Error ? err.message : "사진을 처리하지 못했어요." });
          return;
        }
      }
      const { error } = await supabase.from("post_comments").insert({
        post_id: postId,
        body: body.trim(),
        is_secret: secret,
        latitude: loc.coords?.lat ?? null,
        longitude: loc.coords?.lng ?? null,
        location_text: locationText.trim() || null,
        image_path: uploaded,
      });
      if (error) throw error;
      toast.success(secret ? "비밀 댓글을 남겼어요. 글쓴이에게만 보여요." : "댓글을 남겼어요.");
      reset();
      router.refresh();
    } catch (err) {
      console.error(err);
      if (uploaded) await supabase.storage.from(bucket).remove([uploaded]);
      setErrors({ form: friendlyError(err, "댓글을 남기지 못했어요. 잠시 후 다시 시도해 주세요.") });
      toast.error("댓글을 남기지 못했어요.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="space-y-4">
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <Textarea
          label={isAuthor ? "댓글" : "봤다면 알려 주세요"}
          placeholder={isAuthor ? "예) 알려 주셔서 고마워요! 지금 가 볼게요." : "예) 오늘 오후 2시쯤 ○○역 앞 거치대에서 비슷한 자전거를 봤어요."}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          error={errors.body}
          maxLength={1000}
          rows={3}
        />

        {!isAuthor && (
          <label
            className={cn(
              "flex cursor-pointer items-start gap-2.5 rounded-xl p-3 text-sm ring-1 transition-colors",
              secret ? "bg-amber-50 text-amber-900 ring-amber-300" : "bg-slate-50 text-ink-soft ring-line",
            )}
          >
            <input type="checkbox" checked={secret} onChange={(e) => setSecret(e.target.checked)} className="mt-0.5 h-4 w-4 accent-amber-600" />
            <span>
              <Lock aria-hidden className="mr-1 inline h-4 w-4 align-[-3px]" />
              <b>비밀 댓글</b>로 남기기
              <span className="mt-0.5 block text-[13px] opacity-80">글쓴이(주인)에게만 내용·위치·사진이 보여요. 정확한 위치를 알려 줄 때 써 주세요.</span>
            </span>
          </label>
        )}

        {showExtras ? (
          <div className="space-y-4 rounded-xl border border-line p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-ink-soft">본 위치 · 사진</p>
              <button
                type="button"
                onClick={() => {
                  setShowExtras(false);
                  setLocationText("");
                  setPhoto(null);
                  loc.clear();
                }}
                className="-m-2 grid h-9 w-9 place-items-center rounded-full text-ink-muted hover:bg-slate-100"
                aria-label="위치·사진 지우기"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {loc.coords ? (
              <div className="flex items-start gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800 ring-1 ring-emerald-200">
                <MapPin aria-hidden className="mt-0.5 h-4 w-4 flex-none" />
                <span>
                  현재 위치를 함께 보내요 (오차 약 {loc.coords.accuracy}m)
                  <button type="button" onClick={loc.clear} className="ml-2 font-semibold underline">
                    빼기
                  </button>
                </span>
              </div>
            ) : (
              <Button variant="secondary" full loading={loc.locating} loadingText="위치 확인 중..." icon={<Crosshair aria-hidden className="h-4 w-4" />} onClick={loc.locate}>
                지금 위치 공유
              </Button>
            )}
            {loc.error && <p className="text-sm text-orange-700">{loc.error}</p>}
            <Input
              label="장소 설명"
              placeholder="예) ○○역 2번 출구 자전거 거치대"
              value={locationText}
              onChange={(e) => setLocationText(e.target.value)}
              maxLength={200}
            />
            <PhotoPicker
              label="사진"
              value={photo}
              onChange={(f) => {
                setPhoto(f);
                setErrors((x) => ({ ...x, photo: undefined }));
              }}
              error={errors.photo}
            />
          </div>
        ) : (
          <Button variant="ghost" full icon={<MapPin aria-hidden className="h-4 w-4" />} onClick={() => setShowExtras(true)}>
            본 위치·사진 추가
          </Button>
        )}

        {errors.form && (
          <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
            {errors.form}
          </p>
        )}
        <Button type="submit" full size="lg" loading={loading} loadingText="남기는 중..." icon={secret ? <Lock aria-hidden className="h-5 w-5" /> : <Send aria-hidden className="h-5 w-5" />}>
          {secret ? "비밀 댓글 남기기" : "댓글 남기기"}
        </Button>
      </form>
    </Card>
  );
}
