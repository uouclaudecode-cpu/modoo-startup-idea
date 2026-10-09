export type EvidenceKind = "serial" | "receipt" | "front" | "back" | "left" | "right" | "detail";

export type Evidence = { id: string; vehicle_id: string; kind: EvidenceKind; photo_path: string; note: string | null; created_at: string };

export const EVIDENCE_SLOTS: { kind: EvidenceKind; label: string; hint: string; multi?: boolean }[] = [
  { kind: "serial", label: "차대번호", hint: "프레임에 새겨진 번호가 또렷하게 보이게" },
  { kind: "receipt", label: "구매 영수증", hint: "카드 전표·온라인 주문 내역 캡처도 돼요", multi: true },
  { kind: "front", label: "앞에서", hint: "전체가 다 나오게" },
  { kind: "back", label: "뒤에서", hint: "전체가 다 나오게" },
  { kind: "left", label: "왼쪽", hint: "옆모습 전체" },
  { kind: "right", label: "오른쪽", hint: "옆모습 전체" },
  { kind: "detail", label: "나만 아는 특징", hint: "긁힌 자국·스티커·바꾼 부품 등", multi: true },
];

export const evidenceLabel = (k: EvidenceKind) => EVIDENCE_SLOTS.find((s) => s.kind === k)?.label ?? k;
