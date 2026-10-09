import type { Metadata } from "next";
import { FinderChat } from "./FinderChat";

export const metadata: Metadata = { title: "주인과 익명 대화", robots: { index: false, follow: false } };

export default function FinderChatPage() {
  return (
    <div className="mx-auto max-w-md space-y-4">
      <FinderChat />
    </div>
  );
}
