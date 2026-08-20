import Image from "next/image";
import Link from "next/link";
import { ArrowDownRight } from "lucide-react";

import { Button } from "@/components/ui/button";

export function PartnerHero(): React.JSX.Element {
  return (
    <section
      aria-labelledby="partner-hero-heading"
      className="grid min-h-[calc(100dvh-4rem)] bg-background lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]"
    >
      <div className="mx-auto flex w-full max-w-2xl flex-col justify-center gap-7 px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <h1
          className="max-w-xl text-4xl font-semibold leading-[1.08] tracking-[-0.03em] sm:text-5xl lg:text-6xl"
          id="partner-hero-heading"
        >
          好店智装云城市合伙人招募
        </h1>
        <p className="max-w-xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
          拓展本地装修公司，平台记录绑定、收入与结算依据。合作边界清楚后，再决定是否申请。
        </p>
        <div className="flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link href="#apply">
              提交合作申请
              <ArrowDownRight data-icon="inline-end" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="#revenue">查看收益边界</Link>
          </Button>
        </div>
      </div>

      <div className="relative min-h-[44dvh] overflow-hidden lg:min-h-full">
        <Image
          alt="装修施工团队在住宅工地查看施工图纸"
          className="object-cover object-[62%_center]"
          fill
          priority
          sizes="(min-width: 1024px) 58vw, 100vw"
          src="/partner-hero-construction-team.png"
        />
      </div>
    </section>
  );
}
