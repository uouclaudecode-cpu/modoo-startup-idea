import type { MetadataRoute } from "next";

const BASE = process.env.NEXT_PUBLIC_SITE_URL || "https://b-lock-app.vercel.app";

/** 검색엔진: 공개 화면(소개·커뮤니티·약관)만 보여주고, 개인 화면과 QR 화면은 막아요. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/community", "/terms", "/privacy", "/location-terms", "/contact"],
      disallow: ["/dashboard", "/vehicles", "/ride", "/rides", "/settings", "/admin", "/scan/", "/report/", "/stickers/", "/v/", "/t/", "/api/", "/reset-password", "/community/new"],
    },
    sitemap: `${BASE}/sitemap.xml`,
    host: BASE,
  };
}
