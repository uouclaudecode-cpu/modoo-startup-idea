"use client";

import { useEffect, useState } from "react";
import { BadgeCheck, Search } from "lucide-react";
import { Button, Card, Input, useToast } from "@/components/ui";
import { formatDate, friendlyError } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";

type Member = { id: string; nickname: string; email: string | null; created_at: string; identity_verified: boolean; helped_count: number; vehicles: number };

export function MemberSearch() {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Member[] | null>(null);
  const [busy, setBusy] = useState("");

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
              <Card className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1 text-[14px]">
                  <p className="flex items-center gap-1.5 font-bold">
                    <span className="truncate">{m.nickname || "(닉네임 없음)"}</span>
                    {m.identity_verified && <BadgeCheck aria-label="본인인증 완료" className="h-4 w-4 flex-none text-emerald-600" />}
                  </p>
                  <p className="truncate text-ink-muted">{m.email}</p>
                  <p className="text-[12px] text-ink-faint">
                    {formatDate(m.created_at)} 가입 · 이동수단 {m.vehicles} · 도움 {m.helped_count}
                  </p>
                </div>
                <Button variant={m.identity_verified ? "secondary" : "primary"} className="h-9 flex-none px-3 text-sm" loading={busy === m.id} onClick={() => toggle(m)}>
                  {m.identity_verified ? "인증 해제" : "인증 표시"}
                </Button>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
