import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CaseLayout } from "@/components/content/case-layout";
import {
  buildSiteContentMetadata,
  getSiteContentDetailForPage,
} from "@/lib/site-content-page";

interface CasePageProps {
  readonly params: Promise<{ readonly slug: string }>;
}

export async function generateMetadata({ params }: CasePageProps): Promise<Metadata> {
  const { slug } = await params;
  const content = await getSiteContentDetailForPage("case", slug);
  return buildSiteContentMetadata(content, `/cases/${slug}`);
}

export default async function CasePage({ params }: CasePageProps): Promise<React.JSX.Element> {
  const { slug } = await params;
  const content = await getSiteContentDetailForPage("case", slug);
  if (content.contentType !== "case") notFound();
  return <CaseLayout content={content} />;
}
