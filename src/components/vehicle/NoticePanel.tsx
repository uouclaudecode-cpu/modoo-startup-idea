"use client";

import Link from "next/link";
import { useState } from "react";
import { BellRing, Camera, CircleCheck, MessageCircle, Phone } from "lucide-react";
import { Button, Card, Modal, Textarea } from "@/components/ui";
import { PhotoPicker } from "@/components/ui/PhotoPicker";
import { cn } from "@/lib/cn";
import { saveFinderThread } from "@/lib/finderThreads";
import { friendlyError } from "@/lib/format";
import { prepareImage } from "@/lib/images";
import { deviceId, NOTICE_GROUPS, type NoticeInfo } from "@/lib/notices";
import { createClient } from "@/lib/supabase/client";

type Sent = { merged: boolean; count?: number; again?: boolean; finderToken?: string | null };

/**
 * QR을 찍은 누구나: 사유를 하나 고르면 주인 휴대폰으로 바로 알림이 가요. (로그인 필요 없음, 주인 정보는 안 보여요)
 * 고른 뒤 짧은 말·사진을 붙이거나, 주인의 답장을 받을 수 있어요.
 */
export function NoticePanel({ token, vehicleLabel }: { token: string; vehicleLabel: string }) {
  const [picked, setPicked] = useState<NoticeInfo | null>(null);
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  // 사진 칸은 원하는 사람만 펼쳐요 (알리기 버튼이 아래로 밀리지 않게)
  const [showPhoto, setShowPhoto] = useState(false);
  const [wantReply, setWantReply] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState<Sent | null>(null);

  function open(r: NoticeInfo) {
    setPicked(r);
    setNote("");
    setPhoto(null);
    setShowPhoto(false);
    setError("");
    setSent(null);
  }

  async function send() {
    if (!picked) return;
    if (picked.value === "other" && !note.trim()) return setError("주인에게 전할 말을 적어 주세요.");
    setSending(true);
    setError("");
    const supabase = createClient();
    try {
      let imagePath: string | null = null;
      if (photo) {
        const img = await prepareImage(photo);
        imagePath = `reports/${crypto.randomUUID()}.${img.ext}`;
        const { error: upErr } = await supabase.storage.from("report-images").upload(imagePath, img.blob, { contentType: img.type });
        if (upErr) {
          console.error(upErr);
          throw new Error("사진을 올리지 못했어요. 사진 없이 보내거나 다시 시도해 주세요.");
        }
      }
      const { data, error: err } = await supabase.rpc("send_bike_notice", {
        p_token: token,
        p_reason: picked.value,
        p_note: note.trim() || null,
        p_image_path: imagePath,
        p_contact_mode: wantReply ? "chat" : "none",
        p_device: deviceId(),
      });
      if (err) throw err;
      const res = data as { merged: boolean; count?: number; again?: boolean; report_id?: string; finder_token?: string | null };
      if (res.finder_token && res.report_id) {
        saveFinderThread({ token: res.finder_token, reportId: res.report_id, createdAt: new Date().toISOString(), label: `${vehicleLabel} · ${picked.label}` });
      }
      setSent({ merged: res.merged, count: res.count, again: res.again, finderToken: res.finder_token });
    } catch (e) {
      console.error(e);
      setError(friendlyError(e, "보내지 못했어요. 잠시 후 다시 시도해 주세요."));
    } finally {
      setSending(false);
    }
  }

  return (
    <Card className="space-y-4 p-4">
      <div>
        <h2 className="flex items-center gap-1.5 text-lg font-bold">
          <BellRing aria-hidden className="h-5 w-5 text-brand-600" />
          주인에게 알리기
        </h2>
        <p className="mt-0.5 text-[13px] leading-relaxed text-ink-muted">하나만 누르면 주인 휴대폰으로 바로 알림이 가요. 주인 정보도, 내 정보도 서로 보이지 않아요.</p>
      </div>
      {NOTICE_GROUPS.map((g) => (
        <div key={g.title} className="space-y-1.5">
          <p className="text-[12px] font-bold text-ink-muted">{g.title}</p>
          <div className="grid grid-cols-2 gap-2">
            {g.items.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => open(r)}
                className={cn(
                  "flex min-h-14 items-center gap-2 rounded-xl px-3 py-2 text-left text-[14px] font-semibold leading-snug ring-1 ring-inset transition-colors active:scale-[0.98]",
                  r.urgent ? "bg-rose-50 text-rose-800 ring-rose-200 hover:bg-rose-100" : "bg-white text-ink ring-line hover:bg-slate-50",
                )}
              >
                <span aria-hidden className="text-xl">
                  {r.emoji}
                </span>
                <span className="min-w-0 flex-1 break-keep">{r.label}</span>
              </button>
            ))}
          </div>
        </div>
      ))}

      <Modal
        open={Boolean(picked)}
        onClose={() => !sending && setPicked(null)}
        title={sent ? "알렸어요" : "주인에게 알리기"}
        footer={
          sent ? (
            <Button full variant="secondary" onClick={() => setPicked(null)}>
              닫기
            </Button>
          ) : (
            <Button full size="lg" loading={sending} loadingText="보내는 중..." onClick={send}>
              {picked?.urgent ? "지금 바로 알리기" : "알리기"}
            </Button>
          )
        }
      >
        {picked && !sent && (
          <div className="space-y-4">
            <div className={cn("flex items-center gap-3 rounded-2xl p-4", picked.urgent ? "bg-rose-50 text-rose-800" : "bg-slate-50")}>
              <span aria-hidden className="text-3xl">
                {picked.emoji}
              </span>
              <p className="text-[17px] font-bold leading-snug">{picked.label}</p>
            </div>
            {picked.hint && (
              <p className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-[13px] leading-relaxed text-amber-900 ring-1 ring-amber-200">
                <Phone aria-hidden className="mt-0.5 h-4 w-4 flex-none" />
                <span>
                  {picked.hint}{" "}
                  {picked.value === "taking" && (
                    <a href="tel:112" className="font-bold underline">
                      112 전화
                    </a>
                  )}
                </span>
              </p>
            )}
            <Textarea
              label={picked.value === "other" ? "전할 말" : "한마디 더 (선택)"}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={100}
              rows={2}
              placeholder={picked.value === "nice" ? "예) 색이 정말 예뻐요! 잘 타세요" : picked.value === "other" ? "예) 바구니에 우산이 걸려 있어요" : "예) 정문 쪽 계단 앞이에요"}
            />
            {picked.value !== "nice" &&
              (showPhoto ? (
                <PhotoPicker label="사진 (선택)" hint="사진이 있으면 주인이 더 빨리 알아봐요." value={photo} onChange={setPhoto} />
              ) : (
                <button
                  type="button"
                  onClick={() => setShowPhoto(true)}
                  className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-slate-100 px-3.5 text-sm font-semibold text-ink-soft hover:bg-slate-200"
                >
                  <Camera aria-hidden className="h-4 w-4" />
                  사진 붙이기 (선택)
                </button>
              ))}
            <label className="flex min-h-11 items-start gap-2.5 text-[14px] leading-snug">
              <input type="checkbox" checked={wantReply} onChange={(e) => setWantReply(e.target.checked)} className="mt-0.5 h-5 w-5 flex-none rounded accent-brand-600" />
              <span>
                <b>주인의 답장 받기</b>
                <span className="block text-[12px] text-ink-muted">번호 없이 앱 안에서 &ldquo;확인했어요&rdquo; 같은 답장을 받을 수 있어요.</span>
              </span>
            </label>
            {error && <p className="text-[13px] text-rose-600">{error}</p>}
          </div>
        )}
        {picked && sent && (
          <div className="space-y-4 py-2 text-center">
            <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-50 text-emerald-600">
              <CircleCheck aria-hidden className="h-9 w-9" />
            </span>
            {sent.merged ? (
              <p className="text-[15px] leading-relaxed text-ink-soft">
                {sent.again ? "이미 알려 주셨어요." : `다른 분도 방금 같은 내용을 알렸어요. 함께 알려 주셔서 고마워요! (${sent.count ?? 2}명)`}
                <br />
                주인이 곧 확인할 거예요.
              </p>
            ) : (
              <p className="text-[15px] leading-relaxed text-ink-soft">
                <b>{picked.label}</b>
                <br />
                주인에게 알렸어요. 도와주셔서 고마워요! 🙌
              </p>
            )}
            {sent.finderToken && (
              <Link href={`/r#t=${sent.finderToken}`} className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-brand-50 px-4 text-sm font-semibold text-brand-700 hover:bg-brand-100">
                <MessageCircle aria-hidden className="h-4 w-4" />
                주인 답장 보기
              </Link>
            )}
          </div>
        )}
      </Modal>
    </Card>
  );
}
