import type { Metadata } from "next";

import { ContentList } from "@/components/content/content-list";
import { getPublicSiteContentList } from "@/lib/site-content-api";
import { parseContentListPage } from "@/lib/site-content-page";

export const metadata: Metadata = {
  title: "装修经营文章",
  description: "阅读鹅班长整理的装修经营、项目交付与客户服务文章。",
  alternates: { canonical: "/articles" },
};

interface ArticlesPageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ArticlesPage({ searchParams }: ArticlesPageProps): Promise<React.JSX.Element> {
  const query = await searchParams;
  const page = parseContentListPage(query.page);
  const data = await getPublicSiteContentList("article", { page, pageSize: 20 });

  return (
    <ContentList
      basePath="/articles"
      data={data}
      description="围绕装修经营、项目协作和客户服务，提供可直接参考的实践内容。"
      title="装修经营文章"
    />
  );
}
