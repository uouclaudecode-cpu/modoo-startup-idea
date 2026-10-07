"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button, Card, useToast } from "@/components/ui";
import { friendlyError } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";

type Item = { bucket: string; path: string };

/**
 * 지운 글·댓글·제보의 사진 파일 정리.
 * 데이터베이스는 저장소 파일을 직접 지울 수 없어서, 지울 사진 목록을 모아 두고 관리자 권한으로 한 번에 지워요.
 */
export function CleanupQueue({ count }: { count: number }) {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    const supabase = createClient();
    let cleared = 0;
    try {
      // 한 번에 너무 많이 지우지 않게 500개씩 반복
      for (let round = 0; round < 20; round++) {
        const { data, error } = await supabase.from("storage_cleanup_queue").select("bucket, path").order("created_at").limit(500);
        if (error) throw error;
        const items = (data ?? []) as Item[];
        if (items.length === 0) break;
        const byBucket = new Map<string, string[]>();
        for (const it of items) byBucket.set(it.bucket, [...(byBucket.get(it.bucket) ?? []), it.path]);
        for (const [bucket, paths] of byBucket) {
          // 이미 없는 파일은 그냥 넘어가요 (오류 없이 지워진 목록에서 빠짐)
          const { error: rmErr } = await supabase.storage.from(bucket).remove(paths);
          if (rmErr) throw rmErr;
          const { data: n, error: clrErr } = await supabase.rpc("admin_clear_cleanup", { p_bucket: bucket, p_paths: paths });
          if (clrErr) throw clrErr;
          cleared += Number(n ?? 0);
        }
      }
      toast.success(`사진 ${cleared}개를 정리했어요.`);
    } catch (e) {
      console.error(e);
      toast.error(friendlyError(e, `정리하다 멈췄어요. (${cleared}개 정리됨) 다시 눌러 주세요.`));
    } finally {
      setLoading(false);
      router.refresh();
    }
  }

  return (
    <Card className="flex items-center gap-3 p-4">
      <span aria-hidden className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-slate-100 text-ink-soft">
        <Trash2 className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-bold">지운 사진 정리</p>
        <p className="text-[13px] text-ink-muted">
          {count > 0 ? `정리할 사진 ${count}개 (지운 글·댓글·발견 제보의 사진)` : "정리할 사진이 없어요."}
        </p>
      </div>
      <Button variant="secondary" className="flex-none" loading={loading} loadingText="정리 중..." disabled={count === 0} onClick={run}>
        정리하기
      </Button>
    </Card>
  );
}
