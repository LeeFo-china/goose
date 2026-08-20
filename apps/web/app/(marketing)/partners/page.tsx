import type { Metadata } from "next";

import { PartnerApplicationForm } from "@/components/official-site/partner-application-form";
import { PartnerHero } from "@/components/official-site/partner-hero";
import { PartnerProcess } from "@/components/official-site/partner-process";
import { PartnerRevenue } from "@/components/official-site/partner-revenue";

export const metadata: Metadata = {
  title: "城市合伙人招募",
  description:
    "了解好店智装云城市合伙人的合作边界、平台收益分成、装企二维码绑定和申请流程。",
  alternates: {
    canonical: "/partners",
  },
  openGraph: {
    title: "城市合伙人招募",
    description:
      "了解好店智装云城市合伙人的合作边界、平台收益分成、装企二维码绑定和申请流程。",
    url: "/partners",
  },
};

export default function PartnersPage(): React.JSX.Element {
  return (
    <>
      <PartnerHero />
      <PartnerRevenue />
      <PartnerProcess />
      <section className="bg-muted" id="apply">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(16rem,0.7fr)_minmax(0,1.3fr)] lg:px-8 lg:py-24">
          <div className="flex flex-col gap-4">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              提交城市合伙人申请
            </h2>
            <p className="max-w-xl text-base leading-8 text-muted-foreground">
              先提供主体、城市和资源信息。官网短信验证码为选填项，申请提交后由平台运营人工沟通，不会直接开通合伙人身份。
            </p>
          </div>
          <div className="rounded-lg border bg-card p-5 sm:p-7">
            <PartnerApplicationForm />
          </div>
        </div>
      </section>
    </>
  );
}
