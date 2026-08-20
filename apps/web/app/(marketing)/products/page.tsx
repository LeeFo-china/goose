import type { Metadata } from "next";

import { ProductSections } from "@/components/official-site/product-sections";
import { sharedOpenGraphMetadata } from "@/lib/site-open-graph";

export const metadata: Metadata = {
  title: "产品能力",
  description: "了解好店智装云如何串联客户、项目、施工、验收、财务与营销工作。",
  alternates: { canonical: "/products" },
  openGraph: {
    ...sharedOpenGraphMetadata,
    title: "产品能力",
    description: "了解好店智装云如何串联客户、项目、施工、验收、财务与营销工作。",
    url: "/products",
  },
};

export default function ProductsPage(): React.JSX.Element {
  return <ProductSections />;
}
