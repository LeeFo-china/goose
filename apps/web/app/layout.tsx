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
  alternates: {
    canonical: "/",
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
