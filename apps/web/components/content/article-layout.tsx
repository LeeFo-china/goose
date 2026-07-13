import type { SiteContentPublicDetail } from "@gooes/domain";

import { ContentBlockRenderer } from "@/components/content/content-block-renderer";
import { ArticleStructuredData } from "@/components/content/content-structured-data";

type ArticleDetail = Extract<SiteContentPublicDetail, { contentType: "article" }> & {
  readonly preview?: boolean;
};

export function ArticleLayout({ content }: { readonly content: ArticleDetail }): React.JSX.Element {
  return (
    <article className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-24">
      {content.preview ? null : <ArticleStructuredData content={content} />}
      <header className="flex max-w-3xl flex-col gap-5">
        <p className="text-sm font-medium text-muted-foreground">
          {content.metadata.category} / {formatDate(content.metadata.displayPublishedAt)} / {content.metadata.author}
        </p>
        <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
          {content.title}
        </h1>
        {content.summary ? (
          <p className="text-pretty text-lg leading-8 text-muted-foreground sm:text-xl">
            {content.summary}
          </p>
        ) : null}
      </header>

      {content.cover ? (
        <figure className="my-10 overflow-hidden rounded-lg bg-muted sm:my-14">
          <img
            alt={content.cover.alt}
            className="h-auto max-h-[42rem] w-full object-cover"
            decoding="async"
            fetchPriority="high"
            height={content.cover.height}
            src={content.cover.src}
            width={content.cover.width}
          />
        </figure>
      ) : null}

      <div className="mx-auto max-w-3xl">
        <ContentBlockRenderer blocks={content.blocks} />
      </div>
    </article>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "long",
    timeZone: "Asia/Shanghai",
  }).format(new Date(value));
}
