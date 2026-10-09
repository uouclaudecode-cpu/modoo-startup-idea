import type { Metadata } from "next";
import { CircleAlert, RotateCw, ShieldCheck } from "lucide-react";
import { Card, ErrorState, buttonClass } from "@/components/ui";
import { evidenceLabel, type EvidenceKind } from "@/lib/evidence";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { typeLabel, type VehicleType } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "소유 증명서 진위 확인", robots: { index: false, follow: false } };

type Cert =
  | { valid: false; reason: "not_found" | "deleted" | "owner_changed"; issued_at?: string }
  | {
      valid: true;
      issued_at: string;
      vehicle: { type: VehicleType; brand: string | null; model: string | null; color: string | null };
      owner: string;
      registered_at: string;
      owned_since: string | null;
      serial_last4: string | null;
      status: string;
      sticker_attached: boolean;
      evidence: Partial<Record<EvidenceKind, number>>;
      transfer_count: number;
    };

const REASON = {
  not_found: "B-LOCK에서 발급한 증명서가 아니에요. 위조됐을 수 있어요.",
  deleted: "발급 뒤 이동수단이 삭제됐어요.",
  owner_changed: "발급 뒤 소유자가 바뀌어 이 증명서는 더 이상 유효하지 않아요.",
};
const STATUS: Record<string, string> = { active: "정상", searching: "분실·도난 수색 중", recovered: "회수 완료" };

export default async function CertificateVerifyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let c: Cert = { valid: false, reason: "not_found" };
  if (/^[A-Za-z0-9_-]{16,40}$/.test(token)) {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_certificate", { p_token: token });
    if (error) {
      // 서버·연결 문제는 '위조됐을 수 있어요'와 구분해서 보여줘요 (진짜 증명서를 가짜로 오해하지 않게)
      console.error(error);
      return (
        <div className="mx-auto max-w-md">
          <ErrorState
            title="증명서 정보를 불러오지 못했어요"
            description="증명서가 잘못됐다는 뜻은 아니에요. 인터넷 연결을 확인하고 잠시 후 다시 시도해 주세요."
            action={
              <a href={`/c/${encodeURIComponent(token)}`} className={buttonClass("primary", "md", true)}>
                <RotateCw aria-hidden className="h-4 w-4" />
                다시 시도
              </a>
            }
          />
        </div>
      );
    }
    if (data) c = data as Cert;
  }
  if (!c.valid) {
    return (
      <Card className="mx-auto flex max-w-md flex-col items-center gap-3 py-10 text-center">
        <CircleAlert aria-hidden className="h-12 w-12 text-rose-600" />
        <p className="text-xl font-extrabold">유효하지 않은 증명서</p>
        <p className="text-[15px] leading-relaxed text-ink-soft">{REASON[c.reason] ?? REASON.not_found}</p>
      </Card>
    );
  }
  const ev = Object.entries(c.evidence ?? {}) as [EvidenceKind, number][];
  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="flex items-center gap-3 rounded-2xl bg-emerald-600 p-4 text-white shadow-lift">
        <ShieldCheck aria-hidden className="h-8 w-8 flex-none" />
        <div>
          <p className="text-lg font-extrabold">B-LOCK이 발급한 유효한 증명서</p>
          <p className="text-[13px] text-emerald-50">발급 {formatDateTime(c.issued_at)}</p>
        </div>
      </div>
      <Card className="space-y-2 text-[15px]">
        <p>
          <span className="text-ink-muted">이동수단</span> · {typeLabel(c.vehicle.type)} {[c.vehicle.color, c.vehicle.brand, c.vehicle.model].filter(Boolean).join(" ")}
        </p>
        <p>
          <span className="text-ink-muted">등록 소유자</span> · {c.owner}
        </p>
        <p>
          <span className="text-ink-muted">B-LOCK 등록</span> · {formatDateTime(c.registered_at)}
        </p>
        {c.owned_since && (
          <p>
            <span className="text-ink-muted">현재 소유 시작</span> · {formatDateTime(c.owned_since)}
          </p>
        )}
        <p>
          <span className="text-ink-muted">차대번호</span> · {c.serial_last4 ? `끝 4자리 ${c.serial_last4}` : "미등록"}
        </p>
        <p>
          <span className="text-ink-muted">현재 상태</span> · {STATUS[c.status] ?? c.status} · 양도 {c.transfer_count}회 · 스티커 {c.sticker_attached ? "있음" : "없음"}
        </p>
        <p>
          <span className="text-ink-muted">보관된 증거</span> · {ev.length ? ev.map(([k, n]) => `${evidenceLabel(k)} ${n}`).join(", ") : "없음"}
        </p>
      </Card>
      <p className="rounded-xl bg-slate-100 p-3 text-[13px] leading-relaxed text-ink-soft">
        이 화면은 증명서가 B-LOCK에서 발급됐고 지금도 같은 사람이 등록 소유자라는 것만 보여 줘요. 사진·연락처 같은 개인정보는 공개하지 않아요.
      </p>
    </div>
  );
}
