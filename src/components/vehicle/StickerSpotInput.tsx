"use client";

import { Input } from "@/components/ui";

const EXAMPLES = ["안장 밑", "체인 덮개 안쪽", "핸들 아래쪽", "프레임 뒷바퀴 쪽 안쪽", "킥보드 발판 밑"];

/** 주인만 아는 스티커 부착 위치 입력 (예시를 눌러 바로 채울 수 있음) */
export function StickerSpotInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="space-y-2">
      <Input
        label="스티커 붙인 위치 (나만 보기)"
        placeholder={placeholder || "예) 안장 밑, 뒤쪽 레일 왼편"}
        hint="다른 사람에게는 절대 보이지 않아요."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={200}
      />
      <div className="flex flex-wrap gap-1.5">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => onChange(ex)}
            className="rounded-full bg-slate-100 px-3 py-1.5 text-[13px] font-semibold text-ink-soft hover:bg-slate-200"
          >
            {ex}
          </button>
        ))}
      </div>
    </div>
  );
}
