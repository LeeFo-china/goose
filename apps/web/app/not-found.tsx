import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound(): React.JSX.Element {
  return (
    <section className="mx-auto flex min-h-[60vh] max-w-3xl flex-col items-center justify-center gap-6 px-4 py-20 text-center">
      <p className="text-sm font-medium text-primary">404</p>
      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">页面未找到</h1>
      <p className="max-w-xl text-base leading-7 text-muted-foreground">
        你访问的页面可能已移动或不存在。可以返回首页，或继续了解城市合伙人计划。
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <Button asChild><Link href="/">返回首页</Link></Button>
        <Button asChild variant="outline"><Link href="/partners">了解城市合伙人</Link></Button>
      </div>
    </section>
  );
}
