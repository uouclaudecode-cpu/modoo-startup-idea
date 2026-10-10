"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Download } from "lucide-react";
import { Button, Card, useToast } from "@/components/ui";

type Res = { total: number; imported: number; skipped: number; done: number; lastPage: number; nextPage: number | null; error?: string };

/** 공공데이터를 800건씩 끝까지 불러와요. 도중에 멈추면 이어서 불러올 수 있어요. */
export function SpotImporter() {
  const router = useRouter();
  const toast = useToast();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; last: number; imported: number } | null>(null);
  const [resumeFrom, setResumeFrom] = useState(1);
  const [error, setError] = useState("");

  async function run(from: number) {
    setRunning(true);
    setError("");
    let page: number | null = from;
    let imported = from === 1 ? 0 : (progress?.imported ?? 0);
    try {
      while (page) {
        const r: Response = await fetch("/api/admin/spots-import", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ page }),
        });
        const j = (await r.json().catch(() => ({ error: "응답을 읽지 못했어요." }))) as Res;
        if (!r.ok || j.error) {
          setResumeFrom(page);
          throw new Error(j.error ?? "불러오지 못했어요.");
        }
        imported += j.imported;
        setProgress({ done: j.done, last: j.lastPage, imported });
        page = j.nextPage;
      }
      setResumeFrom(1);
      toast.success(`보관소 ${imported.toLocaleString("ko-KR")}곳을 불러왔어요.`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "불러오지 못했어요.");
    } finally {
      setRunning(false);
    }
  }

  const pct = progress ? Math.round((progress.done / Math.max(progress.last, 1)) * 100) : 0;
  return (
    <Card className="space-y-3 p-4">
      <h2 className="font-bold">공공데이터 불러오기</h2>
      <p className="text-[13px] leading-relaxed text-ink-muted">전국 약 1만 8천 곳이라 1~3분쯤 걸려요. 끝날 때까지 이 화면을 닫지 마세요.</p>
      {progress && (
        <div className="space-y-1.5">
          <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-brand-600 transition-[width]" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-[13px] tabular-nums text-ink-soft">
            {pct}% · {progress.imported.toLocaleString("ko-KR")}곳 저장
          </p>
        </div>
      )}
      {error && <p className="text-[13px] text-rose-600">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => run(1)} loading={running} loadingText="불러오는 중..." icon={<Download aria-hidden className="h-4 w-4" />}>
          처음부터 불러오기
        </Button>
        {!running && resumeFrom > 1 && (
          <Button variant="secondary" onClick={() => run(resumeFrom)}>
            멈춘 곳부터 이어서
          </Button>
        )}
      </div>
    </Card>
  );
}

/** 도로교통공단 자전거사고 다발지역: 전국 252개 시·군·구를 30곳씩 불러와요. */
export function HazardImporter() {
  const router = useRouter();
  const toast = useToast();
  const thisYear = new Date().getFullYear();
  // 보통 전년도 자료가 다음 해 여름쯤 올라와요
  const [year, setYear] = useState(thisYear - 1);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; imported: number } | null>(null);
  const [error, setError] = useState("");

  async function run() {
    setRunning(true);
    setError("");
    let from: number | null = 0;
    let imported = 0;
    try {
      while (from !== null) {
        const r: Response = await fetch("/api/admin/hazards-import", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ year, from }),
        });
        const j = (await r.json().catch(() => ({ error: "응답을 읽지 못했어요." }))) as { imported: number; done: number; total: number; next: number | null; error?: string };
        if (!r.ok || j.error) throw new Error(j.error ?? "불러오지 못했어요.");
        imported += j.imported;
        setProgress({ done: j.done, total: j.total, imported });
        from = j.next;
      }
      if (imported === 0) setError(`${year}년 자료가 아직 없어요. 한 해 전으로 바꿔서 다시 불러와 주세요.`);
      else toast.success(`사고 잦은 곳 ${imported.toLocaleString("ko-KR")}곳을 불러왔어요.`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "불러오지 못했어요.");
    } finally {
      setRunning(false);
    }
  }

  const pct = progress ? Math.round((progress.done / Math.max(progress.total, 1)) * 100) : 0;
  return (
    <Card className="space-y-3 p-4">
      <h2 className="font-bold">자전거 사고 잦은 곳 불러오기</h2>
      <p className="text-[13px] leading-relaxed text-ink-muted">
        도로교통공단 자전거사고 다발지역 자료예요. 전국 시·군·구를 차례로 불러와서 1분쯤 걸려요. 새 연도 자료가 들어오면 예전 연도 자료는 지워져요.
      </p>
      <label className="flex items-center gap-2 text-sm font-semibold text-ink-soft">
        연도
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} disabled={running} className="h-10 rounded-xl border border-line bg-white px-3 text-[16px]">
          {[0, 1, 2, 3].map((d) => (
            <option key={d} value={thisYear - d}>
              {thisYear - d}년
            </option>
          ))}
        </select>
      </label>
      {progress && (
        <div className="space-y-1.5">
          <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-orange-500 transition-[width]" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-[13px] tabular-nums text-ink-soft">
            {pct}% · {progress.imported.toLocaleString("ko-KR")}곳 저장
          </p>
        </div>
      )}
      {error && <p className="text-[13px] text-rose-600">{error}</p>}
      <Button onClick={run} loading={running} loadingText="불러오는 중..." icon={<Download aria-hidden className="h-4 w-4" />}>
        {year}년 자료 불러오기
      </Button>
    </Card>
  );
}
