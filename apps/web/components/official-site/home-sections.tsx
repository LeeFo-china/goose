import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ClipboardCheck, HardHat, UsersRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

const workflow = [
  ["客户进入", "线索、房产和沟通记录归到同一客户档案。"],
  ["项目推进", "合同后的阶段、人员与待办沿项目持续更新。"],
  ["现场留痕", "施工日志、图片与验收结论按时间回到项目。"],
  ["经营复盘", "费用、营销来源和交付结果保留核对依据。"],
] as const;

export function HomeSections(): React.JSX.Element {
  return (
    <>
      <section className="grid min-h-[calc(100dvh-4rem)] lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="mx-auto flex w-full max-w-2xl flex-col justify-center gap-7 px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <p className="font-medium text-muted-foreground">装修业务协作平台</p>
          <h1 className="max-w-xl text-4xl font-semibold leading-[1.08] tracking-[-0.03em] sm:text-5xl">
            把装修经营与项目交付<br className="hidden sm:block" />收进一条业务线
          </h1>
          <p className="max-w-xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
            从客户建档到施工验收，让每次推进都有负责人、时间和结果。
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/products">查看产品能力<ArrowRight data-icon="inline-end" /></Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/solutions">按业务问题了解方案</Link>
            </Button>
          </div>
        </div>
        <div className="relative min-h-[46dvh] overflow-hidden lg:min-h-full">
          <Image
            alt="装修项目成员在毛坯住宅内核对图纸和项目记录"
            className="object-cover object-center"
            fill
            priority
            sizes="(min-width: 1024px) 55vw, 100vw"
            src="/home-project-meeting.png"
          />
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="max-w-3xl">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">一条业务线，覆盖四个关键时刻</h2>
          <p className="mt-4 text-base leading-8 text-muted-foreground">信息不在功能之间搬运，工作沿着真实装修流程继续。</p>
        </div>
        <div className="mt-12 grid border-y md:grid-cols-2">
          {workflow.map(([title, description], index) => (
            <div className={`flex gap-5 py-7 md:px-7 ${index % 2 === 0 ? "md:border-r" : ""} ${index < 2 ? "border-b" : ""}`} key={title}>
              {index === 0 ? <UsersRound aria-hidden className="mt-1 shrink-0 text-muted-foreground" /> : null}
              {index === 1 ? <ClipboardCheck aria-hidden className="mt-1 shrink-0 text-muted-foreground" /> : null}
              {index === 2 ? <HardHat aria-hidden className="mt-1 shrink-0 text-muted-foreground" /> : null}
              {index === 3 ? <ArrowRight aria-hidden className="mt-1 shrink-0 text-muted-foreground" /> : null}
              <div className="flex flex-col gap-2">
                <h3 className="text-xl font-semibold">{title}</h3>
                <p className="max-w-md leading-7 text-muted-foreground">{description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-muted">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)] lg:px-8 lg:py-24">
          <div className="relative min-h-[28rem] overflow-hidden rounded-lg">
            <Image alt="施工现场负责人使用平板记录项目进度" className="object-cover" fill sizes="(min-width: 1024px) 58vw, 100vw" src="/product-site-record.png" />
          </div>
          <div className="flex flex-col justify-center gap-6">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">现场发生的事，经营端当天能看见</h2>
            <p className="text-base leading-8 text-muted-foreground">施工记录、节点验收和项目费用围绕同一个项目组织，负责人可以从异常回到原始记录。</p>
            <Button asChild className="self-start" variant="outline"><Link href="/cases">查看项目案例<ArrowRight data-icon="inline-end" /></Link></Button>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:px-8 lg:py-24">
        <div className="flex flex-col gap-5">
          <p className="font-medium text-muted-foreground">城市合作</p>
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">本地资源有归属，合作收益有依据</h2>
          <p className="max-w-xl leading-8 text-muted-foreground">城市合伙人拓展装企后，平台记录绑定关系、收入和结算依据，合作边界先公开再申请。</p>
          <Button asChild className="self-start" variant="outline"><Link href="/partners">了解城市合伙人<ArrowRight data-icon="inline-end" /></Link></Button>
        </div>
        <div className="flex flex-col justify-between gap-8 border-t pt-8 lg:border-t-0 lg:border-l lg:pl-12 lg:pt-0">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">先看清产品边界，再决定如何接入</h2>
            <p className="mt-4 max-w-xl leading-8 text-muted-foreground">产品页说明能力与工作流，关于页说明我们提供什么、不替代什么。</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild><Link href="/products">查看产品能力</Link></Button>
            <Button asChild variant="ghost"><Link href="/about">了解产品边界</Link></Button>
          </div>
        </div>
      </section>
      <Separator />
    </>
  );
}
