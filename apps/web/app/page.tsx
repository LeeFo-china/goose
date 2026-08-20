import type { Metadata } from "next";

import { HomeSections } from "@/components/official-site/home-sections";

export const metadata: Metadata = {
  title: "装修经营与项目交付平台",
  description: "好店智装云连接客户、项目、施工、验收、财务与营销，让装修业务过程有记录、结果可核对。",
  alternates: { canonical: "/" },
};

export default function HomePage(): React.JSX.Element {
  return <HomeSections />;
}
