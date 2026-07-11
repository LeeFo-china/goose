import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "鹅班长",
  description: "鹅班长官方网站",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
