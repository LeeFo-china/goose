import type { Metadata } from "next";

import { ContentList } from "@/components/content/content-list";
import { getPublicSiteContentList } from "@/lib/site-content-api";
import { parseContentListPage } from "@/lib/site-content-page";

export const metadata: Metadata = {
  title: "装修案例",
  description: "查看鹅班长公开的真实装修项目案例与交付记录。",
  alternates: { canonical: "/cases" },
};

interface CasesPageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CasesPage({ searchParams }: CasesPageProps): Promise<React.JSX.Element> {
  const query = await searchParams;
  const page = parseContentListPage(query.page);
  const data = await getPublicSiteContentList("case", { page, pageSize: 20 });

  return (
    <ContentList
      basePath="/cases"
      data={data}
      description="从真实项目中了解面积、装修类型、现场过程与交付结果。"
      title="装修案例"
    />
  );
}
