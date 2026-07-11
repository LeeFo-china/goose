import type { Metadata } from "next";

import { SiteShell } from "@/components/official-site/site-shell";
import { ThemeProvider } from "@/components/theme-provider";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.goodcms.cn"),
  title: {
    default: "鹅班长",
    template: "%s | 鹅班长",
  },
  description: "鹅班长连接装修企业、城市合伙人与施工服务，让装修协作更透明、更高效。",
  applicationName: "鹅班长",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "鹅班长",
    description: "连接装修经营、项目交付与城市合作。",
    siteName: "鹅班长",
    type: "website",
    locale: "zh_CN",
    url: "/",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "鹅班长官网" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "鹅班长",
    description: "连接装修经营、项目交付与城市合作。",
    images: ["/opengraph-image"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          disableTransitionOnChange
          enableSystem
        >
          <SiteShell>{children}</SiteShell>
        </ThemeProvider>
      </body>
    </html>
  );
}
