"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui";

export function PrintButton() {
  return (
    <Button variant="secondary" className="h-10 px-3 text-sm" icon={<Printer aria-hidden className="h-4 w-4" />} onClick={() => window.print()}>
      인쇄·PDF 저장
    </Button>
  );
}
