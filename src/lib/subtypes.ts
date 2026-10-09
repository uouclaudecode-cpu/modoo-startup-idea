/** 자전거 종류별 이름과 권장 타이어 공기압 (일반적인 범위, 타이어 옆면 표기가 가장 정확해요) */
export type BikeSubtype = "road" | "mtb" | "hybrid" | "minivelo" | "ebike" | "folding" | "kids" | "other";

export const BIKE_SUBTYPES: { value: BikeSubtype; label: string; psi: string | null }[] = [
  { value: "road", label: "로드", psi: "80~110psi" },
  { value: "mtb", label: "MTB", psi: "25~35psi" },
  { value: "hybrid", label: "하이브리드", psi: "50~70psi" },
  { value: "minivelo", label: "미니벨로", psi: "60~90psi" },
  { value: "ebike", label: "전기자전거", psi: "40~65psi" },
  { value: "folding", label: "접이식", psi: "60~90psi" },
  { value: "kids", label: "어린이", psi: "30~45psi" },
  { value: "other", label: "기타", psi: null },
];

export const subtypeLabel = (s: string | null | undefined) => BIKE_SUBTYPES.find((x) => x.value === s)?.label ?? null;

/** 배터리 기록을 받는 이동수단인지 (전동킥보드·전기자전거) */
export const usesBattery = (type: string, subtype: string | null | undefined) => type === "kickboard" || subtype === "ebike";

/** 권장 공기압 안내 문장 */
export function pressureTip(type: string, subtype: string | null | undefined) {
  if (type === "kickboard") return "전동킥보드는 보통 40~50psi예요. 타이어 옆면에 적힌 값을 따르세요.";
  const s = BIKE_SUBTYPES.find((x) => x.value === subtype);
  if (!s || !s.psi) return "타이어 옆면에 적힌 권장 공기압(psi)을 따르세요.";
  return `${s.label}는 보통 ${s.psi}예요. 타이어 옆면에 적힌 값이 가장 정확해요.`;
}
