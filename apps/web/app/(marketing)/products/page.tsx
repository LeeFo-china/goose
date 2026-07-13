import type { Metadata } from "next";

import { ProductSections } from "@/components/official-site/product-sections";

export const metadata: Metadata = {
  title: "产品能力",
  description: "了解鹅班长如何串联客户、项目、施工、验收、财务与营销工作。",
  alternates: { canonical: "/products" },
  openGraph: {
    title: "产品能力",
    description: "了解鹅班长如何串联客户、项目、施工、验收、财务与营销工作。",
    url: "/products",
  },
};

export default function ProductsPage(): React.JSX.Element {
  return <ProductSections />;
}
