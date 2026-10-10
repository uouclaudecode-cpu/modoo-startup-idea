"use client";

import { useEffect, useState } from "react";
import { MailPlus } from "lucide-react";
import { Button, useToast } from "@/components/ui";
import { friendlyError } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/cn";

/**
 * 가입 확인 메일의 링크가 돌아올 주소. 확인을 마치면 원래 가려던 화면(next)으로 가요.
 * 그냥 MY로 가는 새 회원에게는 첫 안내(welcome)를 보여줘요.
 */
export function confirmRedirectUrl(next: string) {
  const dest = next === "/" ? "/?welcome=1" : next;
  return `${window.location.origin}/auth/callback?next=${encodeURIComponent(dest)}`;
}

/** 다시 보낸 뒤 기다리는 시간(초). 메일 서버도 같은 주소로는 짧은 시간에 여러 번 보내 주지 않아요. */
const COOLDOWN = 60;

type Props = {
  email: string;
  /** 확인을 마친 뒤 돌아갈 주소 */
  next: string;
  /** 방금 메일을 보낸 화면이면 처음부터 기다리는 시간을 보여줘요 */
  justSent?: boolean;
};

/** 가입 확인 메일 다시 보내기 (메일이 안 왔거나 링크가 만료됐을 때) */
export function ResendConfirm({ email, next, justSent = false }: Props) {
  const toast = useToast();
  const [left, setLeft] = useState(justSent ? COOLDOWN : 0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);

  async function resend() {
    const value = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(value)) {
      setMessage({ ok: false, text: "이메일 칸에 가입한 이메일을 적어 주세요." });
      return;
    }
    setMessage(null);
    setLoading(true);
    const { error } = await createClient().auth.resend({
      type: "signup",
      email: value,
      options: { emailRedirectTo: confirmRedirectUrl(next) },
    });
    setLoading(false);
    if (error) {
      console.error(error);
      // "For security purposes, you can only request this after 42 seconds." 처럼 남은 시간을 알려 주면 그만큼 기다려요.
      const wait = /after (\d+) seconds?/i.exec(error.message);
      if (wait) {
        setLeft(Number(wait[1]));
        return setMessage({ ok: false, text: `조금 전에 보냈어요. ${wait[1]}초 뒤에 다시 보낼 수 있어요.` });
      }
      if (/rate limit|security purposes|too many/i.test(error.message) || error.status === 429) {
        setLeft(COOLDOWN);
        return setMessage({ ok: false, text: "요청이 너무 많아요. 몇 분 뒤에 다시 시도해 주세요." });
      }
      // 메일 서버 쪽 문제는 다시 눌러도 안 되니 문의로 안내해요.
      if (/sending|smtp/i.test(error.message) || error.status === 500) {
        return setMessage({ ok: false, text: "지금 메일을 보내지 못했어요. 잠시 뒤 다시 시도하거나, 화면 맨 아래 '문의하기'로 알려 주시면 도와 드릴게요." });
      }
      return setMessage({ ok: false, text: friendlyError(error, "메일을 보내지 못했어요. 잠시 후 다시 시도해 주세요.") });
    }
    setLeft(COOLDOWN);
    setMessage({ ok: true, text: "확인 메일을 다시 보냈어요. 메일함(스팸함 포함)에서 가장 최근에 받은 메일의 링크를 눌러 주세요." });
    toast.success("확인 메일을 다시 보냈어요.");
  }

  return (
    <div className="space-y-2">
      <Button
        variant="secondary"
        full
        loading={loading}
        loadingText="보내는 중..."
        disabled={left > 0}
        onClick={resend}
        icon={<MailPlus aria-hidden className="h-4 w-4" />}
      >
        {left > 0 ? `확인 메일 다시 보내기 (${left}초 뒤)` : "확인 메일 다시 보내기"}
      </Button>
      {message && (
        <p
          role={message.ok ? "status" : "alert"}
          className={cn("rounded-xl px-3 py-2.5 text-left text-[13px] leading-relaxed", message.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700")}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
