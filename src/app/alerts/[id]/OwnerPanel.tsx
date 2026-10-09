"use client";

/* eslint-disable @next/next/no-img-element -- 비공개 사진은 서명 주소라 기본 img 사용 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CircleCheck, FileText, Link2, Megaphone, ShieldCheck, Trash2 } from "lucide-react";
import { Scanner } from "@/app/scan/Scanner";
import { MoneyWarning, TrustInfo } from "@/components/alerts/TrustInfo";
import { Button, ButtonLink, Card, Input, Modal, useToast } from "@/components/ui";
import { distanceLabel, hasMoneyRequest, wonLabel, type AlertCard, type Reward, type Sighting, type Trust } from "@/lib/alerts";
import { formatDateTime, friendlyError } from "@/lib/format";
import { kakaoMapLink } from "@/lib/map";
import { extractToken } from "@/lib/qr";
import { createClient } from "@/lib/supabase/client";

const STATUS_LABEL: Record<Sighting["status"], string> = { new: "새 제보", useful: "도움 됨", false: "관련 없음", duplicate: "중복" };
const REWARD_STATUS: Record<Reward["status"], string> = {
  pending: "아직 안 보냄",
  paid: "보냈어요 (제보자 확인 전)",
  confirmed: "제보자가 받음 확인",
  unpaid_reported: "제보자가 '못 받음' 신고",
};

export function OwnerPanel({
  alert,
  sightings,
  rewards,
  trust,
  photos,
}: {
  alert: AlertCard;
  sightings: Sighting[];
  rewards: Reward[];
  trust: Trust[];
  photos: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const active = alert.status === "open" || alert.status === "expired" || alert.status === "hidden";
  const trustOf = (id: string) => trust.find((t) => t.user_id === id) ?? null;
  const [busy, setBusy] = useState("");
  const [resolveOpen, setResolveOpen] = useState(false);
  const [code, setCode] = useState("");
  const [scanned, setScanned] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [resolveError, setResolveError] = useState("");
  const [resolving, setResolving] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  async function mark(s: Sighting, status: Sighting["status"]) {
    setBusy(s.id);
    const { error } = await createClient().rpc("mark_sighting", { p_sighting: s.id, p_status: status });
    setBusy("");
    if (error) {
      console.error(error);
      return toast.error(friendlyError(error, "표시하지 못했어요."));
    }
    router.refresh();
  }

  async function resolve() {
    setResolveError("");
    setResolving(true);
    const check = alert.vehicle.has_sticker ? (extractToken(code) ?? code.trim()) : code.trim();
    const { error } = await createClient().rpc("resolve_theft_alert", { p_alert: alert.id, p_check: check, p_reward_sightings: picked });
    setResolving(false);
    if (error) {
      console.error(error);
      setScanned(false);
      setCode("");
      return setResolveError(friendlyError(error, "처리하지 못했어요."));
    }
    setResolveOpen(false);
    toast.success("다행이에요! 경보를 끝냈어요. 도움 준 분들께 알림을 보냈어요.");
    router.refresh();
  }

  async function cancel() {
    const { error } = await createClient().rpc("cancel_theft_alert", { p_alert: alert.id });
    if (error) {
      console.error(error);
      return toast.error(friendlyError(error, "취소하지 못했어요."));
    }
    setCancelOpen(false);
    toast.success("경보를 취소했어요. 이동수단 상태는 이동수단 화면에서 바꿀 수 있어요.");
    router.refresh();
  }

  async function paid(r: Reward) {
    setBusy(r.id);
    const { error } = await createClient().rpc("update_reward", { p_reward: r.id, p_action: "paid" });
    setBusy("");
    if (error) {
      console.error(error);
      return toast.error(friendlyError(error, "처리하지 못했어요."));
    }
    toast.success("보냈다고 기록했어요. 제보자가 확인하면 끝나요.");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <Card className="grid grid-cols-2 gap-3 text-center">
        <div>
          <p className="text-2xl font-extrabold text-brand-700">{alert.recipients ?? 0}명</p>
          <p className="text-[13px] text-ink-muted">알림 받은 근처 사람</p>
        </div>
        <div>
          <p className="text-2xl font-extrabold text-orange-600">{sightings.length}건</p>
          <p className="text-[13px] text-ink-muted">들어온 제보</p>
        </div>
      </Card>

      <ButtonLink href={`/alerts/${alert.id}/police`} variant="secondary" full size="lg" icon={<FileText aria-hidden className="h-5 w-5" />}>
        112 도난 신고서 만들기 (인쇄·문자)
      </ButtonLink>

      {rewards.length > 0 && (
        <Card className="space-y-3">
          <p className="font-bold">약속한 사례금</p>
          {rewards.map((r) => (
            <div key={r.id} className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 text-[14px]">
              <p className="min-w-0 flex-1">
                <b>{r.amount > 0 ? wonLabel(r.amount) : "사례금 없음"}</b> · {REWARD_STATUS[r.status]}
              </p>
              {r.amount > 0 && (r.status === "pending" || r.status === "unpaid_reported") && (
                <Button variant="secondary" className="h-9 flex-none px-3 text-sm" loading={busy === r.id} onClick={() => paid(r)}>
                  보냈어요
                </Button>
              )}
            </div>
          ))}
          <p className="text-[12px] leading-relaxed text-ink-muted">
            제보자 연락처는 B-LOCK이 공개하지 않아요. 제보 메모에 적힌 방법이나 문의하기로 전달해 주세요. 계좌를 먼저 묻는 사람은 조심하세요.
          </p>
        </Card>
      )}

      <Card className="space-y-3">
        <p className="flex items-center gap-2 font-bold">
          <Megaphone aria-hidden className="h-4 w-4 text-orange-600" />
          들어온 제보
        </p>
        {sightings.length === 0 ? (
          <p className="text-[14px] text-ink-muted">아직 제보가 없어요. 제보가 오면 알림으로 알려 드릴게요.</p>
        ) : (
          <ol className="space-y-3">
            {sightings.map((s, i) => (
              <li key={s.id} className="space-y-2 rounded-xl bg-slate-50 p-3">
                <div className="flex items-start gap-3">
                  {s.photo_path && photos[s.photo_path] ? (
                    <a href={photos[s.photo_path]} target="_blank" rel="noopener noreferrer" className="flex-none">
                      <img src={photos[s.photo_path]} alt={`제보 ${sightings.length - i} 사진`} className="h-20 w-20 rounded-lg object-cover" />
                    </a>
                  ) : null}
                  <div className="min-w-0 flex-1 text-[14px]">
                    <p className="font-bold">
                      #{sightings.length - i} {s.kind === "listing" ? "중고 매물에서 봤어요" : "거리에서 봤어요"}
                      <span className="ml-1.5 text-[12px] font-semibold text-ink-muted">{STATUS_LABEL[s.status]}</span>
                    </p>
                    <p className="text-ink-muted">
                      {formatDateTime(s.seen_at)}
                      {s.distance_m != null ? ` · 경보 지점에서 ${distanceLabel(s.distance_m)}` : ""}
                    </p>
                    {s.lat != null && s.lng != null && (
                      <a href={kakaoMapLink(s.lat, s.lng, "목격 위치")} target="_blank" rel="noopener noreferrer" className="text-brand-700 underline">
                        지도에서 보기
                      </a>
                    )}
                    {s.listing_url && (
                      <p>
                        <a href={s.listing_url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 break-all text-brand-700 underline">
                          <Link2 aria-hidden className="h-3.5 w-3.5 flex-none" />
                          매물 열기
                        </a>
                        {s.price != null && <span className="ml-1.5 text-ink-soft">{s.price.toLocaleString("ko-KR")}원</span>}
                      </p>
                    )}
                    {s.note && <p className="mt-1 whitespace-pre-line">{s.note}</p>}
                  </div>
                </div>
                {hasMoneyRequest(s.note) ? <MoneyWarning trust={trustOf(s.reporter_id)} /> : <TrustInfo trust={trustOf(s.reporter_id)} />}
                {active && (
                  <div className="grid grid-cols-3 gap-2">
                    {(["useful", "false", "duplicate"] as const).map((st) => (
                      <Button
                        key={st}
                        variant={s.status === st ? "primary" : "secondary"}
                        className="h-9 px-2 text-[13px]"
                        disabled={busy === s.id}
                        onClick={() => mark(s, s.status === st ? "new" : st)}
                      >
                        {STATUS_LABEL[st]}
                      </Button>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
      </Card>

      {active ? (
        <div className="space-y-2">
          <Button full size="lg" icon={<CircleCheck aria-hidden className="h-5 w-5" />} onClick={() => { setResolveOpen(true); setScanned(false); setCode(""); setResolveError(""); setPicked(sightings.filter((s) => s.status === "useful").map((s) => s.id)); }}>
            찾았어요 (경보 끝내기)
          </Button>
          <Button variant="ghost" full icon={<Trash2 aria-hidden className="h-4 w-4" />} onClick={() => setCancelOpen(true)}>
            경보 취소
          </Button>
        </div>
      ) : (
        alert.vehicle.id && (
          <ButtonLink href={`/vehicles/${alert.vehicle.id}`} variant="secondary" full>
            이동수단 화면으로
          </ButtonLink>
        )
      )}

      <Modal
        open={resolveOpen}
        onClose={() => !resolving && setResolveOpen(false)}
        title="되찾았나요?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setResolveOpen(false)} disabled={resolving}>
              닫기
            </Button>
            <Button loading={resolving} loadingText="처리 중..." icon={<ShieldCheck aria-hidden className="h-4 w-4" />} onClick={resolve}>
              회수 완료
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {alert.vehicle.has_sticker ? (
            <div className="space-y-2">
              <p className="text-[14px] leading-relaxed text-ink-soft">되찾은 이동수단의 숨은 스티커를 찍어 주세요. 실제로 되찾았는지 확인해요.</p>
              {scanned ? (
                <p className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-[14px] font-semibold text-emerald-800">
                  <CircleCheck aria-hidden className="h-5 w-5" />
                  스티커를 읽었어요.
                </p>
              ) : (
                <Scanner hideManual onToken={(t) => { setCode(t); setScanned(true); }} />
              )}
            </div>
          ) : alert.vehicle.has_serial ? (
            <Input label="차대번호 (프레임·시리얼 번호 전체)" hint="자전거는 페달 사이 프레임 아랫면, 킥보드는 발판 아래·핸들 기둥에 새겨진 영문·숫자예요" maxLength={40} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
          ) : (
            <p className="text-[14px] text-ink-soft">스티커·차대번호가 없어 바로 끝낼 수 있어요.</p>
          )}
          {sightings.filter((s) => s.status !== "false").length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-semibold">도움이 된 제보 고르기{alert.bounty_amount ? ` (사례금 ${wonLabel(alert.bounty_amount)}을 나눠요)` : ""}</p>
              {sightings
                .filter((s) => s.status !== "false")
                .map((s) => (
                  <label key={s.id} className="flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-[14px]">
                    <input
                      type="checkbox"
                      className="h-5 w-5 accent-brand-600"
                      checked={picked.includes(s.id)}
                      onChange={(e) => setPicked((p) => (e.target.checked ? [...p, s.id] : p.filter((x) => x !== s.id)))}
                    />
                    #{sightings.length - sightings.indexOf(s)} {s.kind === "listing" ? "중고 매물" : "거리 목격"} · {formatDateTime(s.seen_at)}
                  </label>
                ))}
            </div>
          )}
          {resolveError && (
            <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
              {resolveError}
            </p>
          )}
        </div>
      </Modal>

      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="경보를 취소할까요?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCancelOpen(false)}>
              닫기
            </Button>
            <Button variant="danger" onClick={cancel}>
              경보 취소
            </Button>
          </>
        }
      >
        <p className="text-[15px] leading-relaxed text-ink-soft">더 이상 근처 사람들에게 보이지 않아요. 되찾았다면 취소 대신 &lsquo;찾았어요&rsquo;를 눌러 도움 준 분들께 알려 주세요.</p>
      </Modal>
    </div>
  );
}
