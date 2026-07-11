import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";

const solutions = [
  ["装企经营", "客户来源和项目结果分散", "让客户档案、项目推进和经营记录保持关联。"],
  ["项目交付", "现场信息回传慢，问题缺少归属", "按项目沉淀施工、验收与整改过程。"],
  ["客户透明", "业主只能反复询问当前进展", "以经过确认的项目记录支持对客进度查看。"],
  ["城市合作", "本地拓展关系和收益依据不清", "记录装企绑定、收入与结算所需的业务依据。"],
] as const;

export function SolutionSections(): React.JSX.Element {
  return (
    <>
      <section className="grid min-h-[calc(100dvh-4rem)] lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]">
        <div className="mx-auto flex w-full max-w-2xl flex-col justify-center gap-7 px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <p className="font-medium text-muted-foreground">解决方案</p>
          <h1 className="max-w-xl text-4xl font-semibold leading-[1.08] tracking-[-0.03em] sm:text-5xl lg:text-6xl">从实际问题出发<br className="hidden sm:block" />建立协作链路</h1>
          <p className="max-w-xl text-base leading-8 text-muted-foreground">先确认经营和交付中的断点，再选择需要连接的人员、记录与动作。</p>
          <Button asChild className="self-start" size="lg"><Link href="/products">核对产品能力<ArrowRight data-icon="inline-end" /></Link></Button>
        </div>
        <div className="relative min-h-[46dvh] overflow-hidden lg:min-h-full">
          <Image alt="装修施工团队在住宅工地核对图纸与现场进度" className="object-cover object-[62%_center]" fill priority sizes="(min-width: 1024px) 58vw, 100vw" src="/partner-hero-construction-team.png" />
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <h2 className="max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">四类问题，对应四条清楚的处理路径</h2>
        <div className="mt-12 border-y">
          {solutions.map(([title, problem, response]) => (
            <article className="grid gap-4 border-b py-7 last:border-b-0 md:grid-cols-[12rem_minmax(0,0.9fr)_minmax(0,1.1fr)] md:gap-8" key={title}>
              <h3 className="text-xl font-semibold">{title}</h3>
              <p className="leading-7 text-muted-foreground">{problem}</p>
              <p className="leading-7">{response}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="bg-muted">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)] lg:px-8 lg:py-24">
          <div className="relative min-h-[26rem] overflow-hidden rounded-lg">
            <Image alt="装修项目会议中各方共同查看施工计划" className="object-cover" fill sizes="(min-width: 1024px) 58vw, 100vw" src="/home-project-meeting.png" />
          </div>
          <div className="flex flex-col justify-center gap-6">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">城市合作有独立的申请与审核流程</h2>
            <p className="leading-8 text-muted-foreground">官网公开合作边界、收益依据和申请流程。提交申请不等于自动开通身份，平台运营会进行后续沟通。</p>
            <Button asChild className="self-start" variant="outline"><Link href="/partners">了解城市合伙人<ArrowRight data-icon="inline-end" /></Link></Button>
          </div>
        </div>
      </section>
    </>
  );
}
