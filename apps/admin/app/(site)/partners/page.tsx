import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowDownRight,
  Building2,
  CheckCircle2,
  CircleDollarSign,
  MapPinned,
  QrCode,
  ReceiptText,
  ShieldCheck,
} from "lucide-react";
import { PartnerApplicationForm } from "@/components/official-site/partner-application-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export const metadata: Metadata = {
  title: "城市合伙人招募 | 鹅班长",
  description: "鹅班长面向区域代理商和独立业务合伙人开放城市合伙人申请。",
};

const revenueItems = [
  {
    title: "装修公司的充值消费",
    description: "装企在平台内购买短信、AI、营销和运营能力产生的平台收入，可进入合伙人分成池。",
  },
  {
    title: "客户线索成交返点",
    description: "平台线索分配给装修公司并成交后，线索服务费默认 2.5%，按后台规则参与分配。",
  },
  {
    title: "后续平台商业收入",
    description: "广告位、城市活动等新增平台收入点上线后，可继续纳入后台配置的分成规则。",
  },
] as const;

const processItems = [
  "提交城市合伙人申请",
  "平台人工审核区域与资源",
  "开通合伙人身份和专属二维码",
  "装修公司扫码入驻并自动绑定",
  "平台收入按月结算",
] as const;

const partnerAdvantages = [
  "本地装企拓展更容易形成信任",
  "装企入驻、线索、用量和结算都在后台留痕",
  "分成比例由合伙人等级和后台策略控制",
] as const;

export default function CityPartnerRecruitmentPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <HeroSection />
      <section id="policy" className="border-y bg-card">
        <div className="mx-auto grid max-w-6xl gap-8 px-5 py-14 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
          <div>
            <Badge variant="secondary">收益边界</Badge>
            <h2 className="mt-4 max-w-xl text-3xl font-semibold leading-tight text-balance">
              合伙人只参与平台收入分成，装修公司自己的业务收支独立。
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-8 text-muted-foreground">
              平台不介入装修公司自己的合同、施工收款、供应链付款和内部利润。合伙人收益来自平台明确记录的平台收入，第一期按月结人工核对。
            </p>
          </div>
          <div className="grid gap-3">
            {revenueItems.map((item) => (
              <div key={item.title} className="rounded-lg border bg-background p-5">
                <div className="flex items-center gap-3">
                  <CircleDollarSign className="size-5 text-primary" />
                  <h3 className="font-semibold">{item.title}</h3>
                </div>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-8 px-5 py-16 lg:grid-cols-[1fr_1fr] lg:px-8">
        <div className="rounded-lg border bg-card p-6">
          <div className="flex items-center gap-3">
            <QrCode className="size-5 text-primary" />
            <h2 className="text-2xl font-semibold">专属二维码绑定装企</h2>
          </div>
          <p className="mt-4 text-sm leading-7 text-muted-foreground">
            合伙人身份开通后，装修公司通过小程序扫描专属二维码入驻，系统自动建立装企与合伙人的归属关系。只要合伙人身份合规，该装企后续产生的平台收入都能追溯到对应合伙人。
          </p>
          <Separator className="my-6" />
          <div className="grid gap-3">
            {partnerAdvantages.map((item) => (
              <div key={item} className="flex items-start gap-3 text-sm">
                <CheckCircle2 className="mt-0.5 size-4 text-success" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border bg-card p-6">
          <div className="flex items-center gap-3">
            <ReceiptText className="size-5 text-primary" />
            <h2 className="text-2xl font-semibold">第一期采用人工月结</h2>
          </div>
          <p className="mt-4 text-sm leading-7 text-muted-foreground">
            后台会记录平台收入、合伙人等级、分成比例、分佣台账和月结批次。第一期由平台运营按月核对并人工打款，等分账资质和风控流程稳定后再推进自动化结算。
          </p>
          <Separator className="my-6" />
          <div className="grid gap-3">
            <PolicyRow label="等级策略" value="后台配置，不在官网承诺固定比例" />
            <PolicyRow label="结算周期" value="月结" />
            <PolicyRow label="线索服务费" value="默认 2.5%" />
          </div>
        </div>
      </section>

      <section className="bg-primary text-background">
        <div className="mx-auto max-w-6xl px-5 py-16 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <Badge variant="outline" className="border-background/40 text-background">
                开通流程
              </Badge>
              <h2 className="mt-4 text-3xl font-semibold leading-tight text-balance">
                从申请到装企绑定，每一步都留在平台后台。
              </h2>
            </div>
            <div className="grid gap-0 overflow-hidden rounded-lg border border-background/20">
              {processItems.map((item, index) => (
                <div
                  key={item}
                  className="grid grid-cols-[56px_1fr] items-center border-b border-background/20 bg-background/5 last:border-b-0"
                >
                  <div className="flex h-full items-center justify-center border-r border-background/20 text-sm tabular-nums text-background/70">
                    {index + 1}
                  </div>
                  <div className="px-5 py-4 font-medium">{item}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="apply" className="mx-auto grid max-w-6xl gap-8 px-5 py-16 lg:grid-cols-[0.85fr_1.15fr] lg:px-8">
        <div>
          <Badge variant="secondary">申请合作</Badge>
          <h2 className="mt-4 text-3xl font-semibold leading-tight text-balance">
            先提交城市和资源信息，平台运营会人工沟通。
          </h2>
          <p className="mt-4 text-base leading-8 text-muted-foreground">
            第一版官网不直接开通合伙人身份。审核通过后，超管后台会创建待启用的正式合伙人，再继续补充合同、结算账户和二维码能力。
          </p>
        </div>
        <div className="rounded-lg border bg-card p-5 md:p-6">
          <PartnerApplicationForm />
        </div>
      </section>
    </main>
  );
}

function HeroSection() {
  return (
    <section className="relative isolate min-h-[86svh] overflow-hidden">
      <img
        src="/partner-hero-renovation.png"
        alt="装修城市合伙人和本地团队查看项目规划"
        className="absolute inset-0 -z-20 size-full object-cover"
      />
      <div className="absolute inset-0 -z-10 bg-primary/70" />
      <div className="mx-auto flex min-h-[86svh] max-w-6xl flex-col px-5 py-5 lg:px-8">
        <header className="flex items-center justify-between gap-4">
          <Link href="/partners" className="flex items-center gap-3 text-background">
            <span className="flex size-11 items-center justify-center rounded-lg border border-background/30 bg-background/95">
              <img src="/logo.png" alt="鹅班长" className="size-9 object-contain" />
            </span>
            <span className="text-base font-semibold">鹅班长</span>
          </Link>
          <Button asChild variant="secondary">
            <a href="#apply">
              提交申请
              <ArrowDownRight data-icon="inline-end" />
            </a>
          </Button>
        </header>

        <div className="flex flex-1 items-center py-16">
          <div className="max-w-3xl text-background">
            <Badge variant="secondary">城市合伙人招募</Badge>
            <h1 className="mt-6 text-4xl font-semibold leading-tight text-balance md:text-6xl">
              在你的城市，运营鹅班长装修平台。
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-9 text-background/85">
              面向区域代理商和独立业务合伙人开放。你负责本地装修公司拓展和市场运营，平台提供系统、线索、归因和结算依据。
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <a href="#apply">
                  申请城市合伙人
                  <ArrowDownRight data-icon="inline-end" />
                </a>
              </Button>
              <Button asChild size="lg" variant="outline" className="border-background/40 bg-background/10 text-background hover:bg-background/20">
                <a href="#policy">查看收益边界</a>
              </Button>
            </div>
          </div>
        </div>

        <div className="mb-8 grid gap-3 rounded-lg border border-background/20 bg-background/10 p-4 text-background backdrop-blur-sm md:grid-cols-3">
          <HeroSignal icon={<Building2 className="size-5" />} label="拓展对象" value="本地装修公司入驻" />
          <HeroSignal icon={<MapPinned className="size-5" />} label="归因方式" value="专属二维码绑定" />
          <HeroSignal icon={<ShieldCheck className="size-5" />} label="结算方式" value="第一期人工月结" />
        </div>
      </div>
    </section>
  );
}

function HeroSignal({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="text-accent">{icon}</div>
      <div>
        <div className="text-xs text-background/70">{label}</div>
        <div className="mt-1 text-sm font-semibold">{value}</div>
      </div>
    </div>
  );
}

function PolicyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border bg-background px-4 py-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
