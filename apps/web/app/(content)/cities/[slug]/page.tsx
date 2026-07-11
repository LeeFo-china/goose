import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CityLayout } from "@/components/content/city-layout";
import {
  buildSiteContentMetadata,
  getSiteContentDetailForPage,
} from "@/lib/site-content-page";

interface CityPageProps {
  readonly params: Promise<{ readonly slug: string }>;
}

export async function generateMetadata({ params }: CityPageProps): Promise<Metadata> {
  const { slug } = await params;
  const content = await getSiteContentDetailForPage("city", slug);
  return buildSiteContentMetadata(content, `/cities/${slug}`);
}

export default async function CityPage({ params }: CityPageProps): Promise<React.JSX.Element> {
  const { slug } = await params;
  const content = await getSiteContentDetailForPage("city", slug);
  if (content.contentType !== "city") notFound();
  return <CityLayout content={content} />;
}
