import type { SiteContentPublicDetail } from "@gooes/domain";

const SITE_ORIGIN = "https://www.goodcms.cn";

type ArticleDetail = Extract<SiteContentPublicDetail, { contentType: "article" }>;
type CaseDetail = Extract<SiteContentPublicDetail, { contentType: "case" }>;
type CityDetail = Extract<SiteContentPublicDetail, { contentType: "city" }>;

interface ArticleJsonLd {
  readonly "@context": "https://schema.org";
  readonly "@type": "Article";
  readonly headline: string;
  readonly description: string;
  readonly datePublished: string;
  readonly author: { readonly "@type": "Person"; readonly name: string };
  readonly image?: string;
  readonly mainEntityOfPage: string;
  readonly publisher: { readonly "@type": "Organization"; readonly name: "好店智装云" };
}

interface CreativeWorkJsonLd {
  readonly "@context": "https://schema.org";
  readonly "@type": "CreativeWork";
  readonly name: string;
  readonly description: string;
  readonly datePublished: string;
  readonly image?: string;
  readonly contentLocation: { readonly "@type": "Place"; readonly name: string };
  readonly about: string;
  readonly provider: { readonly "@type": "Organization"; readonly name: "好店智装云" };
}

interface CityJsonLd {
  readonly "@context": "https://schema.org";
  readonly "@graph": readonly [
    {
      readonly "@type": "BreadcrumbList";
      readonly itemListElement: readonly [
        {
          readonly "@type": "ListItem";
          readonly position: 1;
          readonly name: "首页";
          readonly item: string;
        },
        {
          readonly "@type": "ListItem";
          readonly position: 2;
          readonly name: string;
          readonly item: string;
        },
      ];
    },
    {
      readonly "@type": "Service";
      readonly name: string;
      readonly description: string;
      readonly areaServed: { readonly "@type": "City"; readonly name: string };
      readonly provider: { readonly "@type": "Organization"; readonly name: "好店智装云" };
      readonly url: string;
    },
  ];
}

type SupportedJsonLd = ArticleJsonLd | CreativeWorkJsonLd | CityJsonLd;

export function serializeJsonLd(value: SupportedJsonLd): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function ArticleStructuredData({ content }: { readonly content: ArticleDetail }): React.JSX.Element {
  const url = resolveCanonicalUrl(content.canonicalUrl, `/articles/${content.slug}`);
  const data: ArticleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: content.title,
    description: content.seoDescription ?? content.summary ?? content.title,
    datePublished: content.metadata.displayPublishedAt,
    author: { "@type": "Person", name: content.metadata.author },
    ...(content.cover ? { image: content.cover.src } : {}),
    mainEntityOfPage: url,
    publisher: { "@type": "Organization", name: "好店智装云" },
  };

  return <JsonLdScript data={data} />;
}

export function CaseStructuredData({ content }: { readonly content: CaseDetail }): React.JSX.Element {
  const data: CreativeWorkJsonLd = {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    name: content.title,
    description: content.seoDescription ?? content.summary ?? content.title,
    datePublished: content.publishedAt,
    ...(content.cover ? { image: content.cover.src } : {}),
    contentLocation: { "@type": "Place", name: content.metadata.city },
    about: `${content.metadata.areaSquareMeters} 平方米${content.metadata.decorationType}装修案例`,
    provider: { "@type": "Organization", name: "好店智装云" },
  };

  return <JsonLdScript data={data} />;
}

export function CityStructuredData({ content }: { readonly content: CityDetail }): React.JSX.Element {
  const url = resolveCanonicalUrl(content.canonicalUrl, `/cities/${content.slug}`);
  const data: CityJsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "首页", item: SITE_ORIGIN },
          { "@type": "ListItem", position: 2, name: content.metadata.cityName, item: url },
        ],
      },
      {
        "@type": "Service",
        name: `${content.metadata.cityName}装修协作服务`,
        description: content.metadata.localServiceIntroduction,
        areaServed: { "@type": "City", name: content.metadata.cityName },
        provider: { "@type": "Organization", name: "好店智装云" },
        url,
      },
    ],
  };

  return <JsonLdScript data={data} />;
}

function JsonLdScript({ data }: { readonly data: SupportedJsonLd }): React.JSX.Element {
  return (
    <script
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
      type="application/ld+json"
    />
  );
}

function resolveCanonicalUrl(canonicalUrl: string | null, path: string): string {
  return canonicalUrl ?? new URL(path, SITE_ORIGIN).toString();
}
