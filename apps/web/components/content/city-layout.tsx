import Link from "next/link";
import type { SiteContentPublicDetail } from "@gooes/domain";

import { ContentBlockRenderer } from "@/components/content/content-block-renderer";
import { CityStructuredData } from "@/components/content/content-structured-data";
import { Button } from "@/components/ui/button";

type CityDetail = Extract<SiteContentPublicDetail, { contentType: "city" }> & {
  readonly preview?: boolean;
};

export function CityLayout({ content }: { readonly content: CityDetail }): React.JSX.Element {
  return (
    <article className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-24">
      {content.preview ? null : <CityStructuredData content={content} />}
      <header className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(22rem,1.1fr)] lg:items-center">
        <div className="flex flex-col gap-6">
          <p className="text-sm font-medium text-muted-foreground">本地装修协作</p>
          <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
            {content.title}
          </h1>
          <p className="max-w-2xl text-pretty text-lg leading-8 text-muted-foreground sm:text-xl">
            {content.metadata.localServiceIntroduction}
          </p>
          <div>
            <Button asChild>
              <Link href="/partners">申请成为城市合伙人</Link>
            </Button>
          </div>
        </div>
        {content.cover ? (
          <figure className="overflow-hidden rounded-lg bg-muted">
            <img
              alt={content.cover.alt}
              className="aspect-[4/3] h-full w-full object-cover"
              decoding="async"
              fetchPriority="high"
              height={content.cover.height}
              src={content.cover.src}
              width={content.cover.width}
            />
          </figure>
        ) : null}
      </header>

      <div className="mx-auto mt-14 max-w-3xl border-t pt-12 sm:mt-20 sm:pt-16">
        <ContentBlockRenderer blocks={content.blocks} />
      </div>
    </article>
  );
}
