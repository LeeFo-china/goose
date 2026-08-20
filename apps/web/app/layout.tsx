import type { Metadata } from "next";

import { SiteShell } from "@/components/official-site/site-shell";
import { ThemeProvider } from "@/components/theme-provider";
import { sharedOpenGraphMetadata } from "@/lib/site-open-graph";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.goodcms.cn"),
  title: {
    default: "好店智装云",
    template: "%s | 好店智装云",
  },
  description: "好店智装云连接装修企业、城市合伙人与施工服务，让装修协作更透明、更高效。",
  applicationName: "好店智装云",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    ...sharedOpenGraphMetadata,
    title: "好店智装云",
    description: "连接装修经营、项目交付与城市合作。",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "好店智装云",
    description: "连接装修经营、项目交付与城市合作。",
    images: [{ url: "/opengraph-image", alt: "好店智装云官网" }],
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
