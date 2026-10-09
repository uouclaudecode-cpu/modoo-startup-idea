"use client";

/* eslint-disable @next/next/no-img-element -- 비공개 사진은 서명 주소라 기본 img 사용 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Flag, Link2, LocateFixed, Send, Store, Eye } from "lucide-react";
import { Button, Card, Input, Modal, Textarea, useToast } from "@/components/ui";
import { PhotoPicker } from "@/components/ui/PhotoPicker";
import { distanceLabel, wonLabel, type AlertCard, type Reward, type Sighting } from "@/lib/alerts";
import { formatDateTime, friendlyError } from "@/lib/format";
import { uploadPhoto } from "@/lib/images";
import { useCurrentLocation } from "@/lib/location";
import { createClient } from "@/lib/supabase/client";

const SIGHTING_STATUS: Record<Sighting["status"], string> = { new: "주인 확인 전", useful: "도움 됨 🙌", false: "관련 없음", duplicate: "중복" };
const REWARD_STATUS: Record<Reward["status"], string> = {
  pending: "주인이 보내기 전",
  paid: "주인이 보냈다고 했어요",
  confirmed: "받음 확인",
  unpaid_reported: "못 받음 신고",
};

export function ReporterPanel({ alert, mySightings, myRewards, photos }: { alert: AlertCard; mySightings: Sighting[]; myRewards: Reward[]; photos: Record<string, string> }) {
  const router = useRouter();
  const toast = useToast();
  const open = alert.status === "open";
  const [kind, setKind] = useState<"street" | "listing">("street");
  const [photo, setPhoto] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [price, setPrice] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const loc = useCurrentLocation();
  const [flagOpen, setFlagOpen] = useState(false);
  const [flagReason, setFlagReason] = useState("");
  const [busyReward, setBusyReward] = useState("");

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (kind === "street") {
      if (!photo) return setError("본 자전거·킥보드 사진을 한 장 찍어 주세요.");
      if (!loc.coords) return setError("'지금 위치 넣기'를 눌러 주세요.");
    } else if (!/^https?:\/\/\S+$/i.test(url.trim())) {
      return setError("매물 주소(https://…)를 붙여넣어 주세요.");
    }
    setSending(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("로그인이 만료됐어요. 다시 로그인해 주세요.");
      const path = photo ? await uploadPhoto(supabase, "sighting-images", user.id, photo) : null;
      const { error: err } = await supabase.rpc("submit_sighting", {
        p_alert: alert.id,
        p_kind: kind,
        p_lat: kind === "street" ? loc.coords!.lat : null,
        p_lng: kind === "street" ? loc.coords!.lng : null,
        p_accuracy: kind === "street" ? loc.coords!.accuracy : null,
        p_photo: path,
        p_url: kind === "listing" ? url.trim() : null,
        p_price: kind === "listing" && price ? Number(price.replace(/\D/g, "")) : null,
        p_note: note.trim() || null,
        p_seen_at: new Date().toISOString(),
      });
      if (err) throw err;
      toast.success("제보를 보냈어요. 주인에게 바로 알림이 갔어요. 고마워요!");
      setPhoto(null);
      setUrl("");
      setPrice("");
      setNote("");
      loc.clear();
      router.refresh();
    } catch (err) {
      console.error(err);
      setError(friendlyError(err, "제보를 보내지 못했어요. 잠시 후 다시 시도해 주세요."));
    } finally {
      setSending(false);
    }
  }

  async function flag() {
    const { error: err } = await createClient().rpc("flag_alert", { p_alert: alert.id, p_reason: flagReason.trim() || null });
    if (err) {
      console.error(err);
      return toast.error(friendlyError(err, "신고하지 못했어요."));
    }
    setFlagOpen(false);
    toast.success("신고했어요. 여러 명이 신고하면 경보를 숨기고 운영자가 확인해요.");
  }

  async function reward(r: Reward, action: "confirm" | "unpaid") {
    setBusyReward(r.id);
    const { error: err } = await createClient().rpc("update_reward", { p_reward: r.id, p_action: action });
    setBusyReward("");
    if (err) {
      console.error(err);
      return toast.error(friendlyError(err, "처리하지 못했어요."));
    }
    toast.success(action === "confirm" ? "받음을 확인했어요. 고마워요!" : "못 받았다고 기록했어요. 주인 프로필에 미지급 기록이 남아요.");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {myRewards.length > 0 && (
        <Card className="space-y-3">
          <p className="font-bold">🙌 내 제보가 회수에 도움이 됐어요</p>
          {myRewards.map((r) => (
            <div key={r.id} className="space-y-2 rounded-xl bg-slate-50 p-3 text-[14px]">
              <p>
                사례금 <b>{r.amount > 0 ? wonLabel(r.amount) : "없음"}</b> · {REWARD_STATUS[r.status]}
              </p>
              {r.amount > 0 && r.status !== "confirmed" && (
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="secondary" loading={busyReward === r.id} onClick={() => reward(r, "confirm")}>
                    받았어요
                  </Button>
                  <Button variant="ghost" disabled={busyReward === r.id || r.status === "unpaid_reported"} onClick={() => reward(r, "unpaid")}>
                    못 받았어요
                  </Button>
                </div>
              )}
            </div>
          ))}
        </Card>
      )}

      {open && (
        <Card>
          <form onSubmit={send} className="space-y-4" noValidate>
            <p className="font-bold">비슷한 걸 봤나요?</p>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["street", "거리에서 봤어요", Eye],
                  ["listing", "중고 매물에서 봤어요", Store],
                ] as const
              ).map(([k, label, Icon]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    setKind(k);
                    setError("");
                  }}
                  aria-pressed={kind === k}
                  className={`flex h-12 items-center justify-center gap-1.5 rounded-xl text-[14px] font-semibold ring-1 ring-inset transition-colors ${kind === k ? "bg-brand-600 text-white ring-brand-600" : "bg-white text-ink ring-line hover:bg-slate-50"}`}
                >
                  <Icon aria-hidden className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>

            {kind === "street" ? (
              <>
                <PhotoPicker label="지금 찍은 사진 (필수)" hint="이동수단만 찍어 주세요. 사람 얼굴은 찍지 않아도 돼요." value={photo} onChange={setPhoto} />
                <div className="space-y-1.5">
                  <Button variant="secondary" full loading={loc.locating} loadingText="위치 찾는 중..." icon={<LocateFixed aria-hidden className="h-4 w-4" />} onClick={loc.locate}>
                    {loc.coords ? `위치 넣음 (정확도 ±${loc.coords.accuracy}m)` : "지금 위치 넣기"}
                  </Button>
                  {loc.error && <p className="text-[13px] text-rose-700">{loc.error}</p>}
                </div>
              </>
            ) : (
              <>
                <Input
                  label="매물 주소"
                  placeholder="당근·번개장터·중고나라 글 주소"
                  inputMode="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
                <Input label="판매 가격 (선택)" inputMode="numeric" placeholder="예: 150000" value={price} onChange={(e) => setPrice(e.target.value)} />
                <PhotoPicker label="매물 캡처 (선택)" hint="글이 지워져도 남도록 캡처를 같이 올려 주세요." value={photo} onChange={setPhoto} />
                <p className="rounded-xl bg-orange-50 p-3 text-[13px] leading-relaxed text-orange-900">
                  판매자에게 따지거나 혼자 만나러 가지 마세요. 링크는 주인에게만 보여요.
                </p>
              </>
            )}
            <Textarea label="한 줄 메모 (선택)" placeholder="예: 정문 앞 거치대, 흰 림 같아요" value={note} maxLength={300} rows={2} onChange={(e) => setNote(e.target.value)} />
            {error && (
              <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
                {error}
              </p>
            )}
            <Button type="submit" full size="lg" loading={sending} loadingText="보내는 중..." icon={<Send aria-hidden className="h-5 w-5" />}>
              주인에게 제보 보내기
            </Button>
            <p className="text-center text-[12px] text-ink-muted">주인에게 내 이름·이메일은 보이지 않아요. 닉네임 대신 신뢰 정보(도운 횟수 등)만 보여요.</p>
          </form>
        </Card>
      )}

      {mySightings.length > 0 && (
        <Card className="space-y-3">
          <p className="font-bold">내가 보낸 제보</p>
          {mySightings.map((s) => (
            <div key={s.id} className="flex gap-3 rounded-xl bg-slate-50 p-3 text-[14px]">
              {s.photo_path && photos[s.photo_path] && <img src={photos[s.photo_path]} alt="" className="h-16 w-16 flex-none rounded-lg object-cover" />}
              <div className="min-w-0">
                <p className="font-semibold">
                  {s.kind === "listing" ? "중고 매물" : "거리 목격"} · {SIGHTING_STATUS[s.status]}
                </p>
                <p className="text-ink-muted">
                  {formatDateTime(s.created_at)}
                  {s.distance_m != null ? ` · 경보 지점에서 ${distanceLabel(s.distance_m)}` : ""}
                </p>
                {s.listing_url && (
                  <a href={s.listing_url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-brand-700 underline">
                    <Link2 aria-hidden className="h-3.5 w-3.5" />
                    매물 보기
                  </a>
                )}
              </div>
            </div>
          ))}
        </Card>
      )}

      <button type="button" onClick={() => setFlagOpen(true)} className="mx-auto flex items-center gap-1 text-[13px] text-ink-muted underline">
        <Flag aria-hidden className="h-3.5 w-3.5" />이 경보가 이상해요
      </button>
      <Modal
        open={flagOpen}
        onClose={() => setFlagOpen(false)}
        title="경보 신고"
        footer={
          <>
            <Button variant="ghost" onClick={() => setFlagOpen(false)}>
              취소
            </Button>
            <Button variant="danger" onClick={flag}>
              신고하기
            </Button>
          </>
        }
      >
        <Textarea label="이유 (선택)" placeholder="예: 남의 자전거 같아요, 장난 경보 같아요" value={flagReason} maxLength={200} rows={3} onChange={(e) => setFlagReason(e.target.value)} />
      </Modal>
    </div>
  );
}
