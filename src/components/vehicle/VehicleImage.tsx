/* eslint-disable @next/next/no-img-element -- Supabase 저장소 사진이라 기본 img 사용 */
import { cn } from "@/lib/cn";
import { typeEmoji } from "@/lib/types";

/** 이동수단 사진. 사진이 없으면 종류 이모지를 크게 보여줍니다. */
export function VehicleImage({
  src,
  type,
  alt,
  className,
}: {
  src: string | null;
  type: string;
  alt: string;
  className?: string;
}) {
  return (
    <div className={cn("relative overflow-hidden bg-slate-100", className)}>
      {src ? (
        <img src={src} alt={alt} className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <div className="grid h-full w-full place-items-center text-5xl" aria-label={`${alt} (사진 없음)`}>
          {typeEmoji(type)}
        </div>
      )}
    </div>
  );
}
