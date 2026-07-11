import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BadgeCheck, Banknote, ClipboardList, Megaphone, UsersRound, Wrench } from "lucide-react";

import { Button } from "@/components/ui/button";

const capabilities = [
  { icon: UsersRound, title: "客户", description: "统一保留线索、房产、跟进与转项目过程。" },
  { icon: ClipboardList, title: "项目", description: "围绕项目组织成员、阶段、任务和关键状态。" },
  { icon: Wrench, title: "施工", description: "用日志和图片记录现场进展，减少口头信息丢失。" },
  { icon: BadgeCheck, title: "验收", description: "把节点、结果和问题整改留在交付链路内。" },
  { icon: Banknote, title: "财务", description: "费用与项目关联，便于按业务背景核对明细。" },
  { icon: Megaphone, title: "营销", description: "活动、来源和业务承接保持可追踪的关联。" },
] as const;

export function ProductSections(): React.JSX.Element {
  return (
    <>
      <section className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[minmax(20rem,0.8fr)_minmax(0,1.2fr)] lg:px-8 lg:py-20">
        <div className="flex flex-col justify-center gap-7">
          <p className="font-medium text-muted-foreground">产品能力</p>
          <h1 className="max-w-xl text-4xl font-semibold leading-[1.08] tracking-[-0.03em] sm:text-5xl lg:text-6xl">围绕装修工作流<br className="hidden sm:block" />组织每一条记录</h1>
          <p className="max-w-xl text-base leading-8 text-muted-foreground">客户、项目与现场工作使用同一业务上下文，减少重复录入和信息断点。</p>
          <Button asChild className="self-start" size="lg"><Link href="/solutions">查看业务解决方案<ArrowRight data-icon="inline-end" /></Link></Button>
        </div>
        <div className="relative min-h-[24rem] overflow-hidden rounded-lg lg:min-h-[36rem]">
          <Image alt="施工负责人在现场通过平板核对装修项目记录" className="object-cover object-center" fill priority sizes="(min-width: 1024px) 58vw, 100vw" src="/product-site-record.png" />
        </div>
      </section>

      <section className="border-y bg-muted">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <div className="max-w-3xl">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">从获客到交付，不切断业务上下文</h2>
            <p className="mt-4 leading-8 text-muted-foreground">六类能力按发生顺序连接，不做相互孤立的工具集合。</p>
          </div>
          <div className="mt-12 divide-y border-y">
            {capabilities.map(({ icon: Icon, title, description }, index) => (
              <article className="grid gap-3 py-6 sm:grid-cols-[3rem_10rem_minmax(0,1fr)] sm:items-center sm:gap-5" key={title}>
                <Icon aria-hidden className="text-muted-foreground" />
                <h3 className="text-xl font-semibold">{title}</h3>
                <p className="max-w-2xl leading-7 text-muted-foreground">{description}</p>
                {index === 2 ? <span className="sr-only">从经营进入现场交付</span> : null}
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(20rem,0.95fr)] lg:px-8 lg:py-24">
        <div className="relative min-h-[24rem] overflow-hidden rounded-lg">
          <Image alt="装修项目成员在现场核对图纸、进度与验收信息" className="object-cover" fill sizes="(min-width: 1024px) 54vw, 100vw" src="/home-project-meeting.png" />
        </div>
        <div className="flex flex-col justify-center gap-6">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">记录不是终点，下一步行动才是</h2>
          <p className="leading-8 text-muted-foreground">阶段变化、验收问题与费用信息都要回到明确的负责人和处理路径。具体可用能力以实际开通模块和权限为准。</p>
          <div className="flex flex-wrap gap-3">
            <Button asChild><Link href="/cases">查看项目案例</Link></Button>
            <Button asChild variant="outline"><Link href="/about">了解产品边界</Link></Button>
          </div>
        </div>
      </section>
    </>
  );
}
