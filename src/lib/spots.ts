/**
 * 자전거 보관소 · 공기주입기 (031_profile_spots.sql 의 bike_spots)
 * 공공데이터: 행정안전부 자전거보관소정보 조회서비스 (data.go.kr 15155044)
 */

export type SpotKind = "pump" | "parking" | "repair" | "all";

export type BikeSpot = {
  id: string;
  source: "public" | "user";
  name: string;
  road_addr: string | null;
  lot_addr: string | null;
  lat: number;
  lng: number;
  /** 기준 위치에서 거리 (m) */
  dist: number;
  is_parking: boolean;
  racks: number | null;
  install_year: number | null;
  install_shape: string | null;
  has_shade: boolean | null;
  has_pump: boolean;
  pump_type: string | null;
  has_repair: boolean | null;
  mgr_name: string | null;
  mgr_tel: string | null;
  data_date: string | null;
  note: string | null;
  ok_count: number;
  broken_count: number;
  gone_count: number;
  last_ok_at: string | null;
  last_broken_at: string | null;
};

/** 자전거 사고 잦은 곳 (도로교통공단, bike_hazards_in_box) */
export type BikeHazard = {
  id: string;
  year: number;
  name: string;
  lat: number;
  lng: number;
  radius_m: number;
  accidents: number;
  casualties: number;
  deaths: number;
  serious: number;
};

export const SPOT_KINDS: { value: SpotKind; label: string }[] = [
  { value: "parking", label: "보관소" },
  { value: "pump", label: "공기주입기" },
  { value: "repair", label: "수리대" },
];

/** 최근 회원 확인 결과: 마지막으로 '고장'이 '잘 돼요'보다 나중이면 고장으로 봐요 */
export function pumpState(s: Pick<BikeSpot, "has_pump" | "last_ok_at" | "last_broken_at">): "ok" | "broken" | "unknown" {
  if (!s.has_pump) return "unknown";
  const ok = s.last_ok_at ? Date.parse(s.last_ok_at) : 0;
  const broken = s.last_broken_at ? Date.parse(s.last_broken_at) : 0;
  if (broken > ok) return "broken";
  return ok ? "ok" : "unknown";
}

export function formatDist(m: number) {
  return m < 1000 ? `${Math.round(m / 10) * 10}m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)}km`;
}

// --- 공공데이터 → bike_spots 행 (서버에서만) ---------------------------------

/** 공공데이터 한 건 (필요한 칸만) */
export type PublicParkingItem = Partial<
  Record<
    | "MNG_NO"
    | "BCCL_STRGE_NM"
    | "LCTN_ROAD_NM_ADDR"
    | "LCTN_LOTNO_ADDR"
    | "WGS84_LAT"
    | "WGS84_LOT"
    | "KPNGBX_CNT"
    | "INSTL_YR"
    | "INSTL_SHP"
    | "SNSHD_INSTL_YN"
    | "AIRPMP_FRNSH_YN"
    | "AIRPMP_TYPE_NM"
    | "RPRSTD_INSTL_YN"
    | "MNG_INST_NM"
    | "MNG_INST_TELNO"
    | "DAT_CRTR_YMD",
    string | null
  >
>;

const txt = (v: string | null | undefined) => {
  const s = (v ?? "").trim();
  return s ? s : null;
};
const yn = (v: string | null | undefined) => {
  const s = (v ?? "").trim().toUpperCase();
  return s === "Y" ? true : s === "N" ? false : null;
};
const int = (v: string | null | undefined) => {
  const n = Number.parseInt((v ?? "").replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
};

export function toSpotRow(it: PublicParkingItem) {
  const lat = Number(it.WGS84_LAT), lng = Number(it.WGS84_LOT);
  const id = txt(it.MNG_NO), name = txt(it.BCCL_STRGE_NM);
  if (!id || !name || !Number.isFinite(lat) || !Number.isFinite(lng) || lat < 33 || lat > 39 || lng < 124 || lng > 132) return null;
  const year = int(it.INSTL_YR);
  const racks = int(it.KPNGBX_CNT);
  const date = txt(it.DAT_CRTR_YMD)?.replace(/^(\d{4})-?(\d{2})-?(\d{2}).*$/, "$1-$2-$3") ?? null;
  return {
    public_id: id.slice(0, 80),
    name,
    road_addr: txt(it.LCTN_ROAD_NM_ADDR),
    lot_addr: txt(it.LCTN_LOTNO_ADDR),
    lat,
    lng,
    racks: racks != null && racks <= 100000 ? racks : null,
    install_year: year != null && year >= 1950 && year <= 2100 ? year : null,
    install_shape: txt(it.INSTL_SHP),
    has_shade: yn(it.SNSHD_INSTL_YN),
    has_pump: yn(it.AIRPMP_FRNSH_YN) === true,
    pump_type: txt(it.AIRPMP_TYPE_NM),
    has_repair: yn(it.RPRSTD_INSTL_YN),
    mgr_name: txt(it.MNG_INST_NM),
    mgr_tel: txt(it.MNG_INST_TELNO),
    data_date: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
  };
}

/** 여러 해 자료를 같은 장소끼리 묶은 사고 잦은 곳 (가장 최근 해의 숫자를 보여 줘요) */
export type MergedHazard = BikeHazard & { years: number[] };

/**
 * 최근 3년 자료에서 같은 장소(원이 겹치는 곳)를 하나로 묶어요.
 * 해마다 원의 가운데가 수십 m씩 달라질 수 있어서 거리로 비교해요. 입력은 최근 해부터 와요.
 */
export function mergeHazards(list: BikeHazard[]): MergedHazard[] {
  const out: MergedHazard[] = [];
  const sorted = [...list].sort((a, b) => b.year - a.year || b.accidents - a.accidents);
  for (const h of sorted) {
    const same = out.find((m) => distanceM(m, h) <= Math.max(m.radius_m, h.radius_m, 80));
    if (same) {
      if (!same.years.includes(h.year)) same.years.push(h.year);
    } else {
      out.push({ ...h, years: [h.year] });
    }
  }
  for (const m of out) m.years.sort((a, b) => a - b);
  return out;
}

/** 두 지점 거리 (m, 짧은 거리용 근사) */
function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const k = Math.cos((a.lat * Math.PI) / 180);
  const dx = (a.lng - b.lng) * 111320 * k, dy = (a.lat - b.lat) * 110540;
  return Math.sqrt(dx * dx + dy * dy);
}

/** "2023·2025년" 처럼 */
export function hazardYearsLabel(years: number[]) {
  return `${years.join("·")}년`;
}
