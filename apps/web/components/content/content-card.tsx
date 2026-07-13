import Link from "next/link";
import type { SiteContentPublicSummary } from "@gooes/domain";

const CONTENT_CARD_IMAGE_SIZES = [
  "(min-width: 1280px) 528px",
  "(min-width: 1024px) calc(50vw - 48px)",
  "(min-width: 768px) calc(50vw - 40px)",
  "(min-width: 640px) calc(100vw - 48px)",
  "calc(100vw - 32px)",
].join(", ");

interface ContentCardProps {
  readonly content: SiteContentPublicSummary;
  readonly priority?: boolean;
}

export function ContentCard({ content, priority = false }: ContentCardProps): React.JSX.Element {
  const collection = content.contentType === "article" ? "articles" : content.contentType === "case" ? "cases" : "cities";
  const meta = getSummaryMeta(content);

  return (
    <article className="group flex min-w-0 flex-col gap-5">
      {content.cover ? (
        <Link
          className="overflow-hidden rounded-lg bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring"
          href={`/${collection}/${content.slug}`}
        >
          <img
            alt={content.cover.alt}
            className="aspect-[16/10] h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02] motion-reduce:transition-none"
            decoding="async"
            fetchPriority={priority ? "high" : "auto"}
            height={content.cover.height}
            loading={priority ? "eager" : "lazy"}
            sizes={CONTENT_CARD_IMAGE_SIZES}
            src={content.cover.src}
            width={content.cover.width}
          />
        </Link>
      ) : null}
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">{meta}</p>
        <h2 className="text-2xl font-semibold tracking-tight">
          <Link
            className="rounded-sm outline-none hover:underline hover:underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring"
            href={`/${collection}/${content.slug}`}
          >
            {content.title}
          </Link>
        </h2>
        {content.summary ? (
          <p className="line-clamp-3 max-w-[65ch] text-base leading-7 text-muted-foreground">
            {content.summary}
          </p>
        ) : null}
      </div>
    </article>
  );
}

function getSummaryMeta(content: SiteContentPublicSummary): string {
  switch (content.contentType) {
    case "article":
      return `${content.metadata.category} / ${formatDate(content.metadata.displayPublishedAt)}`;
    case "case":
      return `${content.metadata.city} / ${content.metadata.areaSquareMeters} 平方米 / ${content.metadata.decorationType}`;
    case "city":
      return content.metadata.cityName;
  }
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "long",
    timeZone: "Asia/Shanghai",
  }).format(new Date(value));
}
