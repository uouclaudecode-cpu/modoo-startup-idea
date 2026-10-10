import type { MetadataRoute } from "next";
import { site } from "@/config/site";
import { ICON_V } from "@/lib/appIcon";

/** 앱 설치(홈 화면에 추가) 정보 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: `${site.name} · ${site.tagline}`,
    short_name: site.name,
    description: site.description,
    lang: "ko",
    // 가벼운 시작 화면(public/start.html)을 먼저 열고 홈으로 넘어가요 → 휴대폰 시작 화면이 아주 잠깐만 보여요
    start_url: "/start.html",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#2552e8",
    categories: ["lifestyle", "utilities"],
    icons: [
      { src: `/icons/icon-192-${ICON_V}.png`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `/icons/icon-512-${ICON_V}.png`, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: `/icons/maskable-192-${ICON_V}.png`, sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: `/icons/maskable-512-${ICON_V}.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "QR 스캔", url: "/scan", icons: [{ src: `/icons/icon-192-${ICON_V}.png`, sizes: "192x192" }] },
      { name: "분실 커뮤니티", url: "/community", icons: [{ src: `/icons/icon-192-${ICON_V}.png`, sizes: "192x192" }] },
      { name: "내 이동수단", url: "/dashboard", icons: [{ src: `/icons/icon-192-${ICON_V}.png`, sizes: "192x192" }] },
    ],
  };
}
