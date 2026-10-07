import { Skeleton, SkeletonCard, SkeletonPanel, SkeletonRow, SkeletonScreen, SkeletonText } from "@/components/ui";

/**
 * 화면별 로딩 스켈레톤. 각 경로의 loading.tsx 에서 씁니다.
 * 실제 화면과 비슷한 모양이라 불러온 뒤에도 화면이 크게 흔들리지 않아요.
 */

function BackLink() {
  return <Skeleton className="h-4 w-24" />;
}

function Heading({ sub = true }: { sub?: boolean }) {
  return (
    <div className="space-y-2">
      <Skeleton className="h-7 w-48" />
      {sub && <Skeleton className="h-4 w-64 max-w-full" />}
    </div>
  );
}

/** 첫 화면 */
export function HomeSkeleton() {
  return (
    <SkeletonScreen className="space-y-10">
      <Skeleton className="h-[300px] rounded-3xl" />
      <div className="space-y-3">
        <Skeleton className="h-6 w-40" />
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      </div>
    </SkeletonScreen>
  );
}

/** 내 이동수단 */
export function DashboardSkeleton() {
  return (
    <SkeletonScreen className="space-y-6">
      <Heading />
      <Skeleton className="h-14 rounded-xl" />
      <div className="grid gap-4 sm:grid-cols-2">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </SkeletonScreen>
  );
}

/** 목록 (커뮤니티·라이딩 기록) */
export function ListSkeleton({ search = false, rows = 5 }: { search?: boolean; rows?: number }) {
  return (
    <SkeletonScreen className="space-y-5">
      <div className="flex items-end justify-between gap-3">
        <Heading />
        <Skeleton className="h-11 w-24 rounded-xl" />
      </div>
      {search && <Skeleton className="h-12 rounded-xl" />}
      {search && (
        <div className="flex gap-2">
          <Skeleton className="h-9 w-48 rounded-xl" />
          <Skeleton className="h-9 w-40 rounded-full" />
        </div>
      )}
      <ListRows rows={rows} />
    </SkeletonScreen>
  );
}

export function ListRows({ rows = 5 }: { rows?: number }) {
  return (
    <SkeletonScreen className="space-y-3">
      {Array.from({ length: rows }, (_, i) => (
        <SkeletonRow key={i} />
      ))}
    </SkeletonScreen>
  );
}

/** 상세 (이동수단·글·라이딩 결과) */
export function DetailSkeleton({ image = "aspect-[4/3]" }: { image?: string }) {
  return (
    <SkeletonScreen className="mx-auto max-w-xl space-y-4">
      <BackLink />
      <div className="overflow-hidden rounded-2xl bg-white shadow-card ring-1 ring-line/70">
        <Skeleton className={`rounded-none ${image}`} />
        <div className="space-y-4 p-5">
          <Skeleton className="h-7 w-2/3" />
          <SkeletonText lines={4} />
        </div>
      </div>
      <SkeletonPanel lines={2} />
      <Skeleton className="h-14 rounded-xl" />
    </SkeletonScreen>
  );
}

/** 입력 폼 (등록·수정·글쓰기·제보) */
export function FormSkeleton({ fields = 4 }: { fields?: number }) {
  return (
    <SkeletonScreen className="mx-auto max-w-xl space-y-5">
      <Heading />
      <div className="space-y-5 rounded-2xl bg-white p-5 shadow-card ring-1 ring-line/70">
        {Array.from({ length: fields }, (_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-12 rounded-xl" />
          </div>
        ))}
      </div>
      <Skeleton className="aspect-[4/3] rounded-2xl" />
      <Skeleton className="h-14 rounded-xl" />
    </SkeletonScreen>
  );
}

/** 라이딩 (지도) */
export function RideSkeleton() {
  return (
    <SkeletonScreen className="mx-auto max-w-xl space-y-4">
      <div className="flex justify-between">
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-5 w-20" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-9 w-32 rounded-full" />
        <Skeleton className="h-9 w-28 rounded-full" />
      </div>
      <Skeleton className="h-[44vh] min-h-[260px] rounded-2xl" />
      <div className="space-y-3 rounded-2xl bg-white p-4 shadow-card ring-1 ring-line/70">
        <Skeleton className="mx-auto h-12 w-40" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
      </div>
      <Skeleton className="h-16 rounded-xl" />
    </SkeletonScreen>
  );
}

/** 소모품·정비 */
export function MaintenanceSkeleton() {
  return (
    <SkeletonScreen className="mx-auto max-w-xl space-y-5">
      <BackLink />
      <Heading />
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="space-y-3 rounded-2xl bg-white p-4 shadow-card ring-1 ring-line/70">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3.5 w-1/2" />
            </div>
          </div>
          <Skeleton className="h-2.5 rounded-full" />
          <Skeleton className="h-11 rounded-xl" />
        </div>
      ))}
    </SkeletonScreen>
  );
}

/** QR 화면 */
export function QrSkeleton() {
  return (
    <SkeletonScreen className="mx-auto max-w-md space-y-4">
      <BackLink />
      <div className="space-y-5 rounded-2xl bg-white p-6 shadow-card ring-1 ring-line/70">
        <Skeleton className="mx-auto h-4 w-32" />
        <Skeleton className="mx-auto aspect-square w-full max-w-[320px] rounded-2xl" />
        <SkeletonText lines={2} />
        <Skeleton className="h-14 rounded-xl" />
      </div>
    </SkeletonScreen>
  );
}

/** QR 스캔 결과 (공개 화면) */
export function ScanResultSkeleton() {
  return (
    <SkeletonScreen className="mx-auto max-w-md space-y-4">
      <Skeleton className="h-52 rounded-3xl" />
      <div className="overflow-hidden rounded-2xl bg-white shadow-card ring-1 ring-line/70">
        <Skeleton className="aspect-[4/3] rounded-none" />
        <div className="p-5">
          <SkeletonText lines={3} />
        </div>
      </div>
    </SkeletonScreen>
  );
}

/** 라이딩 기록: 통계 카드(요약 + 막대그래프) · 배지 · 목록 */
export function RidesSkeleton() {
  // 막대 높이를 들쭉날쭉하게 해서 그래프 자리처럼 보이게 해요 (고정값이라 그릴 때마다 같아요)
  const bars = [35, 60, 20, 75, 45, 90, 55, 70];
  return (
    <SkeletonScreen className="mx-auto max-w-xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-11 w-28 rounded-xl" />
      </div>
      <div className="space-y-4 rounded-2xl bg-white p-4 shadow-card ring-1 ring-line/70">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-9 w-28 rounded-xl" />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-[60px] rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-4 w-40" />
        <div className="flex h-40 items-end gap-1 border-b border-line">
          {bars.map((h, i) => (
            <div key={i} className="flex flex-1 justify-center" style={{ height: `${h}%` }}>
              <Skeleton className="h-full w-full max-w-[32px] rounded-b-none rounded-t-md" />
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-4 rounded-2xl bg-white p-4 shadow-card ring-1 ring-line/70">
        <div className="flex justify-between">
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-[104px] rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-11 rounded-xl" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 3 }, (_, i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    </SkeletonScreen>
  );
}
