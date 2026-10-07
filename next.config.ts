import type { NextConfig } from "next";

/** 모든 화면에 붙이는 기본 보안 헤더 */
const securityHeaders = [
  // 다른 사이트가 이 사이트를 몰래 틀 안에 넣지 못하게 (클릭 가로채기 방지)
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // 카메라(QR 스캔)·위치(제보·라이딩)는 이 사이트에서만, 마이크 등은 쓰지 않음
  { key: "Permissions-Policy", value: "camera=(self), geolocation=(self), microphone=(), payment=(), usb=()" },
];

const nextConfig: NextConfig = {
  // 웹 푸시 라이브러리는 Node.js 암호화·네트워크 모듈을 그대로 써서, 묶지(번들) 않고 서버에서 바로 불러와요.
  serverExternalPackages: ["web-push"],
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // 서비스 워커는 항상 새로 받아야 업데이트가 바로 반영돼요
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }] },
    ];
  },
};

export default nextConfig;
