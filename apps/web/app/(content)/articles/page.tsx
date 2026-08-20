import type { Metadata } from "next";

import { ContentList } from "@/components/content/content-list";
import {
  buildContentListCanonical,
  getSiteContentListForPage,
  resolveContentListPage,
} from "@/lib/site-content-page";

const PAGE_METADATA = {
  title: "装修经营文章",
  description: "阅读好店智装云整理的装修经营、项目交付与客户服务文章。",
} as const;

interface ArticlesPageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ searchParams }: ArticlesPageProps): Promise<Metadata> {
  const page = await resolveContentListPage(searchParams);
  const canonical = buildContentListCanonical("/articles", page);
  const title = page === 1 ? PAGE_METADATA.title : `${PAGE_METADATA.title} - 第 ${page} 页`;
  const description = page === 1
    ? PAGE_METADATA.description
    : `${PAGE_METADATA.description} 当前为第 ${page} 页。`;
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description, url: canonical },
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
