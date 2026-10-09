"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, useToast } from "@/components/ui";
import { friendlyError } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";

export function AlertModeration({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState("");

  async function set(next: "open" | "hidden" | "cancelled") {
    setBusy(next);
    const { error } = await createClient().rpc("admin_set_alert_status", { p_alert: id, p_status: next });
    setBusy("");
    if (error) {
      console.error(error);
      return toast.error(friendlyError(error, "바꾸지 못했어요."));
    }
    toast.success(next === "open" ? "다시 보이게 했어요." : next === "hidden" ? "숨겼어요." : "경보를 끝냈어요.");
    router.refresh();
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      <Button variant="secondary" className="h-9 px-2 text-[13px]" disabled={status === "open"} loading={busy === "open"} onClick={() => set("open")}>
        문제없음
      </Button>
      <Button variant="secondary" className="h-9 px-2 text-[13px]" disabled={status === "hidden"} loading={busy === "hidden"} onClick={() => set("hidden")}>
        숨기기
      </Button>
      <Button variant="danger" className="h-9 px-2 text-[13px]" loading={busy === "cancelled"} onClick={() => set("cancelled")}>
        경보 끝내기
      </Button>
    </div>
  );
}
