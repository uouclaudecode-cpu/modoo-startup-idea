/* eslint-disable @next/next/no-img-element -- 저장소 사진 주소를 그대로 보여줘요 (작은 정사각형) */
import { cn } from "@/lib/cn";

/** 프로필 사진. 사진이 없으면 닉네임 첫 글자를 보여줘요. */
export function Avatar({ src, name, className }: { src: string | null; name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid flex-none place-items-center overflow-hidden rounded-full bg-gradient-to-br from-brand-500 to-brand-700 font-extrabold text-white",
        className,
      )}
    >
      {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : Array.from(name || "?")[0]}
    </span>
  );
}
