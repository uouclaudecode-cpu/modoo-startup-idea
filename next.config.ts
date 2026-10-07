import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 웹 푸시 라이브러리는 Node.js 암호화·네트워크 모듈을 그대로 써서, 묶지(번들) 않고 서버에서 바로 불러와요.
  serverExternalPackages: ["web-push"],
};

export default nextConfig;
