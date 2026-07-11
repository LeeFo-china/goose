import type { Metadata } from "next";

import { AboutSections } from "@/components/official-site/about-sections";

export const metadata: Metadata = {
  title: "关于我们",
  description: "了解鹅班长的产品使命、服务边界、联系渠道与合规原则。",
  alternates: { canonical: "/about" },
};

export default function AboutPage(): React.JSX.Element {
  return <AboutSections />;
}
