import Image from "next/image";
import Link from "next/link";
import { ArrowRight, CircleCheck, CircleX } from "lucide-react";

import { Button } from "@/components/ui/button";

const boundaries = [
  ["我们提供", "围绕装修经营和项目交付的业务记录、协作流程与权限工具。"],
  ["我们不替代", "装企自身的合同责任、专业判断、现场管理与法定验收义务。"],
] as const;

export function AboutSections(): React.JSX.Element {
  return (
    <>
      <section className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[minmax(20rem,0.82fr)_minmax(0,1.18fr)] lg:px-8 lg:py-20">
        <div className="flex flex-col justify-center gap-7">
          <p className="font-medium text-muted-foreground">关于鹅班长</p>
          <h1 className="max-w-xl text-4xl font-semibold leading-[1.08] tracking-[-0.03em] sm:text-5xl lg:text-6xl">让装修业务过程<br className="hidden sm:block" />更清楚、更可靠</h1>
          <p className="max-w-xl text-base leading-8 text-muted-foreground">我们把分散在客户沟通、项目现场和经营核对中的记录，组织成可追踪的业务链路。</p>
          <Button asChild className="self-start" size="lg"><Link href="/products">了解产品能力<ArrowRight data-icon="inline-end" /></Link></Button>
        </div>
        <div className="relative min-h-[24rem] overflow-hidden rounded-lg lg:min-h-[36rem]">
          <Image alt="装修项目各方在毛坯住宅内共同核对图纸" className="object-cover object-center" fill priority sizes="(min-width: 1024px) 58vw, 100vw" src="/home-project-meeting.png" />
        </div>
      </section>

      <section className="border-y bg-muted">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <h2 className="max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">产品服务有明确边界</h2>
          <div className="mt-10 grid gap-8 lg:grid-cols-2">
            {boundaries.map(([title, description], index) => (
              <article className="flex gap-5 border-t pt-7" key={title}>
                {index === 0 ? <CircleCheck aria-hidden className="mt-1 shrink-0 text-muted-foreground" /> : <CircleX aria-hidden className="mt-1 shrink-0 text-muted-foreground" />}
                <div className="flex flex-col gap-3">
                  <h3 className="text-2xl font-semibold">{title}</h3>
                  <p className="max-w-xl leading-8 text-muted-foreground">{description}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(20rem,0.9fr)] lg:px-8 lg:py-24">
        <div className="flex flex-col gap-6">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">联系与合作</h2>
          <p className="max-w-2xl leading-8 text-muted-foreground">城市合作请通过城市合伙人页面提交主体、城市与资源信息。其他业务联系渠道和主体信息，以官网后续公开内容及实际运营沟通为准。</p>
          <div className="flex flex-wrap gap-3">
            <Button asChild><Link href="/partners">提交城市合作申请</Link></Button>
            <Button asChild variant="outline"><Link href="/solutions">查看解决方案</Link></Button>
          </div>
        </div>
        <div className="flex flex-col gap-5 border-t pt-8 lg:border-t-0 lg:border-l lg:pl-12 lg:pt-0">
          <h2 className="text-2xl font-semibold">合规原则</h2>
          <p className="leading-8 text-muted-foreground">公开页面不承诺未确认的服务范围、收益或业务结果。涉及个人信息、项目资料与权限的数据处理，以实际协议、授权和适用规则为准。</p>
          <p className="text-sm leading-7 text-muted-foreground">网站域名：www.goodcms.cn</p>
        </div>
      </section>
    </>
  );
}
