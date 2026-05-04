import type { Metadata } from "next";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

export const metadata: Metadata = {
  title: "鹅班长",
  description: "鹅班长AI助力装修管理后台",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        <TooltipProvider delayDuration={0} skipDelayDuration={100}>
          {children}
          <Toaster richColors />
        </TooltipProvider>
      </body>
    </html>
  );
}
