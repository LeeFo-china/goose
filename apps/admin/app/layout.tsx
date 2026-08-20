import type { Metadata } from "next";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

export const metadata: Metadata = {
  title: "好店智装云",
  description: "好店智装云 AI 装修管理后台",
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
