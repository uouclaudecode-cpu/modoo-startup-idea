import type { Metadata, Viewport } from "next";
import "./globals.css";
import { site } from "@/config/site";
import { BottomNav } from "@/components/layout/BottomNav";
import { Header } from "@/components/layout/Header";
import { InstallPrompt } from "@/components/layout/InstallPrompt";
import { ToastProvider } from "@/components/ui/Toast";

export const metadata: Metadata = {
  title: { default: `${site.name} · ${site.tagline}`, template: `%s · ${site.name}` },
  description: site.description,
  applicationName: site.name,
  // 아이폰 '홈 화면에 추가'로 열면 주소창 없이 앱처럼
  appleWebApp: { capable: true, title: site.name, statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#2552e8",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <head>
        {/* 한글 글꼴 Pretendard (무료, CDN) */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      {/* 휴대폰: 아래 메뉴 높이만큼 여백 */}
      <body className="min-h-dvh pb-[calc(4rem+env(safe-area-inset-bottom))] sm:pb-0">
        <ToastProvider>
          <Header />
          <main className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6 print:max-w-none print:p-0">{children}</main>
          <footer className="mx-auto max-w-3xl px-4 pb-10 print:hidden text-center text-xs text-ink-faint">
            © {new Date().getFullYear()} {site.name} · 발견 위치 제보 서비스 (실시간 위치 추적 아님)
          </footer>
          <InstallPrompt />
          <BottomNav />
        </ToastProvider>
      </body>
    </html>
  );
}
