"use client";

/* eslint-disable @next/next/no-img-element -- Supabase 저장소 사진이라 기본 img 사용 */
import { useState } from "react";
import { cn } from "@/lib/cn";
import { thumbPath } from "@/lib/images";
import { typeEmoji } from "@/lib/types";

/**
 * 이동수단 사진. 사진이 없으면 종류 이모지를 크게 보여줍니다.
 * thumb: 목록처럼 작게 보이는 곳에서는 작은 사진(_t)을 먼저 써서 데이터를 아껴요.
 *        작은 사진이 없으면(예전에 올린 사진) 원래 사진으로 바꿔 보여 줘요.
 */
export function VehicleImage({
  src,
  type,
  alt,
  className,
  thumb = false,
}: {
  src: string | null;
  type: string;
  alt: string;
  className?: string;
  thumb?: boolean;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const useThumb = thumb && src && failed !== src;
  const shown = src ? (useThumb ? thumbPath(src) : src) : null;
  return (
    <div className={cn("relative overflow-hidden bg-slate-100", className)}>
      {shown ? (
        <img
          key={shown}
          src={shown}
          alt={alt}
          className="h-full w-full object-cover"
          loading="lazy"
          onError={useThumb ? () => setFailed(src) : undefined}
        />
      ) : (
        <div className="grid h-full w-full place-items-center text-5xl" aria-label={`${alt} (사진 없음)`}>
          {typeEmoji(type)}
        </div>
      )}
    </div>
  );
}
