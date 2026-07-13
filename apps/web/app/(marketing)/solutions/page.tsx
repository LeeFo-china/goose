import type { Metadata } from "next";

import { SolutionSections } from "@/components/official-site/solution-sections";

export const metadata: Metadata = {
  title: "解决方案",
  description: "围绕装企经营、项目交付、客户透明和城市合作，建立可执行、可追踪的工作链路。",
  alternates: { canonical: "/solutions" },
  openGraph: {
    title: "解决方案",
    description: "围绕装企经营、项目交付、客户透明和城市合作，建立可执行、可追踪的工作链路。",
    url: "/solutions",
  },
};

export default function SolutionsPage(): React.JSX.Element {
  return <SolutionSections />;
}
