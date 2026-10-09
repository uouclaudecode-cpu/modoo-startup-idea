"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { loadFinderThreads } from "@/lib/finderThreads";

/** 이 기기에서 보낸 제보 대화가 있으면 바로 가기 (로그인 없는 발견자용) */
export function FinderThreadsLink() {
  const [count, setCount] = useState(0);
  useEffect(() => setCount(loadFinderThreads().length), []);
  if (!count) return null;
  return (
    <Link href="/r" className="flex items-center gap-3 rounded-2xl bg-brand-50 p-4 ring-1 ring-brand-100 hover:bg-brand-100/60">
      <MessageCircle aria-hidden className="h-5 w-5 flex-none text-brand-600" />
      <span className="flex-1 text-[15px] font-semibold text-brand-800">내가 보낸 제보 대화 {count}개 · 주인 답장 보기</span>
    </Link>
  );
}
