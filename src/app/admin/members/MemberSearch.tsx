"use client";

import { useEffect, useState } from "react";
import { BadgeCheck, Ban, Search, ShieldCheck, Undo2 } from "lucide-react";
import { Badge, Button, Card, Input, Modal, useToast } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatDate, formatDateTime, friendlyError } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";

type Member = {
  id: string;
  nickname: string;
  email: string | null;
  created_at: string;
  identity_verified: boolean;
  helped_count: number;
  vehicles: number;
  /** 020 이후에만 와요 */
  is_admin?: boolean;
  suspended?: boolean;
  suspended_until?: string | null;
  suspend_reason?: string | null;
};

/** 이용 제한 기간 (-1 = 기한 없이) */
const DAYS = [
  { value: 7, label: "7일" },
  { value: 30, label: "30일" },
  { value: -1, label: "기한 없이" },
] as const;

export function MemberSearch() {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Member[] | null>(null);
  const [busy, setBusy] = useState("");
  // 이용 제한 창
  const [target, setTarget] = useState<Member | null>(null);
  const [days, setDays] = useState<number>(7);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  async function search(query: string) {
    const { data, error } = await createClient().rpc("admin_find_users", { p_query: query });
    if (error) {
      console.error(error);
      return toast.error(friendlyError(error, "불러오지 못했어요."));
    }
    setRows(data as Member[]);
  }

  useEffect(() => {
    search("");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 처음 한 번만 최근 가입자 목록
  }, []);

  async function toggle(m: Member) {
    setBusy(m.id);
    const { error } = await createClient().rpc("admin_set_identity", { p_user: m.id, p_verified: !m.identity_verified });
    setBusy("");
    if (error) {
      console.error(error);
      return toast.error(friendlyError(error, "바꾸지 못했어요."));
    }
    setRows((r) => r?.map((x) => (x.id === m.id ? { ...x, identity_verified: !m.identity_verified } : x)) ?? null);
  }

  function openSuspend(m: Member) {
    setTarget(m);
    setDays(7);
    setReason("");
  }

  /** p_days: 0이면 풀기 */
  async function setSuspension(m: Member, pDays: number) {
    setSaving(true);
    const { data, error } = await createClient().rpc("admin_set_suspension", { p_user: m.id, p_days: pDays, p_reason: reason.trim() || null });
    setSaving(false);
    if (error) {
      console.error(error);
      return toast.error(friendlyError(error, "바꾸지 못했어요."));
    }
    const res = (data ?? {}) as { suspended?: boolean; suspended_until?: string | null };
    setRows(
      (r) =>
        r?.map((x) =>
          x.id === m.id
            ? { ...x, suspended: Boolean(res.suspended), suspended_until: res.suspended_until ?? null, suspend_reason: res.suspended ? reason.trim() || null : null }
            : x,
        ) ?? null,
    );
    setTarget(null);
    toast.success(res.suspended ? `${m.nickname || "회원"}님의 이용을 제한했어요. 본인에게 알림이 가요.` : "이용 제한을 풀었어요.");
  }

  return (
    <div className="space-y-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          search(q);
        }}
        className="flex gap-2"
      >
        <div className="flex-1">
          <Input label="닉네임·이메일 검색" value={q} onChange={(e) => setQ(e.target.value)} placeholder="비우면 최근 가입 30명" />
        </div>
        <Button type="submit" className="mt-auto" icon={<Search aria-hidden className="h-4 w-4" />}>
          찾기
        </Button>
      </form>
      {rows === null ? (
        <p className="text-sm text-ink-muted">불러오는 중...</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-ink-muted">맞는 회원이 없어요.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((m) => (
            <li key={m.id}>
              <Card className={cn("space-y-2.5 p-3", m.suspended && "ring-1 ring-rose-200")}>
                <div className="min-w-0 text-[14px]">
                  <p className="flex flex-wrap items-center gap-1.5 font-bold">
                    <span className="truncate">{m.nickname || "(닉네임 없음)"}</span>
                    {m.identity_verified && <BadgeCheck aria-label="본인인증 완료" className="h-4 w-4 flex-none text-emerald-600" />}
                    {m.is_admin && (
                      <Badge tone="brand" icon={<ShieldCheck aria-hidden className="h-3 w-3" />}>
                        관리자
                      </Badge>
                    )}
                    {m.suspended && (
                      <Badge tone="danger" icon={<Ban aria-hidden className="h-3 w-3" />}>
                        {m.suspended_until ? `${formatDate(m.suspended_until).slice(5)}까지 제한` : "이용 제한 중"}
                      </Badge>
                    )}
                  </p>
                  <p className="truncate text-ink-muted">{m.email}</p>
                  <p className="text-[12px] text-ink-faint">
                    {formatDate(m.created_at)} 가입 · 이동수단 {m.vehicles} · 도움 {m.helped_count}
                  </p>
                  {m.suspended && m.suspend_reason && <p className="mt-1 text-[12px] text-rose-700">사유: {m.suspend_reason}</p>}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant={m.identity_verified ? "secondary" : "primary"}
                    className="h-10 px-3 text-sm"
                    loading={busy === m.id}
                    onClick={() => toggle(m)}
                  >
                    {m.identity_verified ? "인증 해제" : "인증 표시"}
                  </Button>
                  {m.suspended ? (
                    <Button variant="secondary" className="h-10 px-3 text-sm" icon={<Undo2 aria-hidden className="h-4 w-4" />} onClick={() => setTarget(m)}>
                      제한 풀기
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      className="h-10 px-3 text-sm text-rose-700"
                      icon={<Ban aria-hidden className="h-4 w-4" />}
                      disabled={m.is_admin}
                      onClick={() => openSuspend(m)}
                    >
                      이용 제한
                    </Button>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={Boolean(target)}
        onClose={() => !saving && setTarget(null)}
        title={target?.suspended ? "이용 제한 풀기" : "이용 제한"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setTarget(null)} disabled={saving}>
              취소
            </Button>
            {target?.suspended ? (
              <Button loading={saving} loadingText="푸는 중..." onClick={() => target && setSuspension(target, 0)}>
                제한 풀기
              </Button>
            ) : (
              <Button variant="danger" loading={saving} loadingText="제한하는 중..." onClick={() => target && setSuspension(target, days)}>
                제한하기
              </Button>
            )}
          </>
        }
      >
        {target?.suspended ? (
          <p>
            <b>{target.nickname || "이 회원"}</b>님의 이용 제한을 풀면 바로 글·댓글·제보를 다시 올릴 수 있어요.
            {target.suspended_until && <> (지금은 {formatDateTime(target.suspended_until)}까지 제한)</>}
          </p>
        ) : (
          <div className="space-y-4">
            <p>
              <b>{target?.nickname || "이 회원"}</b>님은 제한 기간 동안 분실 글·댓글·목격 제보·도난 경보·신고를 올릴 수 없어요. 이미 올린 글은
              그대로라서, 문제 글은 신고 처리에서 따로 숨기거나 지워 주세요.
            </p>
            <fieldset>
              <legend className="mb-1.5 text-sm font-semibold text-ink-soft">기간</legend>
              <div className="grid grid-cols-3 gap-2">
                {DAYS.map((d) => (
                  <label
                    key={d.value}
                    className={cn(
                      "flex h-11 cursor-pointer items-center justify-center rounded-xl border-2 text-sm font-semibold transition-colors",
                      days === d.value ? "border-rose-500 bg-rose-50 text-rose-700" : "border-line bg-white text-ink-soft hover:border-rose-200",
                    )}
                  >
                    <input type="radio" name="suspend-days" className="sr-only" checked={days === d.value} onChange={() => setDays(d.value)} />
                    {d.label}
                  </label>
                ))}
              </div>
            </fieldset>
            <Input
              label="사유 (본인에게 알림으로 보여요)"
              placeholder="예) 사례금을 먼저 보내라는 사기 댓글 반복"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={200}
            />
          </div>
        )}
      </Modal>
    </div>
  );
}
