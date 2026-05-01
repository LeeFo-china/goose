import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "固鹅后台",
  description: "固鹅业务管理后台",
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
