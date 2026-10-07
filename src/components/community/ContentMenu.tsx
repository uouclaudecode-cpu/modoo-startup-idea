"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Ban, ChevronRight, Flag, LogIn, MoreHorizontal } from "lucide-react";
import { Button, ButtonLink, Modal, Textarea, useToast } from "@/components/ui";
import { cn } from "@/lib/cn";
import { friendlyError } from "@/lib/format";
import { REPORT_DETAIL_MAX, REPORT_REASONS, type ReportReason, type ReportTarget } from "@/lib/moderation";
import { createClient } from "@/lib/supabase/client";

type View = "menu" | "report" | "block";

type Props = {
  target: ReportTarget;
  targetId: string;
  /** 차단 확인 문구에 쓰는 작성자 닉네임 (화면에 이미 보이는 이름) */
  authorName: string;
  loggedIn: boolean;
  /** 로그인한 뒤 돌아올 주소 (예: /community/글ID) */
  nextPath: string;
  className?: string;
};

/**
 * 글·댓글의 "⋯" 메뉴: 신고하기 / 이 사용자 차단.
 * 작성자 ID는 화면에 없어서 차단은 글·댓글 ID로 서버가 작성자를 찾아요.
 */
export function ContentMenu({ target, targetId, authorName, loggedIn, nextPath, className }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("menu");
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [detail, setDetail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const what = target === "post" ? "글" : "댓글";

  function openMenu() {
    setView("menu");
    setError(null);
    setOpen(true);
  }

  function close() {
    if (loading) return;
    setOpen(false);
    setReason(null);
    setDetail("");
    setError(null);
  }

  function go(next: View) {
    setError(null);
    setView(next);
  }

  // 글이 내게서 사라지는 경우(글쓴이 차단, 신고로 숨겨짐)엔 '없는 글' 화면 대신 목록으로 보내요.
  function leaveOrRefresh() {
    if (target === "post") router.replace("/community");
    router.refresh();
  }

  async function submitReport() {
    if (!reason) {
      setError("신고 이유를 골라 주세요.");
      return;
    }
    if (reason === "other" && !detail.trim()) {
      setError("'기타'를 골랐다면 어떤 문제인지 짧게 적어 주세요.");
      return;
    }
    setError(null);
    setLoading(true);
    const { data, error: err } = await createClient().rpc("report_content", {
      p_type: target,
      p_id: targetId,
      p_reason: reason,
      p_detail: detail.trim() || null,
    });
    setLoading(false);
    if (err) {
      console.error(err);
      setError(friendlyError(err, "신고하지 못했어요. 잠시 후 다시 시도해 주세요."));
      return;
    }
    setOpen(false);
    setReason(null);
    setDetail("");
    toast.success("신고했어요. 검토할게요.");
    // 이번 신고로 숨겨졌으면 나에게도 더는 보이지 않으니 화면을 새로 그려요.
    if (data === true) leaveOrRefresh();
  }

  async function submitBlock() {
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error: err } =
      target === "post"
        ? await supabase.rpc("block_user_by_post", { p_post: targetId })
        : await supabase.rpc("block_user_by_comment", { p_comment: targetId });
    setLoading(false);
    if (err) {
      console.error(err);
      setError(friendlyError(err, "차단하지 못했어요. 잠시 후 다시 시도해 주세요."));
      return;
    }
    setOpen(false);
    toast.success(`${authorName}님을 차단했어요. 이제 이 사람의 글과 댓글이 보이지 않아요.`);
    leaveOrRefresh();
  }

  const title = view === "report" ? `${what} 신고하기` : view === "block" ? "이 사용자 차단" : "더 보기";

  const footer =
    view === "report" ? (
      <>
        <Button variant="ghost" onClick={() => go("menu")} disabled={loading}>
          뒤로
        </Button>
        <Button variant="danger" loading={loading} loadingText="신고하는 중..." onClick={submitReport} icon={<Flag aria-hidden className="h-4 w-4" />}>
          신고하기
        </Button>
      </>
    ) : view === "block" ? (
      <>
        <Button variant="ghost" onClick={() => go("menu")} disabled={loading}>
          뒤로
        </Button>
        <Button variant="danger" loading={loading} loadingText="차단하는 중..." onClick={submitBlock} icon={<Ban aria-hidden className="h-4 w-4" />}>
          차단하기
        </Button>
      </>
    ) : undefined;

  return (
    <>
      <button
        type="button"
        onClick={openMenu}
        aria-label="더 보기"
        aria-haspopup="dialog"
        className={cn(
          "grid h-11 w-11 flex-none place-items-center rounded-full text-ink-faint transition-colors hover:bg-slate-100 hover:text-ink-soft",
          className,
        )}
      >
        <MoreHorizontal aria-hidden className="h-5 w-5" />
      </button>

      <Modal open={open} onClose={close} title={title} footer={footer}>
        {!loggedIn ? (
          <div className="space-y-4">
            <p>신고하거나 차단하려면 로그인해 주세요. 로그인하면 이 화면으로 돌아와요.</p>
            <ButtonLink href={`/login?next=${encodeURIComponent(nextPath)}`} full icon={<LogIn aria-hidden className="h-4 w-4" />}>
              로그인하고 계속하기
            </ButtonLink>
          </div>
        ) : view === "menu" ? (
          <ul className="-mx-2 space-y-1">
            <li>
              <MenuItem
                icon={<Flag aria-hidden className="h-5 w-5" />}
                tone="warning"
                label="신고하기"
                hint={`스팸·욕설·개인정보 노출 같은 문제가 있는 ${what}을 알려 주세요.`}
                onClick={() => go("report")}
              />
            </li>
            <li>
              <MenuItem
                icon={<Ban aria-hidden className="h-5 w-5" />}
                tone="danger"
                label="이 사용자 차단"
                hint={`${authorName}님의 글과 댓글을 더 이상 보지 않아요.`}
                onClick={() => go("block")}
              />
            </li>
          </ul>
        ) : view === "report" ? (
          // 작은 화면에서도 아래 버튼이 늘 보이도록 내용만 스크롤돼요.
          <div className="-mx-1 max-h-[52dvh] space-y-4 overflow-y-auto overscroll-contain px-1 pb-1">
            <fieldset>
              <legend className="mb-2 text-sm font-semibold text-ink-soft">어떤 문제인가요?</legend>
              <div className="space-y-2">
                {REPORT_REASONS.map((r) => (
                  <label
                    key={r.value}
                    className={cn(
                      "flex min-h-12 cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 ring-1 ring-inset transition-colors",
                      reason === r.value ? "bg-brand-50 ring-brand-500" : "ring-line hover:bg-slate-50",
                    )}
                  >
                    <input
                      type="radio"
                      name={`report-reason-${targetId}`}
                      value={r.value}
                      checked={reason === r.value}
                      onChange={() => {
                        setReason(r.value);
                        setError(null);
                      }}
                      className="mt-1 h-4 w-4 flex-none accent-brand-600"
                    />
                    <span className="leading-snug">
                      <span className="block font-semibold text-ink">{r.label}</span>
                      <span className="block text-[13px] text-ink-muted">{r.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <Textarea
              label={reason === "other" ? "어떤 문제인가요?" : "자세한 내용 (선택)"}
              required={reason === "other"}
              placeholder="검토에 도움이 되는 내용을 적어 주세요."
              value={detail}
              maxLength={REPORT_DETAIL_MAX}
              onChange={(e) => {
                setDetail(e.target.value);
                if (error) setError(null);
              }}
              hint={`${detail.length}/${REPORT_DETAIL_MAX}자`}
            />
            {error && (
              <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
                {error}
              </p>
            )}
            <p className="text-[13px] leading-relaxed text-ink-muted">
              누가 신고했는지는 글쓴이에게 알리지 않아요. 여러 사람이 신고하면 검토 전까지 잠시 숨겨져요.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <p>
              <b className="text-ink">{authorName}</b>님을 차단할까요?
            </p>
            <ul className="list-disc space-y-1.5 pl-5 text-[14px]">
              <li>이 사람이 쓴 글과 댓글이 나에게 보이지 않아요.</li>
              <li>상대방에게는 차단했다는 사실을 알리지 않아요.</li>
              <li>설정의 &lsquo;차단한 사용자&rsquo;에서 언제든 해제할 수 있어요.</li>
            </ul>
            {error && (
              <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
                {error}
              </p>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}

function MenuItem({
  icon,
  tone,
  label,
  hint,
  onClick,
}: {
  icon: ReactNode;
  tone: "warning" | "danger";
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-14 w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-slate-50 active:bg-slate-100">
      <span
        className={cn(
          "grid h-10 w-10 flex-none place-items-center rounded-xl",
          tone === "warning" ? "bg-orange-50 text-orange-600" : "bg-rose-50 text-rose-600",
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1 leading-snug">
        <span className={cn("block font-semibold", tone === "danger" ? "text-rose-700" : "text-ink")}>{label}</span>
        <span className="block text-[13px] text-ink-muted">{hint}</span>
      </span>
      <ChevronRight aria-hidden className="h-5 w-5 flex-none text-ink-faint" />
    </button>
  );
}
