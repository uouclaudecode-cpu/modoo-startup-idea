import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Suspense } from "react";
import "./globals.css";
import { site } from "@/config/site";
import { AppSplash } from "@/components/layout/AppSplash";
import { BottomNav } from "@/components/layout/BottomNav";
import { Header } from "@/components/layout/Header";
import { InstallPrompt } from "@/components/layout/InstallPrompt";
import { NavProgress } from "@/components/layout/NavProgress";
import { IntroSlides } from "@/components/onboarding/IntroSlides";
import { ToastProvider } from "@/components/ui/Toast";

export const metadata: Metadata = {
  // 공유 미리보기(카카오톡 등) 이미지 주소를 완전한 주소로 만들기 위한 기준 주소
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3005"),
  title: { default: `${site.name} · ${site.tagline}`, template: `%s · ${site.name}` },
  description: site.description,
  openGraph: { siteName: site.name, locale: "ko_KR", type: "website" },
  twitter: { card: "summary_large_image" },
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
        <AppSplash />
        <Suspense fallback={null}>
          <NavProgress />
        </Suspense>
        <ToastProvider>
          <Header />
          <main className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6 print:max-w-none print:p-0">{children}</main>
          <footer className="mx-auto max-w-3xl space-y-2 px-4 pb-10 text-center text-xs text-ink-muted print:hidden">
            <nav aria-label="약관 및 문의" className="flex flex-wrap justify-center gap-x-3 gap-y-1">
              <Link href="/terms" className="hover:text-ink-soft hover:underline">
                이용약관
              </Link>
              <Link href="/privacy" className="font-semibold text-ink-muted hover:text-ink-soft hover:underline">
                개인정보처리방침
              </Link>
              <Link href="/location-terms" className="hover:text-ink-soft hover:underline">
                위치정보 이용약관
              </Link>
              <Link href="/contact" className="hover:text-ink-soft hover:underline">
                문의하기
              </Link>
            </nav>
            <p>
              © {new Date().getFullYear()} {site.name} · 발견 제보 서비스 (실시간 위치 추적 아님)
            </p>
          </footer>
          <IntroSlides />
          <InstallPrompt />
          <BottomNav />
        </ToastProvider>
      </body>
    </html>
  );
}
