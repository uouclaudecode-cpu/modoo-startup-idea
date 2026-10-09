"use client";

import { useEffect, useState } from "react";
import { Play } from "lucide-react";
import { ButtonLink } from "@/components/ui";
import { formatDistance, formatDuration } from "@/lib/ride/geo";
import { RESUME_LIMIT_MS, type RideSnapshot } from "@/lib/ride/useRideTracker";

/** useRideTracker 가 미완료 기록을 지우는 기한과 같은 값 (시작 후 46시간) */
const KEEP_LIMIT_MS = 46 * 3600e3;

type Pending = { distance: number; elapsedSec: number; ageMs: number };

/** 이 기기에 저장된 끝내지 않은 라이딩을 읽기만 해요 (지우거나 고치지 않아요). */
function peekSavedRide(userId: string): Pending | null {
  try {
    const raw = localStorage.getItem(`b-lock:ride-in-progress:${userId}`);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<RideSnapshot>;
    if (!s.vehicleId || typeof s.startedAt !== "number") return null;
    const ageMs = Date.now() - s.startedAt;
    if (ageMs > KEEP_LIMIT_MS) return null; // 라이딩 화면을 열면 지워질 기록
    // 진행 중이던 기록은 마지막으로 저장한 때까지만 셈해요 (라이딩 화면도 그 시점에서 멈춘 것으로 되살려요)
    const running = s.activeSince != null ? Math.max(0, (s.savedAt ?? s.activeSince) - s.activeSince) : 0;
    return { distance: s.distance ?? 0, elapsedSec: ((s.activeMs ?? 0) + running) / 1000, ageMs };
  } catch {
    return null; // 저장소를 못 쓰는 환경이면 안내 없이 넘어가요
  }
}

/** MY: 끝내지 않은 라이딩이 있으면 이어 하거나 저장하도록 알려요 (오래되면 자동으로 지워져서) */
export function UnfinishedRideCard({ userId }: { userId: string }) {
  const [ride, setRide] = useState<Pending | null>(null);

  // 브라우저 저장소는 화면이 뜬 뒤에 읽어요 (서버 화면과 어긋나지 않게)
  useEffect(() => {
    setRide(peekSavedRide(userId));
  }, [userId]);

  if (!ride) return null;
  const canResume = ride.ageMs <= RESUME_LIMIT_MS;
  const hoursLeft = Math.floor((KEEP_LIMIT_MS - ride.ageMs) / 3600e3);
  const expiry = hoursLeft >= 1 ? `약 ${hoursLeft}시간 뒤에는 자동으로 지워져요.` : "곧 자동으로 지워져요.";

  return (
    <section aria-label="끝내지 않은 라이딩" className="space-y-3 rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
      <div className="flex items-start gap-3">
        <span aria-hidden className="grid h-10 w-10 flex-none place-items-center rounded-full bg-white text-amber-600 ring-1 ring-amber-200">
          <Play className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-amber-900">진행 중인 라이딩이 있어요</p>
          <p className="mt-0.5 text-[13px] leading-relaxed text-amber-900/80">
            {formatDistance(ride.distance)} · {formatDuration(ride.elapsedSec)} 기록돼 있어요.{" "}
            {canResume ? "이어서 타거나 종료해서 저장해 주세요." : "시작한 지 오래돼서 이어 탈 수 없어요. 종료하면 저장할 수 있어요."} {expiry}
          </p>
        </div>
      </div>
      <ButtonLink href="/ride" full icon={<Play aria-hidden className="h-4 w-4" />}>
        {canResume ? "이어하기" : "저장하러 가기"}
      </ButtonLink>
    </section>
  );
}
