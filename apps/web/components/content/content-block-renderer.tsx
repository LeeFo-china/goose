import type { SiteContentPublicBlock } from "@gooes/domain";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface ContentBlockRendererProps {
  readonly blocks: readonly SiteContentPublicBlock[];
}

export function ContentBlockRenderer({
  blocks,
}: ContentBlockRendererProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-8">
      {blocks.map((block, index) => {
        const key = `${block.type}-${index}`;

        switch (block.type) {
          case "paragraph":
            return (
              <p
                className="whitespace-pre-line text-base leading-8 text-muted-foreground sm:text-lg"
                key={key}
              >
                {block.text}
              </p>
            );
          case "heading":
            return block.level === 2 ? (
              <h2
                className="pt-4 text-3xl font-semibold tracking-tight sm:text-4xl"
                key={key}
              >
                {block.text}
              </h2>
            ) : (
              <h3
                className="pt-2 text-2xl font-semibold tracking-tight sm:text-3xl"
                key={key}
              >
                {block.text}
              </h3>
            );
          case "image":
            return (
              <figure className="overflow-hidden rounded-lg bg-muted" key={key}>
                <img
                  alt={block.asset.alt}
                  className="h-auto w-full object-cover"
                  decoding="async"
                  height={block.asset.height}
                  loading="lazy"
                  src={block.asset.src}
                  width={block.asset.width}
                />
              </figure>
            );
          case "quote":
            return (
              <figure
                className="flex flex-col gap-4 border-y py-8 text-foreground"
                key={key}
              >
                <blockquote className="text-balance text-2xl font-medium leading-10 sm:text-3xl">
                  “{block.text}”
                </blockquote>
                {block.attribution ? (
                  <figcaption className="text-sm text-muted-foreground">
                    {block.attribution}
                  </figcaption>
                ) : null}
              </figure>
            );
          case "list": {
            const List = block.style === "ordered" ? "ol" : "ul";
            return (
              <List
                className={
                  block.style === "ordered"
                    ? "flex list-decimal flex-col gap-3 pl-6 text-base leading-8 marker:font-semibold sm:text-lg"
                    : "flex list-disc flex-col gap-3 pl-6 text-base leading-8 marker:text-primary sm:text-lg"
                }
                key={key}
              >
                {block.items.map((item, itemIndex) => (
                  <li key={`${key}-${itemIndex}`}>{item}</li>
                ))}
              </List>
            );
          }
          case "callout":
            return (
              <Alert
                className={block.tone === "warning" ? "border-warning/60 bg-warning/10" : "bg-muted/60"}
                key={key}
              >
                <AlertTitle>
                  {block.tone === "warning" ? "注意：" : "提示："}
                  {block.title}
                </AlertTitle>
                <AlertDescription>
                  <p className="whitespace-pre-line leading-7">{block.text}</p>
                </AlertDescription>
              </Alert>
            );
          case "metrics":
            return (
              <dl
                className="grid grid-cols-2 gap-x-6 gap-y-8 border-y py-8 sm:grid-cols-4"
                key={key}
              >
                {block.items.map((item, itemIndex) => (
                  <div className="flex min-w-0 flex-col gap-2" key={`${key}-${itemIndex}`}>
                    <dt className="text-sm text-muted-foreground">{item.label}</dt>
                    <dd className="break-words text-2xl font-semibold tabular-nums sm:text-3xl">
                      {item.value}
                    </dd>
                  </div>
                ))}
              </dl>
            );
          case "gallery":
            return (
              <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2" key={key}>
                {block.images.map((asset, imageIndex) => (
                  <li className="overflow-hidden rounded-lg bg-muted" key={`${asset.fileId}-${imageIndex}`}>
                    <img
                      alt={asset.alt}
                      className="h-full max-h-[34rem] w-full object-cover"
                      decoding="async"
                      height={asset.height}
                      loading="lazy"
                      src={asset.src}
                      width={asset.width}
                    />
                  </li>
                ))}
              </ul>
            );
        }
      })}
    </div>
  );
}
