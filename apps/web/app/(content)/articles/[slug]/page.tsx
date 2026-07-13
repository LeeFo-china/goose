import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ArticleLayout } from "@/components/content/article-layout";
import {
  buildSiteContentMetadata,
  getSiteContentDetailForPage,
} from "@/lib/site-content-page";

interface ArticlePageProps {
  readonly params: Promise<{ readonly slug: string }>;
}

export async function generateMetadata({ params }: ArticlePageProps): Promise<Metadata> {
  const { slug } = await params;
  const content = await getSiteContentDetailForPage("article", slug);
  return buildSiteContentMetadata(content, `/articles/${slug}`);
}

export default async function ArticlePage({ params }: ArticlePageProps): Promise<React.JSX.Element> {
  const { slug } = await params;
  const content = await getSiteContentDetailForPage("article", slug);
  if (content.contentType !== "article") notFound();
  return <ArticleLayout content={content} />;
}
