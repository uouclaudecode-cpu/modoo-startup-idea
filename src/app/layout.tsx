import type { Metadata, Viewport } from "next";
import "./globals.css";
import { site } from "@/config/site";
import { Header } from "@/components/layout/Header";
import { ToastProvider } from "@/components/ui/Toast";

export const metadata: Metadata = {
  title: { default: `${site.name} · ${site.tagline}`, template: `%s · ${site.name}` },
  description: site.description,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
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
      <body className="min-h-dvh">
        <ToastProvider>
          <Header />
          <main className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6">{children}</main>
          <footer className="mx-auto max-w-3xl px-4 pb-10 text-center text-xs text-ink-faint">
            © {new Date().getFullYear()} {site.name}
          </footer>
        </ToastProvider>
      </body>
    </html>
  );
}
