import type { Metadata } from "next";
import Link from "next/link";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "预览链接不可用",
  robots: { index: false, follow: false },
};

export default function PreviewErrorPage(): React.JSX.Element {
  return (
    <section className="mx-auto flex min-h-[60vh] w-full max-w-3xl flex-col justify-center gap-6 px-4 py-20">
      <div className="flex max-w-2xl flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">预览链接不可用</h1>
        <p className="text-base leading-7 text-muted-foreground">
          该链接可能已过期或已使用。请返回内容管理后台，重新生成预览链接。
        </p>
      </div>
      <Alert>
        <AlertTitle>预览内容未公开</AlertTitle>
        <AlertDescription>
          为保护草稿内容，预览链接只能使用一次，预览会话仅保留 15 分钟。
        </AlertDescription>
      </Alert>
      <div>
        <Button asChild>
          <Link href="/">返回官网首页</Link>
        </Button>
      </div>
    </section>
  );
}
