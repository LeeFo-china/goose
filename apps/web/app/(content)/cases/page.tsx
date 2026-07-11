import type { Metadata } from "next";

import { ContentList } from "@/components/content/content-list";
import {
  buildContentListCanonical,
  getSiteContentListForPage,
  resolveContentListPage,
} from "@/lib/site-content-page";

const PAGE_METADATA = {
  title: "装修案例",
  description: "查看鹅班长公开的真实装修项目案例与交付记录。",
} as const;

interface CasesPageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ searchParams }: CasesPageProps): Promise<Metadata> {
  const page = await resolveContentListPage(searchParams);
  return {
    ...PAGE_METADATA,
    alternates: { canonical: buildContentListCanonical("/cases", page) },
  };
}

export default async function CasesPage({ searchParams }: CasesPageProps): Promise<React.JSX.Element> {
  const page = await resolveContentListPage(searchParams);
  const data = await getSiteContentListForPage("case", page);

  return (
    <ContentList
      basePath="/cases"
      data={data}
      description="从真实项目中了解面积、装修类型、现场过程与交付结果。"
      title="装修案例"
    />
  );
}
