import type { Metadata } from "next";

import { ContentList } from "@/components/content/content-list";
import {
  buildContentListCanonical,
  getSiteContentListForPage,
  resolveContentListPage,
} from "@/lib/site-content-page";

const PAGE_METADATA = {
  title: "装修经营文章",
  description: "阅读鹅班长整理的装修经营、项目交付与客户服务文章。",
} as const;

interface ArticlesPageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ searchParams }: ArticlesPageProps): Promise<Metadata> {
  const page = await resolveContentListPage(searchParams);
  return {
    ...PAGE_METADATA,
    alternates: { canonical: buildContentListCanonical("/articles", page) },
  };
}

export default async function ArticlesPage({ searchParams }: ArticlesPageProps): Promise<React.JSX.Element> {
  const page = await resolveContentListPage(searchParams);
  const data = await getSiteContentListForPage("article", page);

  return (
    <ContentList
      basePath="/articles"
      data={data}
      description="围绕装修经营、项目协作和客户服务，提供可直接参考的实践内容。"
      title="装修经营文章"
    />
  );
}
