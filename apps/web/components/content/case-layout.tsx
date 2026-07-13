import type { SiteContentPublicDetail } from "@gooes/domain";

import { ContentBlockRenderer } from "@/components/content/content-block-renderer";
import { CaseStructuredData } from "@/components/content/content-structured-data";

type CaseDetail = Extract<SiteContentPublicDetail, { contentType: "case" }> & {
  readonly preview?: boolean;
};

export function CaseLayout({ content }: { readonly content: CaseDetail }): React.JSX.Element {
  const facts = [
    { label: "所在城市", value: content.metadata.city },
    { label: "项目面积", value: `${content.metadata.areaSquareMeters} 平方米` },
    { label: "装修类型", value: content.metadata.decorationType },
    ...content.metadata.metrics,
  ];

  return (
    <article className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-24">
      {content.preview ? null : <CaseStructuredData content={content} />}
      <header className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(22rem,1.15fr)] lg:items-end">
        <div className="flex flex-col gap-5">
          <p className="text-sm font-medium text-muted-foreground">真实装修案例</p>
          <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
            {content.title}
          </h1>
          {content.summary ? (
            <p className="max-w-2xl text-pretty text-lg leading-8 text-muted-foreground">
              {content.summary}
            </p>
          ) : null}
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

      <dl className="my-12 grid grid-cols-2 gap-x-6 gap-y-8 border-y py-8 sm:grid-cols-4 lg:my-16">
        {facts.map((fact, index) => (
          <div className="flex min-w-0 flex-col gap-2" key={`${fact.label}-${index}`}>
            <dt className="text-sm text-muted-foreground">{fact.label}</dt>
            <dd className="break-words text-xl font-semibold tabular-nums">{fact.value}</dd>
          </div>
        ))}
      </dl>

      <div className="mx-auto max-w-3xl">
        <ContentBlockRenderer blocks={content.blocks} />
      </div>
    </article>
  );
}
