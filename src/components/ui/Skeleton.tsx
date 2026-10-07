import { cn } from "@/lib/cn";

/**
 * 스켈레톤 UI: 불러오는 동안 실제 화면 모양대로 회색 자리를 보여주고 반짝임(shimmer)을 흘립니다.
 * 빈 화면이나 가운데 스피너 대신 항상 이것을 씁니다. (버튼 안 제출 대기만 인라인 스피너)
 * 움직임 줄이기 설정을 켠 사람에게는 반짝임 없이 회색 자리만 보여요.
 */
export function Skeleton({ className = "" }: { className?: string }) {
  // cn은 Tailwind 클래스 충돌을 합치지 않아서, 부르는 쪽이 모서리·위치를 정하면 기본값을 빼요.
  const hasRounded = /(^|\s)rounded(-|\s|$)/.test(className);
  const hasPosition = /(^|\s)(absolute|fixed|sticky)(\s|$)/.test(className);
  return (
    <div aria-hidden className={cn("overflow-hidden bg-slate-200/70", !hasPosition && "relative", !hasRounded && "rounded-lg", className)}>
      <span className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/70 to-transparent motion-reduce:hidden" />
    </div>
  );
}

/** 글자 여러 줄 */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn("h-3.5", i === lines - 1 ? "w-2/3" : "w-full")} />
      ))}
    </div>
  );
}

/** 화면 읽기 프로그램에 '불러오는 중'을 알려주는 틀 */
export function SkeletonScreen({ label = "불러오는 중", className, children }: { label?: string; className?: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className={className}>
      <span className="sr-only">{label}...</span>
      {children}
    </div>
  );
}

/** 사진 + 제목 + 설명 카드 (이동수단 카드 모양) */
export function SkeletonCard({ imageClass = "aspect-[16/10]" }: { imageClass?: string }) {
  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-card ring-1 ring-line/70">
      <Skeleton className={cn("rounded-none", imageClass)} />
      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-3.5 w-1/3" />
          </div>
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Skeleton className="h-11 rounded-xl" />
          <Skeleton className="h-11 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

/** 작은 사진 + 글 (커뮤니티 글·라이딩 기록 목록 한 줄 모양) */
export function SkeletonRow() {
  return (
    <div className="flex gap-4 rounded-2xl bg-white p-3 shadow-card ring-1 ring-line/70">
      <Skeleton className="h-24 w-24 flex-none rounded-xl" />
      <div className="flex-1 space-y-2.5 py-1">
        <Skeleton className="h-5 w-20 rounded-full" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-3.5 w-1/2" />
      </div>
    </div>
  );
}

/** 흰 카드 안 여러 줄 */
export function SkeletonPanel({ lines = 4, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("space-y-4 rounded-2xl bg-white p-5 shadow-card ring-1 ring-line/70", className)}>
      <Skeleton className="h-5 w-1/3" />
      <SkeletonText lines={lines} />
    </div>
  );
}
