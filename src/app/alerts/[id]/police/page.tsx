import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import QRCode from "qrcode";
import type { AlertCard } from "@/lib/alerts";
import type { Evidence } from "@/lib/evidence";
import { vehicleImageUrl } from "@/lib/images";
import { kakaoMapLink } from "@/lib/map";
import { scanUrl } from "@/lib/qr";
import { createClient } from "@/lib/supabase/server";
import type { Vehicle } from "@/lib/types";
import { PoliceReport, type ReportPhoto } from "./PoliceReport";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "112 도난 신고서", robots: { index: false, follow: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// 신고서에 넣을 사진 순서 (최대 4장)
const PHOTO_ORDER: Evidence["kind"][] = ["front", "serial", "detail", "left", "right", "back"];

export default async function PoliceReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/alerts/${id}/police`)}`);

  const { data: a } = await supabase.rpc("get_alert", { p_alert: id });
  const alert = a as AlertCard | null;
  if (!alert || !alert.is_owner || !alert.vehicle.id) notFound();

  const [{ data: v }, { data: stickers }, { data: ev }, { data: alertRow }] = await Promise.all([
    supabase.from("vehicles").select("*").eq("id", alert.vehicle.id).maybeSingle(),
    supabase.from("stickers").select("code").eq("vehicle_id", alert.vehicle.id),
    supabase.from("vehicle_evidence").select("*").eq("vehicle_id", alert.vehicle.id),
    supabase.from("theft_alerts").select("police_report_no").eq("id", alert.id).maybeSingle(),
  ]);
  if (!v) notFound();
  const vehicle = v as Vehicle;

  // 사진: 등록 사진 1장 + 증거 사진 (전체·차대번호·특징 순) 최대 4장
  const evidence = ((ev ?? []) as Evidence[]).sort((x, y) => PHOTO_ORDER.indexOf(x.kind) - PHOTO_ORDER.indexOf(y.kind)).filter((e) => e.kind !== "receipt");
  const signed: Record<string, string> = {};
  if (evidence.length) {
    const { data: urls } = await supabase.storage.from("evidence").createSignedUrls(evidence.map((e) => e.photo_path), 3600);
    for (const u of urls ?? []) if (u.path && u.signedUrl) signed[u.path] = u.signedUrl;
  }
  const photos: ReportPhoto[] = [];
  const main = vehicleImageUrl(vehicle.image_path);
  if (main) photos.push({ src: main, label: "등록 사진 (전체 외관)" });
  for (const e of evidence) {
    if (photos.length >= 4) break;
    const src = signed[e.photo_path];
    if (src) photos.push({ src, label: e.kind === "serial" ? "차대번호 각인" : e.kind === "detail" ? "특이 흠집·튜닝" : "외관" });
  }

  const base = (process.env.NEXT_PUBLIC_SITE_URL || "https://b-lock-app.vercel.app").replace(/\/$/, "");
  const mapUrl = kakaoMapLink(alert.lat, alert.lng, "도난 추정 장소");
  const [mapQr, alertQr] = await Promise.all([
    QRCode.toDataURL(mapUrl, { width: 240, margin: 1 }),
    QRCode.toDataURL(`${base}/alerts/${alert.id}`, { width: 240, margin: 1 }),
  ]);

  return (
    <PoliceReport
      alert={alert}
      vehicle={vehicle}
      stickerCodes={(stickers ?? []).map((s) => s.code as string)}
      qrValue={scanUrl(vehicle.qr_token)}
      photos={photos}
      mapUrl={mapUrl}
      mapQr={mapQr}
      alertQr={alertQr}
      alertUrl={`${base}/alerts/${alert.id}`}
      policeReportNo={(alertRow?.police_report_no as string | null) ?? null}
    />
  );
}
